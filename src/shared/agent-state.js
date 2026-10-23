// 에이전트 하나의 상태를 활동들로부터 쌓아 올린다.
// 메인 프로세스가 진짜 상태를 들고 있고, 렌더러에는 publicAgent() 결과를 보낸다.

const LOG_MAX = 30;
const PENDING_MAX = 8;

/**
 * @param {object} f
 * @param {string} f.key        메인: sessionId, 서브: sessionId:agentId
 * @param {'main'|'sub'} f.kind
 */
export function newAgent(f) {
  const now = Date.now();
  return {
    key: f.key,
    sessionId: f.sessionId,
    agentId: f.agentId ?? null,
    parentKey: f.parentKey ?? null,
    kind: f.kind,
    agentType: f.agentType ?? null,
    description: f.description ?? '',
    depth: f.depth ?? 0,
    name: f.name ?? '',
    cwd: f.cwd ?? '',
    entrypoint: f.entrypoint ?? '',
    seed: f.seed ?? f.key,
    status: f.status ?? 'idle',
    statusSince: now,
    finished: false,
    current: null,
    pending: [],
    lastPrompt: '',
    lastText: '',
    task: '', // 할 일 목록에서 지금 하고 있는 일
    plan: null, // 데스크톱 앱 할 일 목록 [{content, status}]
    lastEventAt: 0,
    createdAt: now,
    log: [],
    counts: { tools: 0, errors: 0 },
  };
}

function pushLog(a, item) {
  a.log.push(item);
  if (a.log.length > LOG_MAX) a.log.splice(0, a.log.length - LOG_MAX);
}

export function setStatus(a, status, at = Date.now()) {
  if (a.status === status) return false;
  a.status = status;
  a.statusSince = at;
  if (status === 'idle') a.pending = [];
  return true;
}

/** 활동 하나를 반영한다. 상태가 바뀌었으면 true */
export function applyActivity(a, act) {
  if (!act) return false;
  const ts = act.ts || Date.now();
  if (act.type !== 'title') a.lastEventAt = Math.max(a.lastEventAt, ts);

  switch (act.type) {
    case 'tool': {
      a.pending.push({ id: act.id, name: act.name, cat: act.cat, icon: act.icon, vk: act.vk, verb: act.verb, arg: act.arg, ts, description: act.description });
      if (a.pending.length > PENDING_MAX) a.pending.splice(0, a.pending.length - PENDING_MAX);
      a.current = { type: 'tool', ts };
      a.counts.tools++;
      if (act.task != null) a.task = act.task;
      if (act.plan) applyPlan(a, act.plan);
      pushLog(a, { ts, icon: act.icon, vk: act.vk, verb: act.verb, arg: act.arg }); // 글은 화면에서 지금 언어로 (i18n logText)
      return true;
    }
    case 'tool_result': {
      const i = a.pending.findIndex((p) => p.id === act.id);
      if (i >= 0) a.pending.splice(i, 1);
      a.current = { type: 'between', ts };
      if (act.isError) {
        a.counts.errors++;
        pushLog(a, { ts, icon: '💦', tk: 'log.error' });
      }
      return true;
    }
    case 'thinking':
      a.current = { type: 'thinking', ts, text: act.text || '' };
      return true;
    case 'text':
      a.lastText = act.text;
      a.current = { type: 'text', ts, text: act.text };
      pushLog(a, { ts, icon: '💬', text: act.text });
      return true;
    case 'prompt':
      a.lastPrompt = act.text;
      a.task = '';
      a.pending = [];
      a.current = { type: 'prompt', ts, text: act.text };
      pushLog(a, { ts, icon: '📨', text: act.text });
      return true;
    case 'command':
      pushLog(a, { ts, icon: '⚙️', text: act.text });
      return true;
    case 'interrupt':
      a.pending = [];
      a.current = { type: 'interrupt', ts };
      pushLog(a, { ts, icon: '✋', tk: 'log.interrupted' });
      return true;
    case 'notify':
      pushLog(a, act.text ? { ts, icon: '📬', text: act.text } : { ts, icon: '📬', tk: 'log.notify' });
      return true;
    case 'turn_end':
      a.pending = [];
      a.current = { type: 'turn_end', ts };
      return true;
    default:
      return false;
  }
}

function applyPlan(a, p) {
  if (p.items) a.plan = p.items.map((x) => ({ ...x }));
  const list = a.plan;
  if (list) {
    const cur = list.findIndex((x) => x.status === 'in_progress');
    if (p.advance) {
      if (cur >= 0) list[cur].status = 'completed';
      const next = list.findIndex((x) => x.status === 'pending');
      if (next >= 0) list[next].status = 'in_progress';
    } else if (p.start && list[p.start - 1]) {
      if (cur >= 0) list[cur].status = 'completed';
      list[p.start - 1].status = 'in_progress';
    }
  }
  a.task = list?.find((x) => x.status === 'in_progress')?.content || '';
}

/** 렌더러로 보낼 직렬화 가능한 사본 */
export function publicAgent(a) {
  return {
    key: a.key,
    sessionId: a.sessionId,
    agentId: a.agentId,
    parentKey: a.parentKey,
    kind: a.kind,
    agentType: a.agentType,
    description: a.description,
    depth: a.depth,
    name: a.name,
    cwd: a.cwd,
    entrypoint: a.entrypoint,
    seed: a.seed,
    status: a.status,
    statusSince: a.statusSince,
    finished: a.finished,
    current: a.current,
    pending: a.pending.slice(),
    lastPrompt: a.lastPrompt,
    lastText: a.lastText,
    task: a.task,
    lastEventAt: a.lastEventAt,
    createdAt: a.createdAt,
    log: a.log.slice(-12),
    counts: { ...a.counts },
  };
}
