// 데모: 진짜 세션 없이도 친구들이 일하는 모습을 보여 준다.
// 메인 프로세스와 똑같은 메시지({t:'agent'} 등)를 app.handle 로 흘려보낸다.
import { newAgent, applyActivity, setStatus, publicAgent } from '../shared/agent-state.js';
import { toolActivity } from '../shared/activity.js';
import { getLang, LANGS } from '../shared/i18n.js';

// 데모 대본: 키 → [한국어, English, 日本語, 简体中文]
const TEXT = {
  'readme': ['README 다듬어 줘', 'Polish the README', 'README を整えて', '帮我润色一下 README'],
  'A.name': ['로그인 버그 수정', 'Fix login bug', 'ログインのバグ修正', '修复登录 bug'],
  'A.prompt': ['로그인하면 가끔 401 나는 버그 고쳐줘', 'Fix the bug where login sometimes returns 401', 'ログインするとたまに 401 になるバグを直して', '修一下登录时偶尔返回 401 的 bug'],
  'A.say1': ['먼저 인증 관련 코드를 찾아볼게요.', 'Let me find the auth code first.', 'まず認証まわりのコードを探しますね。', '我先找找认证相关的代码。'],
  'A.sub': ['토큰 갱신 흐름 조사', 'Trace the token refresh flow', 'トークン更新の流れを調査', '调查令牌刷新流程'],
  'A.subSay': ['만료 시간 비교에서 초/밀리초가 섞여 있어요.', 'Expiry checks mix seconds and milliseconds.', '有効期限の比較で秒とミリ秒が混ざっています。', '过期时间比较里秒和毫秒混用了。'],
  'A.say2': ['원인을 찾았어요. 만료 시간 단위가 달랐네요.', 'Found it: the expiry units were different.', '原因が分かりました。有効期限の単位が違っていました。', '找到原因了，过期时间的单位不一致。'],
  'A.test': ['인증 테스트 실행', 'Run auth tests', '認証テストを実行', '运行认证测试'],
  'A.retest': ['인증 테스트 다시 실행', 'Re-run auth tests', '認証テストを再実行', '重新运行认证测试'],
  'A.say3': ['테스트 통과! 토큰 만료 단위를 통일해서 고쳤어요.', 'Tests pass! Unified the token expiry units.', 'テスト通過！トークン有効期限の単位をそろえて直しました。', '测试通过！统一了令牌过期时间的单位。'],
  'B.name': ['주간 리포트 자동화', 'Automate weekly report', '週次レポートの自動化', '周报自动化'],
  'B.prompt': ['주간 매출 리포트를 슬랙으로 자동 발송하게 만들어줘', 'Send the weekly sales report to Slack automatically', '週次の売上レポートを Slack に自動送信して', '让每周销售报告自动发到 Slack'],
  'B.sub1': ['리포트 파이프라인 설계', 'Design the report pipeline', 'レポートのパイプライン設計', '设计报告流水线'],
  'B.sub2': ['매출 쿼리 검증', 'Verify the sales query', '売上クエリの検証', '验证销售查询'],
  'B.query': ['매출 쿼리 실행', 'Run sales query', '売上クエリを実行', '运行销售查询'],
  'B.subSay': ['지난주 대비 숫자가 맞아요.', 'Numbers match last week.', '先週と比べて数字は合っています。', '和上周对比，数字没问题。'],
  'B.dry': ['드라이런', 'Dry run', 'ドライラン', '试运行'],
  'B.ask': ['어느 채널로 보낼까요?', 'Which channel should it post to?', 'どのチャンネルに送りますか？', '要发到哪个频道？'],
  'B.say': ['#sales 채널로 매주 월요일 9시에 보내도록 설정했어요.', 'Set it to post to #sales every Monday at 9.', '毎週月曜 9 時に #sales へ送るよう設定しました。', '已设置为每周一 9 点发到 #sales 频道。'],
  'C.name': ['API 문서 정리', 'Tidy up API docs', 'API ドキュメント整理', '整理 API 文档'],
};
const say = (k) => TEXT[k][Math.max(0, LANGS.indexOf(getLang()))];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let started = false;
let n = 0;

export function startDemo(app) {
  if (started) return;
  started = true;
  const emit = (m) => app.handle(m);
  const push = (a) => emit({ t: 'agent', agent: publicAgent(a) });
  const act = (a, activity) => {
    applyActivity(a, activity);
    emit({ t: 'activity', key: a.key, activity });
    push(a);
  };
  const status = (a, s) => {
    const from = a.status;
    if (setStatus(a, s)) {
      emit({ t: 'activity', key: a.key, activity: { type: 'status', from, to: s, ts: Date.now() } });
      push(a);
    }
  };
  const now = () => Date.now();

  const ctx = (a) => ({
    a,
    async tool(name, input, ms, isError = false) {
      const id = `demo_${++n}`;
      act(a, toolActivity(name, input, id, now()));
      await sleep(ms);
      act(a, { type: 'tool_result', id, isError, ts: now() });
    },
    async say(text, ms = 2500) {
      act(a, { type: 'text', text, ts: now() });
      await sleep(ms);
    },
    async think(ms = 2000) {
      act(a, { type: 'thinking', text: '', ts: now() });
      await sleep(ms);
    },
    prompt(text) {
      act(a, { type: 'prompt', text, ts: now() });
    },
    async sub(agentType, description, script, background = false) {
      const id = `demo_${++n}`;
      act(a, toolActivity('Agent', { description, subagent_type: agentType, run_in_background: background }, id, now()));
      await sleep(700);
      const s = newAgent({
        key: `${a.sessionId}:sub${n}`,
        sessionId: a.sessionId,
        agentId: `sub${n}`,
        parentKey: a.key,
        kind: 'sub',
        agentType,
        description,
        depth: a.depth + 1,
        name: description,
        cwd: a.cwd,
        status: 'busy',
        seed: `demo-sub-${n}-${description}`,
      });
      push(s);
      act(s, { type: 'prompt', text: description, ts: now() });
      if (background) act(a, { type: 'tool_result', id, isError: false, ts: now() });
      await script(ctx(s));
      s.finished = true;
      setStatus(s, 'done');
      push(s);
      emit({ t: 'agent-remove', key: s.key, reason: 'finished' });
      if (!background) act(a, { type: 'tool_result', id, isError: false, ts: now() });
    },
  });

  const main = (id, name, cwd, minutesIdle = 0) => {
    const a = newAgent({ key: id, sessionId: id, kind: 'main', name, cwd, status: 'idle', seed: `${cwd}|${id}`, entrypoint: 'claude-desktop' });
    if (minutesIdle) {
      a.statusSince = now() - minutesIdle * 60_000;
      a.lastEventAt = a.statusSince;
      a.lastPrompt = say('readme');
    }
    push(a);
    return a;
  };

  // 세션 1: 버그 고치기 (Explore 도우미 하나)
  const A = main('demo-a', say('A.name'), '/Users/demo/web-app');
  (async () => {
    const c = ctx(A);
    await sleep(2500);
    for (;;) {
      status(A, 'busy');
      c.prompt(say('A.prompt'));
      await c.think(2200);
      await c.say(say('A.say1'), 2200);
      await c.tool('Grep', { pattern: 'refreshToken' }, 2600);
      await c.tool('Read', { file_path: '/Users/demo/web-app/src/auth/auth.service.ts' }, 3000);
      await c.sub('Explore', say('A.sub'), async (s) => {
        await s.tool('Glob', { pattern: 'src/**/*token*.ts' }, 2400);
        await s.tool('Read', { file_path: '/Users/demo/web-app/src/auth/token.store.ts' }, 3200);
        await s.think(1800);
        await s.tool('Grep', { pattern: 'expiresAt' }, 2600);
        await s.say(say('A.subSay'), 2500);
      });
      await c.say(say('A.say2'), 2500);
      await c.tool('Edit', { file_path: '/Users/demo/web-app/src/auth/token.store.ts' }, 3000);
      await c.tool('Bash', { command: 'npm test -- auth', description: say('A.test') }, 4000, true);
      await c.think(1800);
      await c.tool('Edit', { file_path: '/Users/demo/web-app/src/auth/token.store.spec.ts' }, 2500);
      await c.tool('Bash', { command: 'npm test -- auth', description: say('A.retest') }, 9000);
      await c.say(say('A.say3'), 1500);
      status(A, 'idle');
      await sleep(25000);
    }
  })();

  // 세션 2: 리포트 자동화 (병렬 도우미 둘 + 웹 검색)
  const B = main('demo-b', say('B.name'), '/Users/demo/data-pipeline');
  (async () => {
    const c = ctx(B);
    await sleep(6000);
    for (;;) {
      status(B, 'busy');
      c.prompt(say('B.prompt'));
      await c.think(2600);
      await c.tool('TodoWrite', {}, 1800);
      await c.tool('WebSearch', { query: 'Slack incoming webhook block kit 2026' }, 3500);
      await Promise.all([
        c.sub('Plan', say('B.sub1'), async (s) => {
          await s.think(2500);
          await s.tool('Read', { file_path: '/Users/demo/data-pipeline/jobs/weekly.py' }, 3000);
          await s.tool('Write', { file_path: '/Users/demo/data-pipeline/docs/plan.md' }, 3500);
        }, true),
        (async () => {
          await sleep(1200);
          await c.sub('general-purpose', say('B.sub2'), async (s) => {
            await s.tool('Bash', { command: 'psql -f queries/weekly_sales.sql', description: say('B.query') }, 4500);
            await s.tool('Read', { file_path: '/Users/demo/data-pipeline/queries/weekly_sales.sql' }, 2500);
            await s.say(say('B.subSay'), 2000);
          }, true);
        })(),
      ]);
      await c.tool('Write', { file_path: '/Users/demo/data-pipeline/jobs/slack_report.py' }, 3500);
      await c.tool('Bash', { command: 'python jobs/slack_report.py --dry-run', description: say('B.dry') }, 3500);
      await c.tool('AskUserQuestion', { questions: [{ question: say('B.ask') }] }, 6000);
      await c.say(say('B.say'), 1500);
      status(B, 'idle');
      await sleep(30000);
    }
  })();

  // 세션 3: 한참 쉬어서 자는 중
  main('demo-c', say('C.name'), '/Users/demo/api-docs', 12);
}

// ── 브라우저 미리보기용 가짜 데스크톱 ────────────────────────────

const FAKE = [
  { id: 1, owner: 'Code', title: 'auth.service.ts — web-app', x: 0.05, y: 0.42, w: 0.36, h: 0.4 },
  { id: 2, owner: 'iTerm2', title: 'zsh — npm test', x: 0.45, y: 0.55, w: 0.3, h: 0.3 },
  { id: 3, owner: 'Google Chrome', title: 'Slack API docs', x: 0.6, y: 0.25, w: 0.34, h: 0.36 },
  { id: 4, owner: 'Stickies', title: 'TODO', x: 0.36, y: 0.3, w: 0.14, h: 0.16 },
];

export function startFakeDesk(app) {
  const desk = document.getElementById('desk');
  const W = window.innerWidth;
  const H = window.innerHeight;
  const wins = FAKE.map((f) => ({ ...f, x: Math.round(f.x * W), y: Math.round(f.y * H), w: Math.round(f.w * W), h: Math.round(f.h * H) }));
  const els = new Map();
  for (const w of wins) {
    const el = document.createElement('div');
    el.className = `fakewin ${w.owner === 'Stickies' ? 'sticky' : ''}`;
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.textContent = `${w.owner} — ${w.title}`;
    el.appendChild(bar);
    desk.appendChild(el);
    els.set(w.id, el);
    bar.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      const ox = e.clientX - w.x;
      const oy = e.clientY - w.y;
      const mv = (ev) => {
        w.x = ev.clientX - ox;
        w.y = ev.clientY - oy;
        sync();
      };
      const up = () => {
        window.removeEventListener('mousemove', mv);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', mv);
      window.addEventListener('mouseup', up);
    });
    // 클릭하면 맨 앞으로
    el.addEventListener('mousedown', () => {
      wins.splice(wins.indexOf(w), 1);
      wins.unshift(w);
      sync();
    });
  }
  function sync() {
    wins.forEach((w, i) => {
      const el = els.get(w.id);
      Object.assign(el.style, { left: `${w.x}px`, top: `${w.y}px`, width: `${w.w}px`, height: `${w.h}px`, zIndex: String(100 - i) });
    });
    app.handle({ t: 'windows', windows: wins.map(({ id, owner, x, y, w: ww, h }) => ({ id, owner, kind: 'window', x, y, w: ww, h })) });
  }
  sync();
}
