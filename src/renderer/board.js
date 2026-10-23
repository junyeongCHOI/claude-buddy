// 화면에 붙어 있는 에이전트별 화이트보드.
//  - 글이 바뀌면 슥 지워지고(erase) → 크기가 맞춰지고(resize) → 한 글자씩 써진다(write)
//  - 서브에이전트는 보드 없이 이 보드에 붙고, 아래쪽에 서브별로 한 줄씩 지금 하는 일이 보인다
//  - 헤더를 끌면 이동, 왼쪽 아래 모서리를 끌면 크기 조절 (더블클릭하면 자동 크기로)
//  - 주인 캐릭터는 동물 성격대로 보드에 매달리거나 안기거나 위에 눕는다 (perch.js)

import { t, FONT_FAMILY, getLang } from '../shared/i18n.js';

// style.css 의 .wb 치수·글꼴과 똑같이 맞춰야 크기가 정확하다 (글꼴은 언어마다 다르다: 한자 모양)
let FONT_L1, FONT_L2, FONT_HEAD, FONT_HIST, FONT_SUB, FONT_SUB_WHO;
export function useBoardFonts(lang) {
  const f = FONT_FAMILY[lang] || FONT_FAMILY.en;
  FONT_L1 = `600 13px ${f}`;
  FONT_L2 = `12px ${f}`;
  FONT_HEAD = `600 11.5px ${f}`;
  FONT_HIST = `11px ${f}`;
  FONT_SUB = `11.5px ${f}`;
  FONT_SUB_WHO = `600 11px ${f}`;
}
useBoardFonts(getLang());
const PAD_X = 12;
const PAD_TOP = 8;
const PAD_BOTTOM = 10;
const L1_LINE = 18;
const L2_LINE = 17;
const HEAD_H = 30;
const HIST_PAD = 6;
const HIST_LINE = 16;
const SUB_PAD = 7; // 서브 줄 위 여백 + 구분선
const SUB_LINE = 18;
const SUB_EXTRA = 22; // 점·간격
const BORDER = 2;
const AUTO_MIN_W = 170;
const AUTO_MAX_TEXT_W = 260;
const ERASE_S = 0.45;
const RESIZE_S = 0.22;

let measureCtx = null;
export function textWidth(s, font = FONT_L2) {
  measureCtx ||= document.createElement('canvas').getContext('2d');
  measureCtx.font = font;
  return measureCtx.measureText(s).width;
}

function wrap(text, maxW, maxLines, font = FONT_L2) {
  const lines = [];
  let cur = '';
  for (const ch of Array.from(text)) {
    if (ch === '\n') {
      lines.push(cur);
      cur = '';
    } else if (textWidth(cur + ch, font) > maxW && cur) {
      lines.push(cur);
      cur = ch.trimStart();
    } else cur += ch;
    if (lines.length > maxLines) break;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = Array.from(lines[maxLines - 1]); // 코드 포인트 단위로 잘라야 이모지가 안 깨진다
    while (last.length && textWidth(last.join('') + '…', font) > maxW) last.pop();
    lines[maxLines - 1] = last.join('') + '…';
  }
  return lines;
}

const chars = (s) => Array.from(s || '');

export class WhiteBoard {
  /**
   * @param {object} o
   * @param {string} o.key     주인 에이전트 key
   * @param {string} o.team    팀 색
   * @param {number} o.sideW   주인 캐릭터가 보드 오른쪽으로 삐져나오는 폭 (자리 잡을 때 비워 둔다)
   */
  constructor({ key, team, sideW, onChange }) {
    this.key = key;
    this.onChange = onChange;
    this.x = 0;
    this.y = 0;
    this.w = AUTO_MIN_W;
    this.h = 60;
    this.manual = null; // 사용자가 정한 {w, h}
    this.moved = false; // 사용자가 옮겼으면 자동 배치 안 함
    this.sideW = sideW;
    this.visible = false;
    this.view = null; // 보드가 놓인 모니터 화면 (x, y 는 전역 좌표)

    const el = document.createElement('div');
    el.className = 'wb';
    el.dataset.key = key;
    el.style.setProperty('--team', team);
    el.innerHTML =
      '<div class="wb-head"><i></i><span class="who"></span><span class="st"></span><button class="wb-fold">−</button></div>' +
      '<div class="wb-body"><div class="txt"><div class="l1"></div><div class="l2"></div></div></div>' +
      '<div class="wb-subs"></div>' +
      '<div class="wb-hist"></div>' +
      '<div class="wb-resize"></div>';
    this.el = el;
    this.who = el.querySelector('.who');
    this.st = el.querySelector('.st');
    this.fold = el.querySelector('.wb-fold');
    this.collapsed = false;
    this.txt = el.querySelector('.txt');
    this.l1 = el.querySelector('.l1');
    this.l2 = el.querySelector('.l2');
    this.subsEl = el.querySelector('.wb-subs');
    this.hist = el.querySelector('.wb-hist');
    el.style.display = 'none';

    this.key_ = '';
    this.pending = null;
    this.target = { l1: '', l2lines: [] };
    this.shownKey = '';
    this.phase = 'idle';
    this.t = 0;
    this.histItems = [];
    this.subItems = [];
    this.subsKey = '';
    this.#titles();
  }

  #titles() {
    this.fold.title = t(this.collapsed ? 'board.unfold' : 'board.fold');
    this.el.querySelector('.wb-resize').title = t('board.resize');
  }

  /** 언어가 바뀌면 버튼 설명을 바꾸고 새 글꼴로 크기를 다시 잰다 (글은 주인이 다시 쓴다) */
  relabel() {
    this.#titles();
    this.#relayout(true);
  }

  // ── 바깥에서 부르는 것들 ────────────────────────────────

  setHeader(who, status, mode = '') {
    if (this.who.textContent !== who) {
      this.who.textContent = who;
      this.#relayout(false);
    }
    if (this.st.textContent !== status) this.st.textContent = status;
    if (this.st.dataset.mode !== mode) this.st.dataset.mode = mode;
  }

  /** @param {[string, string] | null} lines */
  write(lines) {
    const key = lines ? `${lines[0]}\u0000${lines[1]}` : '';
    if (key === this.key_) return;
    // 지우기 전에 지금 글을 기록으로 남긴다
    if (this.shownKey && this.target.l1) this.#pushHist(this.target.l1 + (this.target.l2lines[0] ? ` ${this.target.l2lines[0]}` : ''));
    this.key_ = key;
    this.pending = lines;
    if (this.phase === 'erase') return;
    if (this.shownKey || this.phase === 'write') this.#go('erase');
    else this.#go('resize');
  }

  /**
   * 이 보드에 붙은 서브에이전트들의 지금 일 (한 줄씩)
   * @param {{key: string, color: string, who: string, text: string}[]} rows
   */
  setSubs(rows) {
    const key = rows.map((r) => `${r.key}\u0000${r.color}\u0000${r.who}\u0000${r.text}`).join('\u0001');
    if (key === this.subsKey) return;
    this.subsKey = key;
    this.subItems = rows;
    this.subsEl.replaceChildren(
      ...rows.map((r) => {
        const d = document.createElement('div');
        const dot = document.createElement('i');
        dot.style.background = r.color;
        const who = document.createElement('b');
        who.textContent = r.who;
        const t = document.createElement('span');
        t.textContent = r.text;
        d.append(dot, who, t);
        return d;
      }),
    );
    this.#relayout(false);
  }

  get writing() {
    return this.phase === 'erase' || this.phase === 'write';
  }

  get settled() {
    return this.phase === 'idle' && this.shownKey === this.key_;
  }

  show(on) {
    if (on === this.visible) return;
    this.visible = on;
    this.el.style.display = on ? '' : 'none';
    this.onChange?.();
  }

  moveTo(x, y, user = false) {
    this.x = Math.round(x);
    this.y = Math.round(y);
    if (user) this.moved = true;
    this.place();
    this.onChange?.();
  }

  /** 보드가 걸친 모니터 화면으로 옮긴다 */
  setView(view) {
    if (view === this.view) return;
    this.view = view;
    view.boards.appendChild(this.el);
    this.place();
  }

  /** 전역 좌표 → 지금 화면 기준 위치 */
  place() {
    this.el.style.left = `${this.x - (this.view?.x || 0)}px`;
    this.el.style.top = `${this.y - (this.view?.y || 0)}px`;
  }

  /** 왼쪽 아래 모서리를 (x, bottom) 으로 */
  resizeFromBottomLeft(x, bottom) {
    if (this.collapsed) return;
    const right = this.x + this.w;
    const w = Math.max(130, right - x);
    const h = Math.max(54, bottom - this.y);
    this.manual = { w, h };
    this.x = Math.round(right - w);
    this.place();
    this.#relayout(true);
  }

  /** 접으면 헤더(이름·상태)만 남는다. 글쓰기는 안 보이게 계속 진행 */
  setCollapsed(on) {
    if (on === this.collapsed) return;
    this.collapsed = on;
    this.el.classList.toggle('collapsed', on);
    this.fold.textContent = on ? '+' : '−';
    this.#titles();
    this.#relayout(false);
  }

  resetSize() {
    this.manual = null;
    this.#relayout(true);
  }

  /** 주인이 처음 나타날 때 떨어질 자리 (보드 윗변 오른쪽) */
  dropSpot() {
    return { x: this.x + this.w - this.sideW * 0.5, y: this.y };
  }

  surfaces() {
    if (!this.visible) return [];
    return [{ id: `b:${this.key}`, x: this.x, y: this.y, w: this.w, h: this.h, cat: 'board' }];
  }

  remove() {
    this.el.remove();
  }

  // ── 내부 ───────────────────────────────────────────────

  #pushHist(text) {
    // 생각 중·쉬는 중 같은 잠깐 상태와 연속 중복은 기록하지 않는다
    if (/^(💭|☕)/.test(text) || this.histItems[this.histItems.length - 1] === text) return;
    this.histItems.push(text);
    if (this.histItems.length > 2) this.histItems.shift();
    this.hist.replaceChildren(
      ...this.histItems.map((t) => {
        const d = document.createElement('div');
        d.textContent = t;
        return d;
      }),
    );
    this.#relayout(false);
  }

  #subsH() {
    return this.subItems.length ? SUB_PAD + this.subItems.length * SUB_LINE : 0;
  }

  #textBox() {
    if (this.manual) return this.manual.w - PAD_X * 2;
    return AUTO_MAX_TEXT_W;
  }

  #layout(lines) {
    const maxW = this.#textBox();
    const l1 = wrap(lines?.[0] || '', maxW, 1, FONT_L1)[0] || '';
    let maxL2 = 3;
    if (this.manual) {
      const hist = this.histItems.length ? HIST_PAD + this.histItems.length * HIST_LINE : 0;
      const room = this.manual.h - BORDER - HEAD_H - PAD_TOP - L1_LINE - this.#subsH() - hist - PAD_BOTTOM;
      maxL2 = Math.max(0, Math.floor(room / L2_LINE));
    }
    const l2lines = lines?.[1] && maxL2 ? wrap(String(lines[1]), maxW, maxL2) : [];
    return { l1, l2lines };
  }

  #relayout(resized) {
    const headW = Math.min(AUTO_MAX_TEXT_W, textWidth(this.who.textContent, FONT_HEAD)) + 128; // 여백·점·상태·접기 버튼 자리
    if (this.collapsed) {
      this.w = this.manual ? this.manual.w : Math.ceil(Math.max(AUTO_MIN_W, headW));
      this.h = BORDER + HEAD_H;
      this.el.style.width = `${this.w}px`;
      this.el.style.height = `${this.h}px`;
      this.onChange?.();
      return;
    }
    if (this.manual) {
      this.w = this.manual.w;
      this.h = this.manual.h;
    } else {
      const t = this.target;
      const textW = Math.max(textWidth(t.l1, FONT_L1), ...t.l2lines.map((l) => textWidth(l)), headW, 0);
      const histW = Math.max(0, ...this.histItems.map((l) => Math.min(AUTO_MAX_TEXT_W, textWidth(l, FONT_HIST) + 10)));
      const subW = Math.max(0, ...this.subItems.map((r) => Math.min(AUTO_MAX_TEXT_W, textWidth(r.who, FONT_SUB_WHO) + textWidth(r.text, FONT_SUB) + SUB_EXTRA)));
      this.w = Math.ceil(Math.max(AUTO_MIN_W, Math.max(textW, histW, subW) + PAD_X * 2 + BORDER + 2));
      const hist = this.histItems.length ? HIST_PAD + this.histItems.length * HIST_LINE : 0;
      this.h = Math.ceil(BORDER + HEAD_H + PAD_TOP + L1_LINE + L2_LINE * t.l2lines.length + this.#subsH() + hist + PAD_BOTTOM);
    }
    this.el.style.width = `${this.w}px`;
    this.el.style.height = `${this.h}px`;
    if (resized && this.phase !== 'erase') {
      // 크기가 바뀌면 지금 글(쓰는 중이면 쓰던 글)을 새 폭으로 다시 맞춘다
      this.target = this.#layout(this.pending);
      this.total = chars(this.target.l1).length + this.target.l2lines.reduce((n, l) => n + chars(l).length, 0);
      if (this.phase === 'idle' && this.shownKey) this.#renderText(Infinity);
    }
    this.onChange?.();
  }

  #go(phase) {
    this.phase = phase;
    this.t = 0;
    if (phase === 'resize') {
      this.target = this.#layout(this.pending);
      this.l1.textContent = '';
      this.l2.replaceChildren();
      this.txt.style.clipPath = '';
      this.shownKey = '';
      this.#relayout(false);
      this.total = chars(this.target.l1).length + this.target.l2lines.reduce((n, l) => n + chars(l).length, 0);
      this.speed = Math.max(24, this.total / 1.3); // 길어도 1.3초 안에 다 쓴다
    }
  }

  #renderText(n) {
    const t = this.target;
    const c1 = chars(t.l1);
    this.l1.textContent = c1.slice(0, n).join('');
    let rest = n - c1.length;
    const out = [];
    for (const line of t.l2lines) {
      if (rest <= 0) break;
      const cs = chars(line);
      out.push(cs.slice(0, rest).join(''));
      rest -= cs.length;
    }
    this.l2.replaceChildren(
      ...out.map((s) => {
        const d = document.createElement('div');
        d.textContent = s;
        return d;
      }),
    );
    return out;
  }

  tick(dt) {
    if (this.phase === 'idle') return;
    this.t += dt;

    if (this.phase === 'erase') {
      const p = Math.min(1, this.t / ERASE_S);
      this.txt.style.clipPath = `inset(0 0 0 ${p * 100}%)`;
      if (p >= 1) this.#go('resize');
      return;
    }

    if (this.phase === 'resize') {
      if (this.t >= RESIZE_S) {
        if (!this.pending) {
          this.shownKey = this.key_;
          this.#go('idle');
        } else this.#go('write');
      }
      return;
    }

    // write
    const n = Math.min(this.total, Math.floor(this.t * this.speed));
    this.#renderText(n);
    if (n >= this.total) {
      this.shownKey = this.key_;
      this.#go('idle');
    }
  }
}
