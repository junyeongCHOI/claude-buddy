// Claude Buddy — 메인 프로세스
// 투명한 오버레이 창을 한 디스플레이(무대)에 깔고, 수집기·창 위치 정보를 렌더러로 흘려보낸다.
import { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, protocol, net } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Collector } from './collector.js';
import { WindowWatcher } from './windows.js';
import { loadConfig } from './config.js';
import { revealSession, hostAppPid } from './reveal.js';
import { t, setLang, getLang, resolveLang, LANGS, LANG_NAMES } from '../shared/i18n.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEMO = process.argv.includes('--demo');
const SMOKE = process.argv.includes('--smoke');

protocol.registerSchemesAsPrivileged([
  { scheme: 'buddy', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

if (!app.requestSingleInstanceLock()) {
  if (SMOKE) {
    console.log(JSON.stringify({ ok: false, errors: ['Claude Buddy가 이미 실행 중입니다.'], warnings: [] }));
  }
  app.quit();
  process.exit(SMOKE ? 1 : 0);
}

let overlay = null; // 패널이 있는 모니터(무대)의 오버레이 — 렌더러 본체
const childWins = new Map(); // 다른 모니터 id → 오버레이 (렌더러가 window.open 으로 연 자식 창)
let overlayReady = false;
let tray = null;
let trayMenu = null; // 패널 ⋯ 버튼도 같은 메뉴를 띄운다
let stage = null;
let store = null;
let reloadTimer = null;
let quitting = false;
const smoke = { errors: [], warnings: [], readyTimer: null, finishTimer: null, finished: false, loads: 0 };

const collector = new Collector();
const watcher = new WindowWatcher(path.join(ROOT, 'native', 'bin', 'winwatch'));

function rendererMessage(level, message) {
  console.log(`[renderer] ${message}`);
  if (SMOKE) smoke[level === 'error' ? 'errors' : 'warnings'].push(message);
}

function finishSmoke() {
  if (smoke.finished) return;
  smoke.finished = true;
  quitting = true;
  clearTimeout(smoke.readyTimer);
  clearTimeout(smoke.finishTimer);
  clearTimeout(reloadTimer);
  // app.exit은 before-quit을 거치지 않는다.
  watcher.stop();
  collector.stop();
  const result = { ok: smoke.errors.length === 0, errors: smoke.errors, warnings: smoke.warnings };
  process.stdout.write(`${JSON.stringify(result)}\n`, () => app.exit(result.ok ? 0 : 1));
}

if (SMOKE) {
  smoke.readyTimer = setTimeout(() => {
    smoke.errors.push('30초 안에 buddy:ready를 받지 못했습니다.');
    finishSmoke();
  }, 30000);
}

function send(msg) {
  if (overlay && !overlay.isDestroyed() && overlayReady) overlay.webContents.send('buddy:event', msg);
}

function pickStage() {
  const displays = screen.getAllDisplays();
  // 고른 디스플레이 → 지금 무대(아직 연결돼 있으면) → 처음 켤 때만 커서가 있는 디스플레이
  return (
    displays.find((d) => d.id === store.config.stageDisplayId) ||
    (stage && displays.find((d) => d.id === stage.id)) ||
    screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) ||
    screen.getPrimaryDisplay()
  );
}

// 렌더러로 보낼 창 목록 (전역 좌표 그대로)
function windowsPayload(list) {
  return list.map((w) => ({ id: w.id, owner: w.owner, kind: w.kind, x: w.x, y: w.y, w: w.w, h: w.h }));
}

// 모든 모니터 작업 영역 (전역 좌표) + 패널이 있는 모니터
function displaysPayload() {
  const displays = screen.getAllDisplays().map((d) => ({ id: String(d.id), x: d.workArea.x, y: d.workArea.y, w: d.workArea.width, h: d.workArea.height }));
  return { t: 'displays', home: String(stage.id), displays };
}

const OVERLAY_OPTIONS = {
  type: 'panel',
  transparent: true,
  backgroundColor: '#00000000',
  frame: false,
  hasShadow: false,
  resizable: false,
  movable: false,
  minimizable: false,
  maximizable: false,
  fullscreenable: false,
  skipTaskbar: true,
  focusable: false,
  alwaysOnTop: true,
  roundedCorners: false,
  show: false,
};

function setupOverlay(win) {
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
}

function placeOverlay() {
  stage = pickStage();
  if (!overlay) return;
  overlay.setBounds(stage.workArea);
  // 다른 모니터 오버레이도 작업 영역에 맞춘다 (빠진 모니터 창은 렌더러가 닫는다)
  for (const [id, win] of childWins) {
    const d = screen.getAllDisplays().find((x) => String(x.id) === id);
    if (d && !win.isDestroyed()) win.setBounds(d.workArea);
  }
  send(displaysPayload());
  send({ t: 'windows', windows: windowsPayload(watcher.list) });
}

function createOverlay() {
  overlayReady = false;
  stage = pickStage();
  const wa = stage.workArea;
  overlay = new BrowserWindow({
    x: wa.x,
    y: wa.y,
    width: wa.width,
    height: wa.height,
    ...OVERLAY_OPTIONS,
    webPreferences: {
      preload: path.join(ROOT, 'src', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  setupOverlay(overlay);
  overlay.once('ready-to-show', () => overlay.showInactive());
  // 다른 모니터 오버레이: 렌더러가 window.open('about:blank', 'buddy-display-<id>') 로 연다.
  // 같은 렌더러 프로세스라 메모리를 거의 더 쓰지 않고, 렌더러가 DOM 을 직접 그린다.
  overlay.webContents.setWindowOpenHandler(({ frameName }) => {
    const id = /^buddy-display-(.+)$/.exec(frameName || '')?.[1];
    const d = id && screen.getAllDisplays().find((x) => String(x.id) === id);
    if (!d) return { action: 'deny' };
    const area = d.workArea;
    return {
      action: 'allow',
      overrideBrowserWindowOptions: { ...OVERLAY_OPTIONS, x: area.x, y: area.y, width: area.width, height: area.height, webPreferences: { backgroundThrottling: false } },
    };
  });
  overlay.webContents.on('did-create-window', (win, { frameName }) => {
    const id = /^buddy-display-(.+)$/.exec(frameName || '')?.[1];
    if (!id) return;
    setupOverlay(win);
    // macOS 가 새 창을 부모 옆으로 옮겨 놓는 경우가 있어서, 보인 뒤에도 그 모니터 작업 영역에 다시 맞춘다
    const fit = () => {
      const d = screen.getAllDisplays().find((x) => String(x.id) === id);
      if (!d || win.isDestroyed()) return;
      const b = win.getBounds();
      const a = d.workArea;
      if (b.x !== a.x || b.y !== a.y || b.width !== a.width || b.height !== a.height) win.setBounds(a);
    };
    fit();
    win.showInactive();
    fit();
    setTimeout(fit, 300);
    setTimeout(fit, 1500);
    win.on('moved', fit);
    childWins.set(id, win);
    win.on('closed', () => {
      if (childWins.get(id) === win) childWins.delete(id);
    });
  });
  overlay.webContents.on('did-start-loading', () => {
    overlayReady = false;
    // 스모크 검사 중 다시 불러오면 (예: 설정 때문에 무한 새로고침) 아무것도 못 그린 채 통과해 버린다
    if (SMOKE && ++smoke.loads > 1) smoke.errors.push('스모크 검사 중 렌더러가 다시 불러와졌습니다.');
  });
  overlay.webContents.on('console-message', (details) => {
    if (details.level !== 'warning' && details.level !== 'error') return;
    const source = details.sourceId ? ` (${details.sourceId}:${details.lineNumber})` : '';
    rendererMessage(details.level, `${details.message}${source}`);
  });
  let loadFailed = false;
  overlay.webContents.on('did-fail-load', (_e, code, description, url) => {
    loadFailed = true;
    overlayReady = false;
    rendererMessage('error', `did-fail-load: ${description} (${code}) ${url}`);
  });
  overlay.webContents.on('preload-error', (_e, preloadPath, error) => {
    rendererMessage('error', `preload-error: ${preloadPath}: ${error.message}`);
  });
  overlay.webContents.on('render-process-gone', (_e, details) => {
    overlayReady = false;
    rendererMessage('error', `render-process-gone: ${details.reason} (${details.exitCode})`);
    if (!SMOKE && !quitting) {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        if (overlay && !overlay.isDestroyed()) overlay.reload();
      }, 1000);
    }
  });
  overlay.on('closed', () => {
    clearTimeout(reloadTimer);
    overlay = null;
    overlayReady = false;
    if (SMOKE && !quitting) {
      smoke.errors.push('스모크 검사 중 오버레이 창이 닫혔습니다.');
      finishSmoke();
    }
  });
  overlay.loadURL('buddy://app/src/renderer/index.html' + (DEMO ? '?demo=1' : '') + (SMOKE ? '&smoke=1' : '')).catch((error) => {
    if (!loadFailed) rendererMessage('error', `loadURL: ${error.message}`);
  });
}

// 화면 언어: 설정이 'system' 이면 macOS 선호 언어 순서대로 (지원 안 하면 영어)
function applyLanguage() {
  setLang(resolveLang(store.config.language, app.getPreferredSystemLanguages()));
}

// 트레이 메뉴와 패널이 설정을 바꾸는 같은 길: 저장 → 렌더러에 알림 → 트레이 메뉴 다시 만들기
function updateConfig(patch) {
  const { config, save } = store;
  Object.assign(config, patch);
  save();
  if ('language' in patch) applyLanguage();
  if ('pinnedOnly' in patch) collector.setPinnedOnly(config.pinnedOnly);
  send({ t: 'config', config, lang: getLang() });
  buildTrayMenu();
}

// 사용자가 Claude Code 에서 보고 있는 세션 → 렌더러가 그 캐릭터의 부르기를 '확인함'으로 친다
//  - Claude 앱 창이 맨 앞이면: 앱에 열려 있는 세션 (가운데·나눠 보기 칸)
//  - 터미널·IDE 창이 맨 앞이면: 그 앱 안에서 도는 CLI 세션 (하나뿐일 때만 — 여럿이면 어느 탭을 보는지 모른다)
const hostPids = new Map(); // CLI 세션 pid → 그 세션이 도는 앱 pid (null: 못 찾음)
let seenKey = null;

function updateSeen() {
  const front = watcher.list.find((w) => w.kind === 'window');
  const seen = [];
  if (front?.owner === 'Claude') {
    for (const s of collector.sessions.values()) if (s.hostSessionId && collector.viewing.has(s.hostSessionId)) seen.push(s.id);
  } else if (front) {
    const here = [];
    for (const s of collector.sessions.values()) {
      if (s.hostSessionId || !s.pid) continue;
      if (!hostPids.has(s.pid)) {
        hostPids.set(s.pid, null);
        hostAppPid(s.pid).then((p) => {
          hostPids.set(s.pid, p);
          if (p) updateSeen();
        });
      } else if (hostPids.get(s.pid) === front.pid) here.push(s.id);
    }
    if (here.length === 1) seen.push(here[0]);
  }
  const key = seen.sort().join();
  if (key === seenKey) return;
  seenKey = key;
  send({ t: 'seen', sessions: seen });
}

function buildTrayMenu() {
  const { config, save } = store;
  const displays = screen.getAllDisplays();
  const set = updateConfig;
  // 모르는 언어로 바뀌어도 찾을 수 있게 영어 이름을 같이 쓴다
  const languageLabel = getLang() === 'en' ? t('tray.language') : `${t('tray.language')} · Language`;
  const menu = Menu.buildFromTemplate([
    { label: 'Claude Buddy', enabled: false },
    { type: 'separator' },
    { label: t('tray.gather'), click: () => send({ t: 'gather' }) },
    {
      label: t('tray.display'),
      submenu: displays.map((d, i) => ({
        label: `${d.label || t('tray.displayN', { n: i + 1 })} (${d.size.width}×${d.size.height})`,
        type: 'radio',
        checked: stage?.id === d.id,
        click: () => {
          config.stageDisplayId = d.id;
          save();
          placeOverlay();
          buildTrayMenu();
        },
      })),
    },
    { label: t('tray.panel'), type: 'checkbox', checked: config.showPanel, click: (i) => set({ showPanel: i.checked }) },
    { label: t('tray.pinnedOnly'), type: 'checkbox', checked: config.pinnedOnly, click: (i) => set({ pinnedOnly: i.checked }) },
    { label: t('tray.showSleeping'), type: 'checkbox', checked: config.showSleeping, click: (i) => set({ showSleeping: i.checked }) },
    {
      label: t('tray.size'),
      submenu: [[0.75, 'tray.small'], [1, 'tray.medium'], [1.5, 'tray.large']].map(([s, key]) => ({
        label: t(key),
        type: 'radio',
        checked: config.scale === s,
        click: () => set({ scale: s }),
      })),
    },
    {
      label: languageLabel,
      submenu: [
        { label: t('tray.system'), type: 'radio', checked: config.language === 'system', click: () => set({ language: 'system' }) },
        { type: 'separator' },
        ...LANGS.map((l) => ({ label: LANG_NAMES[l], type: 'radio', checked: config.language === l, click: () => set({ language: l }) })),
      ],
    },
    {
      label: t('tray.login'),
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (i) => {
        app.setLoginItemSettings({ openAtLogin: i.checked });
        buildTrayMenu();
      },
    },
    { type: 'separator' },
    { label: t('tray.resetBoards'), click: () => send({ t: 'reset-boards' }) },
    { label: t('tray.reload'), click: () => overlay?.reload() },
    { type: 'separator' },
    { label: t('tray.quit'), role: 'quit' },
  ]);
  trayMenu = menu;
  tray.setContextMenu(menu);
}

app.whenReady().then(() => {
  protocol.handle('buddy', async (request) => {
    let file;
    try {
      const url = new URL(request.url);
      file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
      if (url.host !== 'app' || !file.startsWith(ROOT + path.sep) || file.includes('\0')) {
        return new Response('Forbidden', { status: 403 });
      }
    } catch {
      return new Response('Forbidden', { status: 403 });
    }
    try {
      return await net.fetch(pathToFileURL(file).toString());
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
  app.dock?.hide();
  store = loadConfig(app.getPath('userData'));
  applyLanguage();

  // 메뉴 막대 아이콘: 템플릿 이미지(검정+투명)라 macOS 가 밝은/어두운 막대에 맞춰 색을 바꾼다.
  // 이름이 ...Template.png 이면 @2x 판도 같이 불러온다 (이모지 제목은 다크 모드에서도 늘 검정이라 안 씀)
  const icon = nativeImage.createFromPath(path.join(ROOT, 'assets', 'tray', 'pawTemplate.png'));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('Claude Buddy');

  ipcMain.on('buddy:ready', (event) => {
    if (!overlay || event.sender !== overlay.webContents) return;
    overlayReady = true;
    send({ t: 'hello', demo: DEMO, config: store.config, lang: getLang() });
    send(displaysPayload());
    send({ t: 'windows', windows: windowsPayload(watcher.list) });
    if (!DEMO) send({ t: 'snapshot', agents: collector.snapshot().agents });
    seenKey = null;
    if (!DEMO) updateSeen();
    if (SMOKE && !smoke.finishTimer && !smoke.finished) {
      clearTimeout(smoke.readyTimer);
      smoke.finishTimer = setTimeout(finishSmoke, 6000);
    }
  });
  // 마우스가 올라간 모니터 오버레이만 클릭을 받는다 (나머지는 아래 앱으로 통과)
  // 아무것도 없는 모니터의 오버레이는 숨긴다 (투명한 전체 화면 창도 화면 버퍼만큼 GPU 메모리와 합성 비용이 든다)
  ipcMain.on('buddy:view-visible', (event, viewId, on) => {
    if (!overlay || event.sender !== overlay.webContents) return;
    const win = childWins.get(String(viewId));
    if (!win || win.isDestroyed() || win.isVisible() === on) return;
    if (on) win.showInactive();
    else win.hide();
  });
  ipcMain.on('buddy:interactive', (event, on, viewId) => {
    if (!overlay || event.sender !== overlay.webContents) return;
    const win = !viewId || viewId === String(stage.id) ? overlay : childWins.get(String(viewId));
    if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(!on, { forward: true });
  });

  // 캐릭터를 누르면 그 세션이 있는 Claude 앱·터미널을 앞으로
  ipcMain.on('buddy:open-session', (event, sessionId) => {
    if (!overlay || event.sender !== overlay.webContents) return;
    revealSession(collector.sessions.get(sessionId)).catch((err) => console.warn('[reveal]', err.message));
  });

  // 패널에서 바꿀 수 있는 설정 (나머지는 ⋯ 버튼의 메뉴로)
  const PANEL_SETTINGS = { showPanel: 'boolean', showSleeping: 'boolean', pinnedOnly: 'boolean' };
  ipcMain.on('buddy:set-config', (event, patch) => {
    if (!overlay || event.sender !== overlay.webContents || !patch || typeof patch !== 'object') return;
    const clean = {};
    for (const [k, type] of Object.entries(PANEL_SETTINGS)) if (typeof patch[k] === type) clean[k] = patch[k];
    if (Object.keys(clean).length) updateConfig(clean);
  });
  // 패널 ⋯ 버튼: 트레이 메뉴를 버튼 아래에 그대로 띄운다 (x, y 는 패널이 있는 모니터 오버레이 기준)
  ipcMain.on('buddy:menu', (event, x, y, viewId) => {
    if (!overlay || event.sender !== overlay.webContents || !trayMenu) return;
    const win = !viewId || viewId === String(stage.id) ? overlay : childWins.get(String(viewId));
    if (win && !win.isDestroyed()) trayMenu.popup({ window: win, x: Math.round(x), y: Math.round(y) });
  });

  createOverlay();
  buildTrayMenu();

  if (!DEMO) {
    collector.on('agent', (agent) => send({ t: 'agent', agent }));
    collector.on('agent-remove', (e) => send({ t: 'agent-remove', ...e }));
    collector.on('activity', (e) => send({ t: 'activity', ...e }));
    collector.on('viewing', updateSeen);
    collector.pinnedOnly = store.config.pinnedOnly;
    collector.start();
  }

  watcher.on('windows', (list) => {
    send({ t: 'windows', windows: windowsPayload(list) });
    if (!DEMO) updateSeen();
  });
  // 다른 앱 위 클릭 → 렌더러가 상세 카드를 닫을지 판단 (전역 좌표)
  watcher.on('click', ({ x, y }) => send({ t: 'outside-click', x, y }));
  // 커서 위치: 숨긴 모니터 화면이나 메뉴 막대 위에서도 사용자가 움직이는지 알 수 있게 (움직였을 때만 보낸다)
  let cursorKey = '';
  setInterval(() => {
    const p = screen.getCursorScreenPoint();
    const k = `${p.x},${p.y}`;
    if (k === cursorKey) return;
    cursorKey = k;
    send({ t: 'cursor', x: p.x, y: p.y });
  }, 500);
  watcher.start();

  const onDisplays = () => {
    placeOverlay();
    buildTrayMenu();
  };
  screen.on('display-added', onDisplays);
  screen.on('display-removed', onDisplays);
  screen.on('display-metrics-changed', onDisplays);
}).catch((error) => {
  console.error('[main]', error);
  if (SMOKE) {
    smoke.errors.push(`시작 실패: ${error.message}`);
    finishSmoke();
  } else {
    app.quit();
  }
});

app.on('window-all-closed', () => {
  /* 트레이에서 종료할 때까지 계속 */
});

app.on('before-quit', () => {
  quitting = true;
  clearTimeout(reloadTimer);
  watcher.stop();
  collector.stop();
});
