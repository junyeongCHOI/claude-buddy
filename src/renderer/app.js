// 렌더러 진입점: 메인 프로세스(또는 데모)에서 오는 메시지를 받아 캐릭터·화이트보드·패널을 움직인다.
// 좌표는 모두 전역(macOS 화면) 좌표이고, 모니터마다 하나씩 있는 화면(View)에 나눠 그린다.
import { World } from './world.js';
import { View, openChildView } from './views.js';
import { loadSprites, ANIMALS, pickFur, fursOf, hash, TEAM_COLORS, metaOf, FURS } from './sprites.js';
import { Character } from './character.js';
import { WhiteBoard, useBoardFonts } from './board.js';
import { Panel, Card } from './panel.js';
import { deriveMode, statusLabel, boardText } from './mode.js';
import { initEffects, poof } from './effects.js';
import { startDemo, startFakeDesk } from './demo.js';
import { t, setLang, resolveLang, agentLabel, LANGS } from '../shared/i18n.js';

const bridge = window.buddy || null;
const params = new URLSearchParams(location.search);
// 캐릭터 크기 (픽셀 배율: [메인, 서브]) — 레티나에서 픽셀이 고르게 보이도록 0.5 단위
const SIZES = { 0.75: [1, 0.75], 1: [1.5, 1], 1.5: [2, 1.5] };
// 픽셀 캐릭터는 30fps 로 충분하다 (60fps 대비 CPU·GPU 절반). 아무도 안 움직이면 12fps 로 더 쉰다.
const FRAME_MS = 1000 / 30;
const CALM_MS = 1000 / 12;

const app = {
  world: new World(),
  agents: new Map(),
  chars: new Map(),
  boards: new Map(),
  teams: new Map(),
  views: new Map(), // 모니터 id → View
  home: new View('home', { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight }, window),
  config: { showPanel: true, showSleeping: true, scale: 1 },
  seen: new Set(), // 사용자가 지금 Claude Code(앱·터미널)에서 보고 있는 세션 id
  native: !!bridge, // Electron 안 (브라우저 미리보기가 아님)
  handle,
  onCharGone,
  openSession,
  viewAt,
  gather,
  setConfig,
  openMenu,
};
app.views.set(app.home.id, app.home);
window.buddyApp = app; // 디버깅용

let panel;
let card;
let surfacesDirty = true;
let spawnIndex = 0;

/** 전역 좌표 (x, y) 가 있는 모니터 화면 */
function viewAt(x, y) {
  return app.views.get(app.world.displayAt(x, y).id) || app.home;
}

// ── 모니터 화면 ───────────────────────────────────────────

// 닫히는 화면에 있던 것들을 home 으로 옮긴다
function evacuate(v) {
  for (const ch of app.chars.values()) {
    if (ch.view !== v) continue;
    app.home.stage.appendChild(ch.el);
    ch.view = app.home;
  }
  for (const b of app.boards.values()) if (b.view === v) b.setView(app.home);
  if (card?.view === v) {
    app.home.ui.appendChild(card.el);
    card.view = app.home;
  }
  if (panel?.view === v) panel.reset();
}

function setDisplays(list, homeId) {
  const homeD = list.find((d) => String(d.id) === String(homeId)) || list[0];
  if (!homeD) return;
  const newHome = String(homeD.id);
  const homeChanged = app.home.id !== newHome;
  // 이 문서(home)가 맡는 모니터가 바뀌면, 그 모니터에 열어 둔 자식 화면은 닫는다
  const clash = app.views.get(newHome);
  if (clash && clash !== app.home) {
    evacuate(clash);
    clash.win.close();
  }
  app.views.delete(app.home.id);
  app.home.id = newHome;
  app.home.setRect(homeD);
  app.views.set(newHome, app.home);

  const ids = new Set(list.map((d) => String(d.id)));
  for (const [id, v] of [...app.views]) {
    if (v === app.home || ids.has(id)) continue;
    evacuate(v);
    v.win.close();
    app.views.delete(id);
  }
  app.world.setDisplays(list, newHome);
  if (bridge) {
    for (const d of list) {
      const id = String(d.id);
      if (id === newHome) continue;
      const v = app.views.get(id);
      if (v) {
        v.setRect(d);
        continue;
      }
      const nv = openChildView(d);
      if (!nv) continue;
      app.views.set(id, nv);
      bindView(nv);
    }
  }
  for (const b of app.boards.values()) b.place();
  panel?.afterDisplays(homeChanged);
  surfacesDirty = true;
}

// ── 생김새 ───────────────────────────────────────────────

function teamOf(sessionId) {
  if (app.teams.has(sessionId)) return app.teams.get(sessionId);
  const live = new Set([...app.agents.values()].map(sessionSeed));
  const used = new Map();
  for (const [sid, c] of app.teams) if (live.has(sid)) used.set(c, (used.get(c) || 0) + 1);
  const start = hash(sessionId) % TEAM_COLORS.length;
  let best = TEAM_COLORS[start];
  let bestN = Infinity;
  for (let i = 0; i < TEAM_COLORS.length; i++) {
    const c = TEAM_COLORS[(start + i) % TEAM_COLORS.length];
    const n = used.get(c) || 0;
    if (n < bestN) {
      best = c;
      bestN = n;
    }
  }
  app.teams.set(sessionId, best);
  return best;
}

// 세션의 고유값 (메인 에이전트 시드: 데스크톱 앱 사이드바 id 등) — 팀 색·보드 저장에 쓴다
function sessionSeed(a) {
  return a.kind === 'main' ? a.seed : app.agents.get(a.sessionId)?.seed || a.sessionId;
}

function lookFor(a) {
  const team = teamOf(sessionSeed(a));
  const [mainPx, subPx] = SIZES[app.config.scale] || SIZES[1];
  if (a.kind === 'main') {
    // 같은 세션은 언제 켜도 같은 동물 (다른 세션과 겹칠 수는 있지만 털색·팀 색이 다르다)
    const animal = ANIMALS[hash(a.seed) % ANIMALS.length];
    return { animal, fur: pickFur(animal, a.seed), team, px: mainPx };
  }
  // 서브에이전트는 부모와 같은 동물에 털색만 아무거나 (부모 색은 빼고)
  const parent = app.chars.get(a.parentKey);
  const animal = parent?.animal || ANIMALS[hash(a.seed) % ANIMALS.length];
  const furs = fursOf(animal).filter((f) => f !== parent?.fur);
  const fur = furs.length ? furs[Math.floor(Math.random() * furs.length)] : pickFur(animal, a.seed);
  return { animal, fur, team, px: subPx };
}

// ── 화이트보드 ────────────────────────────────────────────

// 메인 보드의 위치·크기·접힘은 세션 고유값으로 저장 (서브에이전트 보드는 잠깐이라 저장 안 함)
const UI_PREFIX = 'buddy.ui.';
const UI_TTL = 30 * 24 * 3600_000;

function uiKey(boardKey) {
  const a = app.agents.get(boardKey);
  return a?.kind === 'main' ? UI_PREFIX + a.seed : null;
}

function loadUi(key) {
  if (!key) return {};
  try {
    return JSON.parse(localStorage.getItem(key) || '{}') || {};
  } catch {
    return {};
  }
}

function saveUi(key, patch) {
  if (!key) return;
  localStorage.setItem(key, JSON.stringify({ ...loadUi(key), ...patch, at: Date.now() }));
}

// 오래 안 쓴 저장값과 예전 형식(buddy.board.*, buddy.fold.*)을 지운다
function pruneUi() {
  const now = Date.now();
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith('buddy.board.') || k.startsWith('buddy.fold.')) localStorage.removeItem(k);
    else if (k.startsWith(UI_PREFIX) && now - (loadUi(k).at || 0) > UI_TTL) localStorage.removeItem(k);
  }
}

function saveBoard(b) {
  saveUi(uiKey(b.key), { pos: { x: b.x, y: b.y }, manual: b.manual });
}

const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** 패널 자리 (전역 좌표) */
function panelRect() {
  const r = panel?.rect;
  if (!r || !r.w || !app.config.showPanel) return null;
  return r;
}

/** 패널이 있는 모니터 (패널을 숨겼으면 패널 디스플레이) — 새 보드 자리·모으기가 이 모니터로 */
function panelDisplay() {
  const r = panelRect();
  return r ? app.world.displayAt(r.x + r.w / 2, r.y + 10) : app.world.home;
}

// 자는 세션 보드는 자리를 차지하지 않는다
function awake(key) {
  const a = app.agents.get(key);
  return a && (app.chars.get(key)?.mode || deriveMode(a, Date.now())) !== 'sleep';
}

/** 패널이 있는 모니터에서 다른 보드·패널과 안 겹치는 자리에 놓는다 */
function placeFree(b) {
  const d = panelDisplay();
  b.placed = true;
  const taken = [...app.boards.values()]
    .filter((o) => o !== b && o.placed && app.agents.get(o.key)?.kind === 'main' && awake(o.key))
    .map((o) => ({ x: o.x - 10, y: o.y - 70, w: o.w + o.sideW + 30, h: Math.max(o.h, 90) + 150 }));
  const pr = panelRect();
  if (pr) taken.push({ x: pr.x - 20, y: pr.y - 20, w: pr.w + 40, h: pr.h + 40 });
  for (let x = d.x + 24; x < d.x + d.w - 320; x += 340) {
    for (let y = d.y + 90; y < d.y + d.h - 220; y += 30) {
      if (!taken.some((t) => overlap(t, { x, y, w: 300, h: 150 }))) return b.moveTo(x, y);
    }
  }
  b.moveTo(d.x + 24 + Math.random() * 300, d.y + 90 + Math.random() * 200);
}

const onSomeDisplay = (x, y) => app.world.displays.some((d) => x >= d.x - 40 && x < d.x + d.w - 60 && y >= d.y - 10 && y < d.y + d.h - 40);

function makeBoard(a, look) {
  const sideW = Math.round((metaOf(look.animal).charH || 34) * look.px * 1.25) + 10;
  const b = new WhiteBoard({ key: a.key, team: look.team, sideW, onChange: () => (surfacesDirty = true) });
  b.setView(app.home);
  app.boards.set(a.key, b);
  const key = uiKey(a.key);
  const ui = loadUi(key);
  b.manual = ui.manual || null;
  if (ui.pos && onSomeDisplay(ui.pos.x, ui.pos.y)) {
    b.moveTo(ui.pos.x, ui.pos.y, true);
    b.placed = true;
  } else if (a.kind === 'main' && awake(a.key)) placeFree(b);
  if (ui.collapsed) b.setCollapsed(true);
  if (key) saveUi(key, {}); // 쓰고 있다는 표시 (정리 대상에서 빠지게)
  // 자는 세션 보드는 깨어나서 처음 보일 때 자리를 잡는다 (루프에서)
  return b;
}

// 서브에이전트는 자기 보드 없이 부모 보드에 붙는다: 붙을 자리 번호를 나눠 주고, 보드 아래쪽에 서브별 한 줄씩 쓴다
function layoutSubs(now) {
  const bySlot = new Map(); // 보드 → 다음 자리 번호
  const rows = new Map(); // 보드 → 서브 줄들
  const subs = [...app.chars.values()].filter((c) => c.agent.kind === 'sub' && !c.dead && !c.flee).sort((p, q) => p.agent.createdAt - q.agent.createdAt);
  for (const ch of subs) {
    const b = ch.host;
    if (!b) continue;
    const slot = (bySlot.get(b) || 0) + 1;
    bySlot.set(b, slot);
    ch.slot = slot;
    const a = ch.agent;
    const mode = ch.mode || deriveMode(a, now);
    const lines = boardText(a, mode);
    const what = lines ? [lines[0], lines[1]].filter(Boolean).join(' ') : statusLabel(mode);
    const list = rows.get(b) || [];
    list.push({ key: a.key, color: FURS[ch.fur] || ch.team, who: a.agentType || t('helper'), text: what });
    rows.set(b, list);
  }
  for (const b of app.boards.values()) b.setSubs(rows.get(b) || []);
}

// ── 메시지 ───────────────────────────────────────────────

function upsertAgent(a, initial = false) {
  app.agents.set(a.key, a);
  const ch = app.chars.get(a.key);
  if (ch) {
    if (!ch.dead) {
      if (ch.leaving) ch.unbye();
      ch.setAgent(a);
    }
    return;
  }
  const look = lookFor(a);
  const b = a.kind === 'main' ? makeBoard(a, look) : null; // 서브에이전트는 부모 보드에 붙는다
  let spawn;
  const parent = a.kind === 'sub' ? app.chars.get(a.parentKey) : null;
  if (parent && !parent.dead) {
    spawn = { x: parent.x, y: parent.y - 10, vx: (Math.random() < 0.5 ? -1 : 1) * 150, vy: -520 };
    poof(parent.x, parent.y - 20, look.team);
  } else if (!b) {
    const d = panelDisplay();
    spawn = { x: d.x + 60 + Math.random() * (d.w - 120), y: d.y - 70, vx: 0, vy: 0 };
  } else {
    // 자기 보드 바로 위에서 톡 떨어진다 (보드가 없으면 패널 모니터 위에서)
    const s = b.dropSpot();
    const d = panelDisplay();
    const onScreen = b.placed && onSomeDisplay(s.x, s.y - 60);
    const x = onScreen ? s.x : d.x + 60 + Math.random() * (d.w - 120);
    const y = onScreen ? s.y - 60 - (initial ? (spawnIndex++ % 6) * 14 : 0) : d.y - 70;
    spawn = { x, y, vx: 0, vy: 0 };
  }
  const c = new Character(app, a, look, spawn);
  c.board = b;
  b?.setHeader(agentLabel(a), '');
  app.chars.set(a.key, c);
}

function removeAgent(key, reason) {
  const ch = app.chars.get(key);
  if (!ch || ch.dead) {
    app.agents.delete(key);
    return;
  }
  if (reason === 'finished') {
    const a = app.agents.get(key);
    if (a && !a.finished) upsertAgent({ ...a, finished: true });
  } else ch.bye();
}

function onCharGone(ch) {
  app.chars.delete(ch.key);
  app.agents.delete(ch.key);
  const b = app.boards.get(ch.key);
  if (b) {
    b.remove();
    app.boards.delete(ch.key);
    surfacesDirty = true;
  }
  if (card?.ch === ch) card.close();
  if (hoverChar === ch) hoverChar = null;
}

function applyConfig(c) {
  const scaleChanged = c.scale != null && c.scale !== app.config.scale && app.chars.size;
  Object.assign(app.config, c);
  panel?.show(app.config.showPanel);
  panel?.syncConfig();
  if (scaleChanged) location.reload();
}

/** 패널에서 설정 바꾸기 — 메인 프로세스가 저장하고 트레이 메뉴와 함께 모두에게 다시 알려 준다 */
function setConfig(patch) {
  if (bridge?.setConfig) bridge.setConfig(patch);
  else handle({ t: 'config', config: { ...app.config, ...patch } }); // 미리보기
}

/** 패널 ⋯ 버튼: 트레이 메뉴를 (x, y) 에 띄운다 (viewId 모니터 화면 기준 좌표) */
function openMenu(x, y, viewId) {
  bridge?.openMenu?.(x, y, viewId);
}

let shownLang = null;
/** 화면 언어 바꾸기: 고정된 글자들은 바로, 보드·패널 글은 다음 그리기에서 새 언어로 */
function applyLang(lang) {
  if (!lang || lang === shownLang) return;
  shownLang = lang;
  setLang(lang);
  useBoardFonts(lang);
  for (const v of app.views.values()) v.doc.documentElement.lang = lang;
  panel?.relabel();
  card?.relabel();
  for (const b of app.boards.values()) b.relabel();
  for (const ch of app.chars.values()) ch.relabel();
}

function handle(msg) {
  switch (msg.t) {
    case 'hello':
      applyLang(msg.lang);
      applyConfig(msg.config || {});
      if (msg.demo) startDemo(app);
      break;
    case 'displays':
      setDisplays(msg.displays, msg.home);
      break;
    case 'snapshot':
      for (const a of msg.agents.filter((x) => x.kind === 'main')) upsertAgent(a, true);
      for (const a of msg.agents.filter((x) => x.kind !== 'main')) upsertAgent(a, true);
      break;
    case 'agent':
      upsertAgent(msg.agent);
      break;
    case 'agent-remove':
      removeAgent(msg.key, msg.reason);
      break;
    case 'activity':
      app.chars.get(msg.key)?.onActivity(msg.activity);
      break;
    case 'windows':
      app.world.setWindows(msg.windows);
      break;
    case 'config':
      applyLang(msg.lang);
      applyConfig(msg.config);
      break;
    case 'reset-boards':
      resetBoards();
      break;
    case 'gather':
      gather();
      break;
    case 'seen':
      app.seen = new Set(msg.sessions);
      break;
    case 'cursor':
      // 오버레이 창 밖(숨긴 모니터 화면·메뉴 막대)에서 움직인 것. 창 안의 mousemove 가 더 정확하니 그게 최근이면 둔다
      if (Date.now() - (app.mouse?.at || 0) > 400) app.mouse = { x: msg.x, y: msg.y, view: viewAt(msg.x, msg.y), at: Date.now() };
      break;
    case 'outside-click': {
      // 다른 앱을 누른 클릭 (오버레이는 통과시키므로 창 위치 헬퍼가 알려 준다)
      const hit = pickAt(msg.x, msg.y);
      if (!(hit?.ch || hit?.el.closest('.wb, #panel, #card'))) card?.close();
      break;
    }
  }
}

// 사용자가 옮기거나 키운 보드를 모두 자동 배치·자동 크기로 되돌린다
function resetBoards() {
  for (const b of app.boards.values()) {
    const key = uiKey(b.key);
    if (key) localStorage.removeItem(key);
    b.setCollapsed(false);
    b.moved = false;
    b.placed = false;
    b.resetSize();
  }
  for (const b of app.boards.values()) if (b.visible && app.agents.get(b.key)?.kind === 'main') placeFree(b);
}

// 잃어버린 친구들 찾기: 보드는 패널 모니터에 다시 늘어놓고, 캐릭터는 그 가운데로 뿅 모은다
function gather() {
  card?.close();
  const d = panelDisplay();
  for (const b of app.boards.values()) {
    if (app.agents.get(b.key)?.kind === 'main') saveUi(uiKey(b.key), { pos: null });
    b.moved = false;
    b.placed = false;
  }
  for (const b of app.boards.values()) if (b.visible && app.agents.get(b.key)?.kind === 'main') placeFree(b);
  const list = [...app.chars.values()].filter((c) => !c.dead);
  const spread = Math.min(d.w * 0.6, list.length * 80);
  list.forEach((ch, i) => {
    poof(ch.x, ch.y - ch.h * 0.5, ch.team);
    const x = d.x + d.w / 2 - spread / 2 + (spread * (i + 0.5)) / list.length;
    ch.teleport(x, d.y + d.h * 0.3 - (i % 3) * 40);
  });
}

/** 그 캐릭터의 세션(서브에이전트면 부모 세션)이 돌고 있는 Claude 앱·터미널을 앞으로 가져온다 */
function openSession(ch) {
  if (bridge?.openSession) bridge.openSession(ch.agent.sessionId);
}


// 같은 자리에 겹치지 않게
function separate() {
  const list = [...app.chars.values()].filter((c) => c.phys === 'ground' && !c.dead);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (a.ride !== b.ride || Math.abs(a.y - b.y) > 2) continue;
      const dx = b.x - a.x;
      const min = (a.h + b.h) * 0.3;
      if (Math.abs(dx) >= min) continue;
      const push = (min - Math.abs(dx)) * 0.08 + 0.15;
      const s = dx >= 0 ? 1 : -1;
      a.nudge(-s * push);
      b.nudge(s * push);
    }
  }
}

// ── 마우스 (모든 모니터 화면에서 같은 처리, 좌표는 전역으로 바꿔서) ─────────

let drag = null;

function setInteractive(v, on) {
  if (!bridge || v.interactive === on) return;
  v.interactive = on;
  bridge.setInteractive(on, v.id);
}

function charFromEl(el) {
  const k = el?.closest?.('.buddy')?.dataset.key;
  return k ? app.chars.get(k) : null;
}

/** 화면 v 의 전역 좌표 (x, y) 에서 실제로 맞은 것: 캐릭터는 불투명한 픽셀일 때만, 아니면 그 아래 요소 */
function pickIn(v, x, y) {
  for (const el of v.doc.elementsFromPoint(x - v.x, y - v.y)) {
    const spr = el.closest('.spr');
    if (spr) {
      const ch = charFromEl(spr);
      if (ch && !ch.dead && ch.hitTest(x, y)) return { el, ch };
      continue;
    }
    return { el };
  }
  return null;
}

const pickAt = (x, y) => pickIn(viewAt(x, y), x, y);

let hoverChar = null;
let hoverSince = 0;

// 커서 아래가 바뀌면(커서가 움직였거나 캐릭터가 지나갔거나) 클릭 통과 여부와 호버를 다시 정한다
function refreshPointer(now) {
  const m = app.mouse;
  if (!m || drag) return;
  const hit = pickIn(m.view, m.x, m.y);
  setInteractive(m.view, !!(hit?.ch || hit?.el.closest('.wb, #panel, #card')));
  for (const v of app.views.values()) if (v !== m.view) setInteractive(v, false);
  const hover = hit?.ch || null;
  if (hover !== hoverChar) {
    hoverChar?.el.classList.remove('hover');
    hover?.el.classList.add('hover');
    hoverChar = hover;
    hoverSince = now;
  }
}

function onMove(e, v) {
  const x = v.x + e.clientX;
  const y = v.y + e.clientY;
  app.mouse = { x, y, view: v, at: Date.now() }; // 부르는 캐릭터가 커서 쪽으로 온다
  if (drag) drag.move(x, y);
  else refreshPointer(Date.now());
}

function onDown(e, v) {
  const gx = v.x + e.clientX;
  const gy = v.y + e.clientY;
  const hit = pickIn(v, gx, gy);
  const el = hit?.el || e.target;
  // 상세 카드는 카드 밖 아무 데나 누르면 닫는다 (캐릭터·보드·패널 행이면 아래에서 다시 연다)
  if (!el.closest('#card')) card?.close();
  if (el.closest('.cd-close, .cd-open, .pn-fold, .pn-gather, .pn-menu, .pn-pin')) return;
  const far = (x, y) => Math.hypot(x - gx, y - gy) > 4;

  if (hit?.ch) {
    const ch = hit.ch;
    const hist = [];
    drag = {
      moved: false,
      move(x, y) {
        if (!this.moved && far(x, y)) {
          this.moved = true;
          ch.grab();
        }
        if (!this.moved) return;
        ch.holdAt(x, y); // 다른 모니터로 끌고 가도 된다
        hist.push({ x, y, t: performance.now() });
        if (hist.length > 6) hist.shift();
      },
      end() {
        if (!this.moved) {
          ch.poke();
          card.open(ch);
          openSession(ch);
          return;
        }
        const a = hist[0];
        const b = hist[hist.length - 1];
        const dt = a && b ? Math.max(16, b.t - a.t) / 1000 : 1;
        ch.release(a ? (b.x - a.x) / dt : 0, a ? (b.y - a.y) / dt : 0);
      },
    };
  } else if (el.closest('.wb-fold')) {
    const b = app.boards.get(el.closest('.wb').dataset.key);
    b.setCollapsed(!b.collapsed);
    saveUi(uiKey(b.key), { collapsed: b.collapsed });
    e.preventDefault();
    return;
  } else if (el.closest('.wb-resize')) {
    const b = app.boards.get(el.closest('.wb').dataset.key);
    b.el.classList.add('dragging'); // 끄는 동안엔 크기 애니메이션 없이 바로 따라오게
    drag = {
      move(x, y) {
        b.resizeFromBottomLeft(x, y);
      },
      end() {
        b.el.classList.remove('dragging');
        saveBoard(b);
      },
    };
  } else if (el.closest('.wb')) {
    const b = app.boards.get(el.closest('.wb').dataset.key);
    const ox = gx - b.x;
    const oy = gy - b.y;
    b.el.classList.add('dragging');
    drag = {
      moved: false,
      move(x, y) {
        if (!this.moved && far(x, y)) this.moved = true;
        if (this.moved) b.moveTo(x - ox, y - oy, true); // 다른 모니터로 옮겨도 된다
      },
      end() {
        b.el.classList.remove('dragging');
        if (this.moved) saveBoard(b);
        else {
          const ch = app.chars.get(b.key);
          if (ch) {
            ch.ack();
            card.open(ch);
          }
        }
      },
    };
  } else if (el.closest('.pn-head')) {
    const ox = gx - panel.rect.x;
    const oy = gy - panel.rect.y;
    drag = {
      move(x, y) {
        panel.moveTo(x - ox, y - oy, { x, y }); // 커서가 다른 모니터로 가면 패널도 건너간다
      },
      end() {
        panel.savePos();
      },
    };
  } else if (el.closest('.pn-row')) {
    const ch = app.chars.get(el.closest('.pn-row').dataset.key);
    if (ch) {
      ch.ack();
      card.open(ch);
      ch.setEmote('joy', 900);
      ch.el.classList.add('pinged');
      setTimeout(() => ch.el.classList.remove('pinged'), 1200);
    }
    return;
  } else if (!el.closest('#card')) {
    return;
  }
  e.preventDefault();
}

function onUp() {
  if (!drag) return;
  const d = drag;
  drag = null;
  d.end();
}

function onDblClick(e) {
  const r = e.target.closest?.('.wb-resize');
  if (!r) return;
  const b = app.boards.get(r.closest('.wb').dataset.key);
  b.resetSize();
  saveUi(uiKey(b.key), { manual: null }); // 크기만 되돌린다 (위치는 저장 안 함)
}

function bindView(v) {
  v.win.addEventListener('mousemove', (e) => onMove(e, v));
  v.win.addEventListener('mousedown', (e) => onDown(e, v));
  v.win.addEventListener('mouseup', onUp);
  v.win.addEventListener('dblclick', onDblClick);
}

window.addEventListener('resize', () => {
  if (!bridge) setDisplays([{ id: 'home', x: 0, y: 0, w: window.innerWidth, h: window.innerHeight }], 'home');
});

// ── 루프 ─────────────────────────────────────────────────

let last = performance.now();
// 아무것도 없는 모니터 화면은 숨긴다: 투명한 전체 화면 창도 GPU 메모리(화면 버퍼)와 합성 비용이 든다.
// 무언가 들어오면(가장자리에 다가오기만 해도) 바로 보이고, 비면 잠깐 기다렸다 숨긴다 (경계에서 깜빡이지 않게)
const HIDE_AFTER = 3000;
function syncViewVisibility(now) {
  if (!bridge?.showView) return;
  const used = new Set();
  for (const ch of app.chars.values()) {
    if (ch.dead) continue;
    used.add(ch.view);
    used.add(viewAt(ch.x - 120, ch.y - 1));
    used.add(viewAt(ch.x + 120, ch.y - 1));
  }
  for (const b of app.boards.values()) if (b.visible) used.add(b.view);
  if (app.config.showPanel) used.add(panel.view);
  if (card.ch) used.add(card.view);
  for (const v of app.views.values()) {
    if (v === app.home) continue;
    if (used.has(v) || v.fx.firstChild) v.usedAt = now;
    const on = now - (v.usedAt || 0) < HIDE_AFTER;
    if (v.shown === on) continue;
    v.shown = on;
    bridge.showView(v.id, on);
  }
}

let lastHeader = 0;
let lastPointer = 0;
let lastPanelKey = null;
let calm = false;
// 다음 프레임까지는 타이머로 잔다: rAF 만 걸어 두면 화면 주사율(120Hz)마다 깨어나 일 없이 돌아간다
function schedule(t) {
  const wait = (calm ? CALM_MS : FRAME_MS) - (t - last) - 2;
  if (wait > 0) setTimeout(() => requestAnimationFrame(loop), wait);
  else requestAnimationFrame(loop);
}

function loop(t) {
  if (t - last < (calm ? CALM_MS : FRAME_MS) - 2) return schedule(t);
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  schedule(t); // 먼저 걸어 둔다 (아래에서 오류가 나도 루프는 계속)
  const now = Date.now();
  layoutSubs(now);
  for (const b of app.boards.values()) {
    if (!b.visible) continue;
    if (!b.placed && app.agents.get(b.key)?.kind === 'main') placeFree(b);
    b.setView(viewAt(b.x + Math.min(40, b.w / 2), b.y + 10));
  }
  if (surfacesDirty) {
    surfacesDirty = false;
    app.world.setSurfaces([...app.boards.values()].flatMap((b) => b.surfaces()));
  }
  // 패널에 가려진 창 윗변에는 서지 않게
  const pr = panelRect();
  const prKey = pr ? `${pr.x},${pr.y},${pr.w},${pr.h}` : '';
  if (prKey !== lastPanelKey) {
    lastPanelKey = prKey;
    app.world.setOccluders(pr ? [pr] : []);
  }
  for (const ch of app.chars.values()) ch.update(dt, now);
  separate();
  for (const ch of app.chars.values()) ch.render(now);
  for (const b of app.boards.values()) b.tick(dt);
  if (now - lastHeader > 300) {
    lastHeader = now;
    for (const ch of app.chars.values()) {
      const mode = ch.statusMode || deriveMode(ch.agent, now);
      ch.board?.setHeader(agentLabel(ch.agent), statusLabel(mode), mode);
    }
  }
  if (now - lastPointer > 100) {
    lastPointer = now;
    refreshPointer(now);
  }
  // 부르는 캐릭터에 마우스를 잠깐 올리면 "봤다"로 친다 (부르기 전부터 올려 둔 커서나 멈춘 커서는 제외)
  if (hoverChar?.calling && hoverSince > hoverChar.call.since && now - hoverSince > 450 && now - (app.mouse?.at || 0) < 1500) hoverChar.ack();
  ackSeen();
  panel.tick(now);
  syncViewVisibility(now);
  card.tick(now);
  // 걷거나 날거나 보드에 쓰거나 부르거나 끌고 있는 게 없으면 다음 프레임은 천천히
  calm =
    !drag &&
    [...app.chars.values()].every((c) => c.still) &&
    [...app.boards.values()].every((b) => b.phase === 'idle');
}

// Claude Code 에서 그 세션을 보고 있으면 (앱에 열려 있고 앱이 맨 앞, 또는 그 터미널이 맨 앞) 확인한 것으로 친다.
// 화면만 켜 두고 자리를 비웠을 수도 있으니, 부르기 직전(20초)이나 그 뒤에 마우스를 움직였을 때만
function ackSeen() {
  if (!app.seen.size) return;
  const active = app.mouse?.at || 0;
  for (const ch of app.chars.values()) {
    if (ch.calling && app.seen.has(ch.agent.sessionId) && active > ch.call.since - 20_000) ch.ack();
  }
}

// ── 시작 ─────────────────────────────────────────────────

async function boot() {
  pruneUi();
  initEffects(app);
  bindView(app.home);
  await loadSprites();
  panel = new Panel(app);
  card = new Card(app);
  requestAnimationFrame(loop);
  if (bridge) {
    bridge.onEvent(handle);
    bridge.ready();
  } else {
    // 브라우저 미리보기: 화면 하나 + 가짜 창들 + 데모 친구들
    document.body.classList.add('preview');
    setDisplays([{ id: 'home', x: 0, y: 0, w: window.innerWidth, h: window.innerHeight }], 'home');
    handle({ t: 'hello', demo: true, config: {}, lang: resolveLang(params.get('lang') || 'system', navigator.languages) });
    startFakeDesk(app);
  }
  // 데모는 hello 를 받은 뒤 (캐릭터 크기 같은 설정을 먼저 맞추고) 시작한다 — 먼저 만들면 크기가 달라 새로고침이 반복된다
  if (params.get('smoke') === '1') setTimeout(smokeDrill, 1500);
}

// 스모크 검사: 데모가 처음 몇 초 안에 안 지나가는 길(사용자 부르기·언어 바꾸기)도 한 번씩 돌려 본다
function smokeDrill() {
  for (const ch of app.chars.values()) if (ch.agent.kind === 'main') ch.startCall('done', true);
  const back = shownLang;
  for (const l of LANGS) applyLang(l);
  applyLang(back);
}

boot().catch((err) => {
  console.error(err);
  document.body.dataset.error = String(err);
});
