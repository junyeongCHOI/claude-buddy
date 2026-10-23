// 오른쪽 위 관계도 패널(세션 → 에이전트 → 서브에이전트 나무)과 캐릭터 상세 카드
import { metaOf, bboxOf, sheetOf, paletteOf, paintFrame } from './sprites.js';
import { t, logText, agentLabel } from '../shared/i18n.js';
import { deriveMode, statusLabel, boardText, BUSY_MODES } from './mode.js';

function h(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}

export function ago(ts, now = Date.now()) {
  if (!ts) return '';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return t('ago.s', { n: s });
  if (s < 3600) return t('ago.m', { n: Math.floor(s / 60) });
  return t('ago.h', { n: Math.floor(s / 3600) });
}

const shortPath = (p) => (p || '').replace(/^\/Users\/[^/]+/, '~');

/**
 * 캐릭터 작은 아바타 (box × box CSS 픽셀).
 * 픽셀이 고르게 보이도록 스프라이트 픽셀 하나를 화면(기기) 픽셀 정수 개로만 키운다.
 * 그렇게 해서 다 안 들어가면 머리 쪽부터 보여 준다.
 */
function setAvatar(el, ch, anim = 'joy', box = 28, dpr = 1) {
  if (!ch) return;
  const meta = metaOf(ch.animal);
  const idx = (meta.anims[anim] || meta.anims.sit)[0];
  const [x0, y0, x1, y1] = bboxOf(ch.animal, idx);
  const size = Math.max(x1 - x0, y1 - y0) + 2; // 캐릭터가 다 들어가는 정사각형 (스프라이트 픽셀)
  const k = Math.max(1, Math.round((box * dpr) / size)); // 스프라이트 픽셀 하나 = 기기 픽셀 k 개
  const px = k / dpr;
  const c = meta.cell;
  const n = Math.min(c, Math.floor(box / px)); // 보이는 칸 (스프라이트 픽셀)
  const clampIn = (v) => Math.max(0, Math.min(c - n, v));
  const cx = clampIn(Math.round((x0 + x1 - n) / 2));
  const cy = clampIn(n >= size ? Math.round((y0 + y1 - n) / 2) : y0 - 1);
  const cv = el.querySelector('canvas') || el.appendChild(el.ownerDocument.createElement('canvas'));
  paintFrame(cv, sheetOf(ch.animal, 1), paletteOf(ch.animal, ch.fur, 1), idx, [cx, cy, n, n]);
  cv.style.width = cv.style.height = `${n * px}px`;
  el.style.width = el.style.height = `${box}px`;
}

const POS_KEY = 'buddy.panel.gpos'; // 사용자가 옮긴 패널 자리 (전역 좌표)

export class Panel {
  constructor(app) {
    this.app = app;
    this.rows = new Map();
    this.last = 0;
    const el = h('div', 'panel');
    el.id = 'panel';
    const head = h('div', 'pn-head');
    this.gatherBtn = h('button', 'pn-gather');
    this.gatherBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      app.gather();
    });
    // 트레이(🐾) 메뉴를 이 버튼 아래에 그대로 띄운다 (앱 안에서만)
    this.menuBtn = h('button', 'pn-menu', '⋯');
    this.menuBtn.hidden = !app.native;
    this.menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const r = this.menuBtn.getBoundingClientRect();
      app.openMenu(r.left, r.bottom + 4, this.view.id); // 패널이 있는 모니터 화면 기준
    });
    // 고정한 세션만 보기 토글 (트레이 메뉴와 같은 설정)
    this.pinBtn = h('button', 'pn-pin');
    this.pinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      app.setConfig({ pinnedOnly: !app.config.pinnedOnly });
    });
    head.append(h('b', null, 'Claude Buddy'), this.pinBtn, this.gatherBtn, this.menuBtn, (this.fold = h('button', 'pn-fold', '−')));
    this.tree = h('div', 'pn-tree');
    el.append(head, this.tree);
    this.el = el;
    this.view = app.home; // 패널이 놓인 모니터 화면 (모니터 사이로 끌어 옮길 수 있다)
    this.pos = null; // 사용자가 옮긴 자리 (전역 좌표). 없으면 패널 디스플레이 오른쪽 위
    this.placed = false;
    app.home.ui.appendChild(el);

    this.collapsed = localStorage.getItem('buddy.panel.collapsed') === '1';
    this.#applyCollapsed();
    this.fold.addEventListener('click', (e) => {
      e.stopPropagation();
      this.collapsed = !this.collapsed;
      localStorage.setItem('buddy.panel.collapsed', this.collapsed ? '1' : '0');
      this.#applyCollapsed();
    });
    head.dataset.drag = 'panel';
    this.relabel();
  }

  /** 언어가 바뀌면 고정된 글자들을 다시 쓴다 (나머지는 다음 렌더에서) */
  relabel() {
    this.gatherBtn.textContent = t('panel.gather');
    this.gatherBtn.title = t('panel.gatherTip');
    this.menuBtn.title = t('panel.menu');
    this.pinBtn.textContent = t('panel.pinnedBtn');
    this.pinBtn.title = t('panel.pinned');
    this.#applyCollapsed();
    this.syncConfig();
    this.last = 0;
  }

  /** 설정이 바뀌면 (트레이에서 바꿔도) 토글 모양을 맞춘다 */
  syncConfig() {
    const on = !!this.app.config.pinnedOnly;
    this.pinBtn.setAttribute('aria-pressed', String(on));
    this.pinBtn.classList.toggle('on', on);
    this.last = 0;
  }

  #applyCollapsed() {
    this.el.classList.toggle('collapsed', this.collapsed);
    this.fold.textContent = this.collapsed ? '+' : '−';
    this.fold.title = t(this.collapsed ? 'panel.unfold' : 'panel.fold');
    this.#measure();
  }

  // 매 프레임 레이아웃을 읽지 않도록 패널 위치·크기를 기억해 둔다 (렌더·이동·접기 때만 갱신, 전역 좌표)
  #measure() {
    const r = this.el.getBoundingClientRect();
    this.rect = { x: r.left + this.view.x, y: r.top + this.view.y, w: r.width, h: r.height };
  }

  #setView(v) {
    if (v === this.view) return;
    v.ui.appendChild(this.el);
    this.view = v;
    this.last = 0; // 아바타를 그 모니터 배율로 다시
  }

  /**
   * 전역 좌표 (x, y) 로 옮긴다. at(보통 커서)이 있는 모니터 화면으로 건너가고, 그 모니터 안에 다 들어오게 맞춘다.
   */
  moveTo(x, y, at = { x: x + 40, y: y + 12 }) {
    const d = this.app.world.displayAt(at.x, at.y);
    const w = this.rect?.w || 330;
    x = Math.max(d.x, Math.min(d.x + d.w - w, x));
    y = Math.max(d.y, Math.min(d.y + d.h - 40, y));
    const v = this.app.viewAt(d.x + 1, d.y + 1);
    this.#setView(v);
    this.el.style.left = `${x - v.x}px`;
    this.el.style.top = `${y - v.y}px`;
    this.el.style.right = 'auto';
    this.pos = { x, y };
    this.#measure();
  }

  /** 패널 디스플레이 오른쪽 위 기본 자리 */
  reset() {
    this.#setView(this.app.home);
    this.el.style.left = this.el.style.top = this.el.style.right = '';
    this.pos = null;
    this.#measure();
  }

  savePos() {
    if (this.pos) localStorage.setItem(POS_KEY, JSON.stringify(this.pos));
    else localStorage.removeItem(POS_KEY);
  }

  /**
   * 모니터 구성이 바뀐 뒤: 처음이면 저장해 둔 자리로, 패널 디스플레이를 바꿨으면 그 모니터 기본 자리로,
   * 아니면 지금 자리를 새 모니터 크기에 다시 맞춘다
   */
  afterDisplays(homeChanged) {
    if (!this.placed) {
      this.placed = true;
      let pos = null;
      try {
        pos = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
        // 예전에는 패널 디스플레이 안쪽 좌표로 저장했다 → 전역 좌표로 옮겨 담는다
        const old = JSON.parse(localStorage.getItem('buddy.panel.pos') || 'null');
        if (!pos && old) pos = { x: old.x + this.app.home.x, y: old.y + this.app.home.y };
      } catch {
        /* 무시 */
      }
      localStorage.removeItem('buddy.panel.pos');
      if (pos && this.app.world.displays.some((d) => pos.x >= d.x && pos.x < d.x + d.w && pos.y >= d.y && pos.y < d.y + d.h)) this.moveTo(pos.x, pos.y);
      else this.reset();
    } else if (homeChanged) {
      this.reset();
      this.savePos();
    } else if (this.pos) this.moveTo(this.pos.x, this.pos.y);
    else this.#measure();
  }

  show(on) {
    this.el.style.display = on ? '' : 'none';
    this.#measure();
  }

  tick(now) {
    if (now - this.last < 400) return;
    this.last = now;
    this.#render(now);
    this.#measure();
  }

  #render(now) {
    const { agents, chars } = this.app;
    const kids = new Map();
    for (const a of agents.values()) {
      if (a.kind === 'sub') {
        const list = kids.get(a.parentKey) || [];
        list.push(a);
        kids.set(a.parentKey, list);
      }
    }
    const rank = (a) => {
      const m = chars.get(a.key)?.mode || deriveMode(a, now);
      return BUSY_MODES.has(m) ? 0 : m === 'done' || m === 'idle' ? 1 : 2;
    };
    const mains = [...agents.values()].filter((a) => a.kind === 'main').sort((a, b) => rank(a) - rank(b) || b.lastEventAt - a.lastEventAt);
    const order = [];
    const seen = new Set();
    const walk = (a, depth) => {
      if (seen.has(a.key)) return;
      seen.add(a.key);
      order.push([a, depth]);
      for (const k of (kids.get(a.key) || []).sort((x, y) => x.createdAt - y.createdAt)) walk(k, depth + 1);
    };
    mains.forEach((m) => walk(m, 0));
    for (const a of agents.values()) if (!seen.has(a.key)) walk(a, 1); // 부모를 잃은 서브에이전트

    const els = [];
    for (const [a, depth] of order) {
      const ch = chars.get(a.key);
      const mode = ch?.statusMode || deriveMode(a, now);
      let row = this.rows.get(a.key);
      if (!row) {
        row = this.#makeRow(a.key);
        this.rows.set(a.key, row);
      }
      this.#updateRow(row, a, ch, mode, depth, now);
      els.push(row.el);
    }
    for (const [k, row] of this.rows) {
      if (!agents.has(k)) {
        row.el.remove();
        this.rows.delete(k);
      }
    }
    const cur = [...this.tree.children];
    if (cur.length !== els.length || cur.some((e, i) => e !== els[i])) this.tree.replaceChildren(...els);
    if (!order.length) this.tree.replaceChildren(h('div', 'pn-empty', t(this.app.config.pinnedOnly ? 'panel.emptyPinned' : 'panel.empty')));
  }

  #makeRow(key) {
    const el = h('div', 'pn-row');
    el.dataset.key = key;
    const av = h('div', 'av');
    const info = h('div', 'info');
    const nm = h('div', 'nm');
    const name = h('span', 'name');
    const chip = h('span', 'chip');
    nm.append(name, chip);
    const act = h('div', 'act');
    info.append(nm, act);
    el.append(h('i', 'branch'), av, info);
    return { el, av, name, chip, act, avKey: '' };
  }

  #updateRow(row, a, ch, mode, depth, now) {
    row.el.style.setProperty('--depth', depth);
    row.el.style.setProperty('--team', ch?.team || '#999');
    row.el.classList.toggle('sub', depth > 0);
    const dpr = this.view.win.devicePixelRatio || 1;
    const avKey = `${ch?.animal}|${ch?.fur}|${mode === 'sleep'}|${dpr}`;
    if (ch && row.avKey !== avKey) {
      setAvatar(row.av, ch, mode === 'sleep' ? 'sleep' : 'joy', 28, dpr);
      row.avKey = avKey;
    }
    const name = agentLabel(a);
    if (row.name.textContent !== name) row.name.textContent = name;
    const label = statusLabel(mode);
    if (row.chip.textContent !== label) row.chip.textContent = label;
    row.chip.dataset.mode = mode;
    const lines = boardText(a, mode === 'calling-done' ? 'done' : mode === 'calling' ? 'waiting' : mode);
    const last = a.log?.[a.log.length - 1];
    const act = lines ? [lines[0], lines[1]].filter(Boolean).join(' · ') : last ? `${last.icon} ${logText(last)} · ${ago(last.ts, now)}` : '';
    if (row.act.textContent !== act) row.act.textContent = act;
  }
}

export class Card {
  constructor(app) {
    this.app = app;
    this.ch = null;
    this.last = 0;
    this.size = { w: 300, h: 220 };
    const el = h('div', 'card');
    el.id = 'card';
    el.style.display = 'none';
    this.el = el;
    this.view = app.home;
    app.home.ui.appendChild(el);
  }

  open(ch) {
    this.ch = ch;
    this.el.style.display = '';
    this.last = 0;
    this.tick(Date.now());
  }

  close() {
    this.ch = null;
    this.el.style.display = 'none';
  }

  relabel() {
    this.last = 0;
  }

  tick(now) {
    const ch = this.ch;
    if (!ch) return;
    if (ch.dead) return this.close();
    // 캐릭터가 있는 모니터 화면에 띄운다 (좌표는 그 화면 기준)
    const v = this.app.viewAt(ch.x, ch.y - ch.h);
    if (v !== this.view) {
      v.ui.appendChild(this.el);
      this.view = v;
    }
    const { w, h: hgt } = this.size; // #render 때 잰 크기 (매 프레임 레이아웃 읽기 방지)
    const cx = ch.x - v.x;
    let x = cx + 40;
    if (x + w > v.w - 8) x = cx - 40 - w;
    const y = Math.max(8, Math.min(v.h - hgt - 8, ch.y - v.y - hgt - 20));
    this.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    if (now - this.last > 500) {
      this.last = now;
      this.#render(now);
    }
  }

  #render(now) {
    const ch = this.ch;
    const a = ch.agent;
    const mode = ch.statusMode || deriveMode(a, now);
    const head = h('div', 'cd-head');
    const av = h('div', 'av');
    setAvatar(av, ch, mode === 'sleep' ? 'sleep' : 'joy', 40, this.view.win.devicePixelRatio || 1);
    const title = h('div', 'cd-title');
    title.append(
      h('b', null, a.kind === 'main' ? a.name : a.description || agentLabel(a)),
      h('span', null, `${t(`animal.${ch.animal}`)} · ${t(`fur.${ch.fur}`)}`),
    );
    const open = h('button', 'cd-open', t('card.open'));
    open.title = t(a.entrypoint === 'claude-desktop' ? 'card.openApp' : 'card.openTerm');
    open.addEventListener('click', () => this.app.openSession(ch));
    const x = h('button', 'cd-close', '×');
    x.title = t('card.close');
    x.addEventListener('click', () => this.close());
    head.append(av, title, open, x);

    const rows = h('div', 'cd-rows');
    const row = (k, v) => {
      if (!v) return;
      const r = h('div', 'cd-row');
      r.append(h('span', 'k', k), h('span', 'v', v));
      rows.append(r);
    };
    row(t('card.kind'), a.kind === 'main' ? t('card.main') : [t('card.sub'), a.agentType].filter(Boolean).join(' · '));
    row(t('card.status'), statusLabel(mode));
    row(t('card.folder'), shortPath(a.cwd));
    if (a.kind === 'sub') {
      const p = this.app.agents.get(a.parentKey);
      row(t('card.parent'), p ? (p.kind === 'main' ? p.name : p.description || agentLabel(p)) : '');
    } else {
      const kids = [...this.app.agents.values()].filter((x) => x.parentKey === a.key).length;
      if (kids) row(t('card.helpers'), t('card.helpersWorking', { n: kids }));
    }
    row(t(a.kind === 'main' ? 'card.request' : 'card.task'), a.kind === 'main' ? a.lastPrompt : a.description || a.lastPrompt);
    row(t('card.tools'), a.counts ? t('card.toolUses', { n: a.counts.tools }) + (a.counts.errors ? ` · ${t('card.errors', { n: a.counts.errors })}` : '') : '');

    const log = h('div', 'cd-log');
    log.append(h('div', 'cd-sub', t('card.recent')));
    for (const item of (a.log || []).slice(-8).reverse()) {
      const r = h('div', 'cd-item');
      r.append(h('span', 'ic', item.icon), h('span', 'tx', logText(item)), h('span', 'tm', ago(item.ts, now)));
      log.append(r);
    }
    this.el.replaceChildren(head, rows, log);
    this.el.style.setProperty('--team', ch.team);
    this.size = { w: this.el.offsetWidth || 300, h: this.el.offsetHeight || 220 };
  }
}
