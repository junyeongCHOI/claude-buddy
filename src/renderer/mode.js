// 에이전트 상태 → 캐릭터가 할 일(mode)과 화이트보드에 쓸 글
import { t, toolVerb, logText } from '../shared/i18n.js';

export const SLEEP_AFTER = 10 * 60_000;
export const LISTEN_FOR = 6000; // 새 요청을 받고 놀라 있는 시간
export const TALK_FOR = 15_000; // 답한 뒤 말하는 얼굴로 있는 시간
export const THINK_HOLD = 4000; // 생각 중이어도 이전 보드 글을 남겨 두는 시간
export const DONE_FOR = 20_000; // 일을 끝내고 '다 했어요'를 보여 주는 시간

/**
 * work       도구 실행 중 (화이트보드에 무슨 도구인지)
 * supervise  서브에이전트 기다리는 중
 * waiting    사용자 확인이 필요함
 * listening  방금 요청을 받음
 * talking    방금 말함
 * thinking   생각 중 (도구와 도구 사이)
 * idle       쉬는 중 (돌아다님)
 * sleep      오래 쉼
 * returning  서브에이전트가 일을 마치고 보고하러 감
 */
export function deriveMode(a, now) {
  if (a.finished) return 'returning';
  if (a.status === 'waiting') return 'waiting';
  const busy = a.kind === 'sub' || a.status === 'busy';
  if (busy) {
    const p = a.pending?.length ? a.pending[a.pending.length - 1] : null;
    if (p) {
      if (p.cat === 'ask') return 'waiting';
      if (p.cat === 'agent') return 'supervise';
      return 'work';
    }
    const cur = a.current;
    if (cur?.type === 'prompt' && now - cur.ts < LISTEN_FOR) return 'listening';
    if (cur?.type === 'text' && now - cur.ts < TALK_FOR) return 'talking';
    return 'thinking';
  }
  const since = now - Math.max(a.statusSince || 0, a.lastEventAt || 0);
  return since > SLEEP_AFTER ? 'sleep' : 'idle';
}

export const BUSY_MODES = new Set(['work', 'supervise', 'waiting', 'listening', 'talking', 'thinking']);

/** 화이트보드 글 [첫 줄, 둘째 줄]. thinking 은 잠깐이면 이전 글을 그대로 둔다 (null) */
export function boardText(a, mode) {
  const p = a.pending?.length ? a.pending[a.pending.length - 1] : null;
  switch (mode) {
    case 'work':
      return p ? [`${p.icon} ${toolVerb(p)}`, p.arg || ''] : null;
    case 'supervise':
      return [t('bt.supervise'), p?.description || p?.arg || ''];
    case 'waiting':
      return [t('bt.waiting'), p?.cat === 'ask' ? p.arg || toolVerb(p) : t('bt.lookClaude')];
    case 'listening':
      return [t('bt.listening'), a.lastPrompt || ''];
    case 'talking':
      return [t('bt.talking'), a.current?.text || a.lastText || ''];
    case 'thinking': {
      // 생각하는 동안에도 실제로 붙들고 있는 일을 보여 준다: 할 일 목록의 지금 항목 → 방금 한 일
      const last = lastAction(a);
      if (a.task) return [`🎯 ${a.task}`, last ? t('bt.justDid', { text: last }) : ''];
      if (last) return [last, t('bt.choosingNext')];
      return [t('bt.thinking'), ''];
    }
    case 'done':
      return [t('bt.done'), a.lastText || ''];
    case 'idle':
      return [t('bt.idle'), a.lastPrompt ? t('bt.lastPrompt', { text: a.lastPrompt }) : ''];
    case 'returning':
      return [t('bt.returning'), a.description || ''];
    default:
      return null;
  }
}

// 가장 최근에 한 도구 일 (말·요청은 빼고)
function lastAction(a) {
  for (let i = (a.log?.length || 0) - 1; i >= 0; i--) {
    const it = a.log[i];
    if (it.icon === '💬' || it.icon === '📨' || it.icon === '⚙️') continue;
    return `${it.icon} ${logText(it)}`;
  }
  return '';
}

/** 캐릭터 옆 말풍선에 쓸 짧은 한 줄: 지금 하는 일 */
export function bubbleText(a, mode) {
  const p = a.pending?.length ? a.pending[a.pending.length - 1] : null;
  if (mode === 'work' && p) return `${p.icon} ${p.arg || toolVerb(p)}`;
  if (mode === 'supervise') return `🐣 ${p?.description || p?.arg || t('bubble.supervise')}`;
  if (a.task) return `🎯 ${a.task}`;
  return lastAction(a) || '💭';
}

// 도구 종류 → 가서 일할 창 (앞 묶음부터 시도)
export const WORK_PLACES = {
  read: [['editor'], ['any']],
  write: [['editor'], ['any']],
  run: [['terminal'], ['editor'], ['any']],
  web: [['browser'], ['any']],
  plan: [['notes', 'widget'], ['any']],
  skill: [['any']],
  mcp: [['any']],
  other: [['any']],
  ask: [['claude', 'terminal'], ['any']],
};

export function statusLabel(mode) {
  const key = `st.${mode}`;
  const s = t(key);
  return s === key ? mode : s;
}
