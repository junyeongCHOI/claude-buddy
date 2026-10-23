// 캐릭터 한 마리: 물리(걷기·점프·낙하·창 타기) + 행동(모드별) + 그리기(아틀라스 프레임)
import { metaOf, loadArt, pickArt, sheetOf, paletteOf, paintFrame, opaqueAt, bboxOf } from './sprites.js';
import { deriveMode, boardText, bubbleText, WORK_PLACES, THINK_HOLD, DONE_FOR } from './mode.js';
import { POSES, SPRITE_PERCH, spriteLayout } from './perch.js';
import * as fx from './effects.js';
import { t as tr, agentLabel } from '../shared/i18n.js'; // 이 파일은 t 를 시간·목표 변수로 많이 써서 tr 로

const GRAV = 2100;
const FPS = { walk: 9, dangle: 6, think: 1.6, sleep: 0.9, cheer: 5, wave: 5, type: 6, read: 0.7 };
const STATIC_EMOTES = new Set(['joy', 'love', 'shock', 'laugh', 'sad', 'angry', 'nervous', 'dizzy']);
// 보드 옆에서 일할 때 도구 종류별 동작
const WORK_ANIM = { read: 'read', web: 'read', write: 'type', run: 'type', mcp: 'type', skill: 'type', other: 'type', plan: 'think' };
const IDLE_POSES = ['sit', 'sit', 'read', 'type', 'think', 'laugh', 'wave', 'joy'];
// 사용자를 부를 때: 끝났으면 기쁘게, 결정이 필요하면 다급하게 (title 은 i18n 키)
const CALL = {
  done: { title: 'call.done', emotes: ['cheer', 'joy', 'laugh', 'love'], pops: ['✨', '🎉', '👀'] },
  ask: { title: 'call.ask', emotes: ['shock', 'nervous', 'wave', 'cheer'], pops: ['❗', '🙋', '❓'] },
};
const ROAM_FAR_AFTER = 5 * 60_000; // 다 했다고 부르는데 이만큼 안 보면 다른 모니터까지 뛰어간다
const BUSY_AGAIN = new Set(['work', 'thinking', 'talking', 'listening', 'supervise']);
// 매달려 있을 때 이런 기분이면 만세

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sameSeg = (a, b) => a && b && a.x1 === b.x1 && a.x2 === b.x2 && a.y === b.y;

// 같은 값을 다시 쓰지 않는다 (매 프레임 스타일을 다시 쓰면 스타일 계산·합성이 계속 일어난다)
function set(el, prop, val) {
  const k = `_s_${prop}`;
  if (el[k] === val) return;
  el[k] = val;
  el.style[prop] = val;
}

export class Character {
  /**
   * @param {object} app
   * @param {object} agent  publicAgent
   * @param {object} look   { animal, fur, team, px }
   * @param {object} spawn  { x, y, vx, vy }
   */
  constructor(app, agent, look, spawn) {
    this.app = app;
    this.world = app.world;
    this.agent = agent;
    this.key = agent.key;
    this.animal = look.animal;
    this.fur = look.fur;
    this.team = look.team;
    this.px = look.px;
    this.meta = metaOf(this.animal);
    this.cell = this.meta.cell;
    this.h = (this.meta.charH || 34) * this.px; // 화면에서 캐릭터 키 (px)
    this.board = null;
    // 보드에 붙는 자세들 (서브에이전트는 부모 보드에 줄 서야 해서 옆면 자세는 뺀다)
    this.poses = (SPRITE_PERCH[this.animal] || []).filter(
      (p) => this.meta.anims[`p_${p}`] && this.meta.ledges?.[this.meta.anims[`p_${p}`][0]] && !(agent.kind === 'sub' && POSES[p].bar === 'left'),
    );
    this.poseName = this.poses[0] || null;
    this.slot = 0; // 부모 보드에서 몇 번째 자리인지 (서브에이전트만, app 이 정한다)
    this.lay = null; // 지금 보드에 붙은 자리 (spriteLayout)
    this.perchAt = 0;
    this.swing = { a: 0, w: 0 }; // 매달렸을 때 흔들림 (각도°, 각속도°/s)
    this.wiggleAt = 0;
    this.pose = null; // 몸에 건 자세 변형 (DOMMatrix)
    this.headOff = null;
    this.clipStr = '';

    this.x = spawn.x;
    this.y = spawn.y;
    this.vx = spawn.vx || 0;
    this.vy = spawn.vy || 0;
    this.phys = 'air';
    this.airTime = 0;
    this.ride = null;
    this.relX = 0;
    this.seg = null;
    this.facing = Math.random() < 0.5 ? 1 : -1;
    this.goal = null;
    this.jump = null;
    this.moving = false;
    this.squash = 0;
    this.landAt = 0;

    this.mode = null;
    this.modeAt = 0;
    this.emote = null;
    this.pauseUntil = 0;
    this.nextPlanAt = 0;
    this.nextIdleAt = 0;
    this.nextHopAt = 0;
    this.idlePose = 'sit';
    this.doneUntil = 0;
    this.want = null; // 보드에 쓸 글 { key, lines, at }
    this.peek = null; // 창 구경 { until, anim }
    this.call = null; // 사용자 부르기 { kind: 'done'|'ask', since, acked, nextBurst, nextMove }
    this.peekedTool = null;

    this.anim = '';
    this.animT = 0;
    this.frame = -1;
    this.dead = false;
    this.#build();
  }

  // ── DOM ───────────────────────────────────────────────

  #build() {
    const C = this.cell * this.px;
    const el = document.createElement('div');
    el.className = `buddy kind-${this.agent.kind}`;
    el.dataset.key = this.key;
    el.style.setProperty('--team', this.team);
    el.innerHTML =
      '<div class="aura"></div><div class="body"><div class="spr"></div></div>' +
      '<div class="cloud"><span></span></div><div class="zzz"><b>z</b><b>z</b><b>Z</b></div>' +
      '<div class="tag"><i></i><span></span></div><div class="call"><b></b><span></span></div>';
    this.el = el;
    this.body = el.querySelector('.body');
    this.spr = el.querySelector('.spr');
    this.cloud = el.querySelector('.cloud');
    this.zzz = el.querySelector('.zzz');
    this.tagText = el.querySelector('.tag span');
    this.callTitle = el.querySelector('.call b');
    this.callText = el.querySelector('.call span');
    this.callEl = el.querySelector('.call');
    this.zzzLetters = [...el.querySelectorAll('.zzz b')];
    this.cloudText = el.querySelector('.cloud span');
    this.flags = {};
    // .spr 는 1배 칸(발이 아래 가운데) 크기 그대로 두고, 그 안에 시트가 남긴 사각형만 캔버스로 그린다
    Object.assign(this.spr.style, { width: `${C}px`, height: `${C}px`, left: `${-C / 2}px`, top: `${-C}px` });
    this.cv = document.createElement('canvas');
    this.spr.appendChild(this.cv);
    el.style.setProperty('--h', `${Math.round(this.h)}px`);
    el.style.setProperty('--px', `${this.px}px`);
    el.querySelector('.aura').style.width = `${C * 0.42}px`;
    this.#updateTag();
    this.view = this.app.home;
    this.view.stage.appendChild(el);
  }

  #updateTag() {
    const label = agentLabel(this.agent);
    if (this.tagText.textContent !== label) this.tagText.textContent = label;
  }

  /** 언어가 바뀌었다 (말풍선·보드 글은 매 프레임 다시 고른다) */
  relabel() {
    this.#updateTag();
  }

  setAgent(agent) {
    const prev = this.agent;
    this.agent = agent;
    if (prev.name !== agent.name || prev.description !== agent.description) this.#updateTag();
  }

  get headPos() {
    const o = this.headOff;
    if (o) return { x: this.x + o.x, y: this.y + o.y - this.h * 0.1 };
    return { x: this.x, y: this.y - this.h * 1.1 };
  }

  get atBoard() {
    return this.phys === 'perch';
  }

  /** 매달려서 흔들리는 자세인가 */
  get swings() {
    return ['hang', 'upside'].includes(this.poseName);
  }

  /** 붙어 있을 보드: 메인은 자기 보드, 서브에이전트는 보드가 있는 가장 가까운 조상의 보드 */
  get host() {
    if (this.board) return this.board;
    let k = this.agent.parentKey;
    for (let i = 0; k && i < 6; i++) {
      const b = this.app.boards.get(k);
      if (b) return b;
      k = this.app.agents.get(k)?.parentKey;
    }
    return null;
  }

  /** 움직이는 게 없어서 화면을 천천히 그려도 되는가 (매달려 흔들리는 중이면 아니다) */
  get still() {
    if (this.goal || this.calling || this.flee || this.squash !== 0) return false;
    if (this.phys === 'perch') return !this.swings && Date.now() - Math.max(this.perchAt, this.wiggleAt) > 400;
    return this.phys === 'ground' && !this.moving;
  }

  // ── 바깥에서 오는 일 ───────────────────────────────────

  setEmote(name, ms, pause = false) {
    const now = Date.now();
    this.emote = { name, until: now + ms };
    if (pause) this.pauseUntil = now + ms;
  }

  hop(v = 330, vx = 0) {
    // 보드에 붙어 있으면 내려오지 않고 그 자세로 들썩 (매달렸으면 크게 흔들)
    if (this.phys === 'perch') {
      if (this.swings) this.swing.w += (Math.random() < 0.5 ? -1 : 1) * v * 0.35;
      else this.wiggleAt = Date.now();
      return;
    }
    if (this.phys !== 'ground') return;
    this.phys = 'air';
    this.vy = -v;
    this.vx = vx;
    this.ride = null;
    this.airTime = 0;
  }

  onActivity(act) {
    const now = Date.now();
    switch (act.type) {
      case 'status':
        if (act.to === 'busy' && this.mode === 'sleep') {
          this.setEmote('shock', 800, true);
          fx.pop(this.headPos.x, this.headPos.y, '❗');
        } else if (act.from === 'busy' && act.to === 'idle' && now - (this.interruptedAt || 0) < 15000) {
          // 사용자가 직접 멈춘 턴은 "다 했어요"가 아니다
          this.setEmote('sad', 1200, true);
        } else if (act.from === 'busy' && act.to === 'idle') {
          this.setEmote('cheer', 1900, true);
          fx.sparkle(this.headPos.x, this.headPos.y);
          this.doneUntil = now + DONE_FOR;
          this.startCall('done', true);
        } else if (act.to === 'waiting') {
          fx.pop(this.headPos.x, this.headPos.y, '❗');
        }
        break;
      case 'prompt':
        if (this.agent.kind === 'main') {
          fx.drop(
            '✉️',
            () => this.headPos,
            () => {
              this.setEmote('shock', 700, true);
              fx.pop(this.headPos.x, this.headPos.y, '❗');
            },
          );
        }
        break;
      case 'tool':
        if (act.cat === 'agent') fx.pop(this.headPos.x, this.headPos.y, '🐣');
        break;
      case 'tool_result':
        if (act.isError) {
          this.setEmote('nervous', 1300, true);
          fx.pop(this.headPos.x, this.headPos.y, '💦');
        }
        break;
      case 'interrupt':
        this.interruptedAt = now;
        this.setEmote('sad', 1600, true);
        break;
      case 'notify':
        fx.pop(this.headPos.x, this.headPos.y, '📬');
        break;
    }
  }

  get calling() {
    return !!this.call && !this.call.acked;
  }

  /** 패널·보드 헤더에 보일 상태 (부르는 중이면 끝/결정 구분) */
  get statusMode() {
    if (this.calling) return this.call.kind === 'done' ? 'calling-done' : 'calling';
    return this.mode;
  }

  /** 사용자를 부르기 시작 (메인 에이전트만) */
  startCall(kind, fresh = false) {
    if (this.agent.kind !== 'main' || this.leaving) return;
    // 같은 기다림 동안 한 번 확인했으면 다시 부르지 않는다 (끝날 때마다는 새로 부른다)
    if (!fresh && this.call && this.call.kind === kind) return;
    const now = Date.now();
    this.call = { kind, since: now, acked: false, nextBurst: now + 300, nextMove: now };
  }

  /** 사용자가 봤다 (마우스를 올리거나 클릭·집기·패널 행 클릭) */
  ack() {
    if (!this.calling) return;
    this.call.acked = true;
    this.goal = null;
    if (this.call.kind === 'done') this.doneUntil = Date.now() + DONE_FOR / 2;
    this.setEmote('love', 1400, true);
    fx.pop(this.headPos.x, this.headPos.y, '💕');
  }

  /** 다른 곳으로 뿅 옮기기 (모으기) — 그 자리 위에서 떨어진다 */
  teleport(x, y) {
    this.phys = 'air';
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.ride = null;
    this.goal = null;
    this.jump = null;
    this.peek = null;
    this.airTime = 0.3;
    fx.poof(x, y - this.h * 0.5, this.team);
  }

  /** 마우스로 집기 */
  grab() {
    this.ack();
    this.phys = 'held';
    this.goal = null;
    this.jump = null;
    this.ride = null;
    this.peek = null;
  }

  holdAt(x, y) {
    this.x = x;
    this.y = y + this.h * 1.3;
  }

  release(vx, vy) {
    this.phys = 'air';
    this.vx = clamp(vx, -1500, 1500);
    this.vy = clamp(vy, -1500, 900);
    this.airTime = 0.31;
  }

  poke() {
    const p = this.headPos;
    if (this.calling) return this.ack();
    if (this.mode === 'sleep') {
      this.setEmote('angry', 1300, true);
      fx.pop(p.x, p.y, '💢');
      return;
    }
    const r = pick([
      ['love', '💕'],
      ['laugh', '♪'],
      ['joy', '✨'],
    ]);
    this.setEmote(r[0], 1200, true);
    fx.pop(p.x, p.y, r[1]);
    this.hop(260);
  }

  bye() {
    this.leaving = true;
  }

  /** 떠나는 중에 다시 나타났으면(고정 풀었다 다시 고정 등) 그냥 남는다 */
  unbye() {
    this.leaving = false;
  }

  /** 화면 좌표 (x, y) 에 이 캐릭터의 불투명한 픽셀이 있는가 */
  hitTest(x, y) {
    const C = this.cell * this.px;
    let lx = x - this.x;
    let ly = y - this.y;
    if (this.phys === 'perch' && this.pose) {
      const p = this.pose.inverse().transformPoint(new DOMPoint(lx, ly));
      lx = p.x;
      ly = p.y;
    }
    let cx = Math.floor((lx + C / 2) / this.px);
    const cy = Math.floor((ly + C) / this.px);
    if (cx < 0 || cy < 0 || cx >= this.cell || cy >= this.cell) return false;
    if (this.facing < 0) cx = this.cell - 1 - cx;
    return opaqueAt(this.animal, this.frame, cx, cy, 3);
  }

  vanish(poof = true) {
    if (this.dead) return;
    this.dead = true;
    if (poof) fx.poof(this.x, this.y - this.h * 0.47, this.team);
    this.el.remove();
    this.app.onCharGone(this);
  }

  // ── 매 프레임 ──────────────────────────────────────────

  update(dt, now) {
    if (this.dead) return;
    this.animT += dt;
    this.squash = Math.max(0, this.squash - dt * 5);
    if (this.phys !== 'held') {
      this.#think(now);
      this.#physics(dt, now);
    }
  }

  #think(now) {
    const a = this.agent;
    let mode = this.leaving ? 'bye' : deriveMode(a, now);
    // 결정이 필요하면 부르고, 기다림이 끝나면(사용자가 답함) 멈춘다. 새로 일을 시작해도 멈춘다.
    if (mode === 'waiting') this.startCall('ask');
    else if (this.call?.kind === 'ask') this.call = null;
    if (this.call?.kind === 'done' && (BUSY_AGAIN.has(mode) || mode === 'bye')) this.call = null;
    if (this.calling && mode !== 'bye') mode = 'calling';
    if (mode === 'idle' && now < this.doneUntil) mode = 'done';
    if (mode !== this.mode) {
      this.mode = mode;
      this.modeAt = now;
      this.goal = mode === 'returning' || mode === 'bye' || mode === 'sleep' || mode === 'calling' ? null : this.goal;
      this.peek = null;
      if (mode === 'idle') this.nextIdleAt = now + rand(1500, 4000);
    }
    if (this.board) this.#boardBrain(now);

    // 서브에이전트는 일이 끝나거나 꺼지면 화면 밖으로 후다닥 도망간다
    if (a.kind === 'sub' && (mode === 'bye' || mode === 'returning')) {
      this.#startFlee(now);
      return;
    }
    switch (mode) {
      case 'bye':
        this.goal = null;
        if (now - this.modeAt > 1500) this.vanish();
        return;
      case 'sleep':
        // 창 위든 보드 위든 바닥이든 지금 있는 자리에서 잔다 (발판이 사라지면 떨어진 곳에서)
        this.goal = null;
        return;
      case 'idle':
        this.#wander(now);
        return;
      case 'calling':
        this.#callUser(now);
        return;
      default:
        this.#busy(now, mode);
    }
  }

  // 보드에 무엇을 쓸지 정하고, 보드 앞에 있을 때 쓴다 (멀리 있으면 1.5초 뒤 그냥 씀)
  #boardBrain(now) {
    const mode = this.mode;
    const hide = mode === 'sleep' || mode === 'bye';
    this.board.show(!hide);
    if (hide) return;
    const boardMode = mode === 'calling' ? (this.call.kind === 'done' ? 'done' : 'waiting') : mode;
    const lines = mode === 'thinking' && now - this.modeAt < THINK_HOLD ? null : boardText(this.agent, boardMode);
    if (lines) {
      const key = `${lines[0]}\u0000${lines[1]}`;
      if (!this.want || this.want.key !== key) this.want = { key, lines, at: now, done: false };
    }
    const w = this.want;
    if (w && !w.done && (this.atBoard || now - w.at > 1500 || !this.#wantsBoard())) {
      this.board.write(w.lines);
      w.done = true;
    }
  }

  #wantsBoard() {
    return !['idle', 'sleep', 'bye', 'returning'].includes(this.mode);
  }

  #busy(now, mode) {
    // 오래 걸리는 도구면 관련 창에 가서 구경하고 온다
    const p = this.agent.pending?.[this.agent.pending.length - 1];
    if (this.peek) {
      if (now > this.peek.until || mode !== 'work' || p?.id !== this.peek.tool) this.peek = null;
      else return;
    }
    if (mode === 'work' && p && this.atBoard && this.host?.settled && now - p.ts > 7000 && this.peekedTool !== p.id) {
      this.peekedTool = p.id;
      const groups = (WORK_PLACES[p.cat] || []).filter((g) => !g.includes('any'));
      const spot = groups.length && this.world.pickSpot(groups, this, { display: this.world.displayAt(this.x, this.y - 1) });
      if (spot) {
        const tool = p.id;
        this.goTo(spot, true, () => {
          this.peek = { until: Date.now() + 4500, anim: WORK_ANIM[p.cat] || 'type', tool };
        });
        return;
      }
    }
    if (mode === 'waiting' && this.atBoard && now > this.nextHopAt) {
      this.nextHopAt = now + 2400;
      this.hop(280);
    }
    // 내 보드로 가서 내 자세로 붙는다
    if (this.host?.visible && !this.atBoard && !this.goal && this.phys === 'ground' && now > this.nextPlanAt && now > this.pauseUntil) {
      this.nextPlanAt = now + 700;
      this.#pickPose();
      this.goal = { type: 'perch', hurry: true };
    }
  }

  #wander(now) {
    if (this.goal || now < this.nextIdleAt || now < this.pauseUntil) return;
    // 보드에 붙은 채로 쉬다가 가끔 내려와서 돌아다닌다
    if (this.phys === 'perch') {
      this.nextIdleAt = now + rand(4000, 10000);
      const r = Math.random();
      if (r < 0.35) this.#unperch();
      else if (r < 0.65 && this.poses.length > 1) {
        // 다른 자세로 고쳐 앉기 (폴짝 하고 자리를 옮긴다)
        const prev = this.poseName;
        while (this.poseName === prev) this.#pickPose();
        this.wiggleAt = now;
        this.#settle(now);
      } else {
        this.idlePose = pick(IDLE_POSES);
        this.animT = 0;
      }
      return;
    }
    if (this.phys !== 'ground') return;
    this.nextIdleAt = now + rand(3500, 9000);
    const r = Math.random();
    if (r < 0.32 && this.seg) {
      const d = rand(50, 200) * (Math.random() < 0.5 ? -1 : 1);
      const x = clamp(this.x + d, this.seg.x1 + 12, this.seg.x2 - 12);
      this.goTo({ ride: this.ride, x, relX: this.relX + (x - this.x) }, false);
    } else if (r < 0.55) {
      // 쉬는 동안엔 지금 모니터 안에서만 돌아다닌다 (잃어버리지 않게)
      const spot = this.world.pickSpot([['any', 'ground']], this, { maxDist: 700, notRide: this.ride, display: this.world.displayAt(this.x, this.y - 1) });
      if (spot) this.goTo(spot, false);
    } else {
      this.idlePose = pick(IDLE_POSES);
      this.animT = 0;
    }
  }

  // 사용자 부르기
  //  - 다 했으면(done): 확인할 때까지 창 위·바닥을 빨빨빨 뛰어다니며 껑충. 5분 넘게 안 보면 다른 모니터까지 넘어간다
  //  - 결정이 필요하면(ask): 커서 근처(최근에 봤으면) 또는 화면 아래 가운데로 와서 손을 흔들고 폴짝
  //  - 커서가 다가오면 멈춰서 쳐다본다 (마우스를 올리거나 누르기 쉽게 — 그러면 확인한 것)
  #callUser(now) {
    const c = this.call;
    const spec = CALL[c.kind];
    const mouse = this.app.mouse;
    const age = now - c.since;
    const seen = mouse && now - mouse.at < 15000 ? mouse : null;
    const near = seen && now - mouse.at < 3000 && Math.abs(mouse.x - this.x) < 150 && Math.abs(mouse.y - (this.y - this.h / 2)) < 150;
    if (near) {
      if (this.goal?.dash) this.goal = null;
      if (this.phys === 'ground') this.facing = mouse.x >= this.x ? 1 : -1;
    } else if (c.kind === 'done') this.#roam(now, c, age);
    else this.#comeToCursor(now, c, seen);
    const running = !!this.goal?.dash;
    if (near && c.kind === 'done') return; // 가만히 쳐다보며 기다린다
    if ((!this.goal || running) && (this.phys === 'ground' || this.phys === 'perch') && now > c.nextBurst && now > this.pauseUntil) {
      c.nextBurst = now + (running ? rand(900, 1800) : c.kind === 'ask' ? (age > 300_000 ? 9000 : age > 60_000 ? 4500 : 2600) : 2600);
      this.setEmote(pick(spec.emotes), 1100);
      // 뛰어다니는 중이면 달리던 쪽으로 껑충
      this.hop(running ? 300 : age > 60_000 ? 280 : 380, running ? this.facing * 170 : 0);
      fx.pop(this.headPos.x, this.headPos.y, pick(spec.pops));
    }
  }

  #roam(now, c, age) {
    if (this.phys === 'perch') this.#unperch();
    if (this.goal || this.phys !== 'ground' || now < c.nextMove) return;
    c.nextMove = now + rand(200, 800);
    const here = this.world.displayAt(this.x, this.y - 1);
    let display = here;
    if (age > ROAM_FAR_AFTER && this.world.displays.length > 1 && now > (c.nextFar || 0)) {
      // 커서가 있는 모니터부터 (이미 거기 있으면 다른 아무 모니터)
      const md = this.app.mouse ? this.world.displayAt(this.app.mouse.x, this.app.mouse.y) : null;
      display = md && md.id !== here.id ? md : pick(this.world.displays.filter((d) => d.id !== here.id));
      c.nextFar = now + rand(20_000, 35_000);
    }
    const spot = this.world.pickSpot([['any', 'ground']], this, { maxDist: display === here ? 650 : Infinity, notRide: this.ride, display });
    if (spot) this.goTo(spot, true);
    else if (this.seg) {
      // 갈 데가 없으면 지금 발판 위에서라도 왔다 갔다
      const x = clamp(this.x + rand(120, 320) * (Math.random() < 0.5 ? -1 : 1), this.seg.x1 + 12, this.seg.x2 - 12);
      this.goTo({ ride: this.ride, x, relX: this.relX + (x - this.x) }, true);
    }
    if (this.goal) this.goal.dash = true;
  }

  #comeToCursor(now, c, seen) {
    const home = this.world.home;
    const m = seen || { x: home.x + home.w / 2, y: home.y + home.h - 120 };
    const far = Math.abs(this.x - m.x) > 220 || this.y < m.y - 260 || this.y > m.y + 420;
    if (far && this.phys === 'perch') this.#unperch();
    if (far && !this.goal && this.phys === 'ground' && now > c.nextMove && now > this.pauseUntil) {
      c.nextMove = now + 3500;
      // 커서가 다른 모니터에 있으면 그 모니터로 건너간다
      const spot = this.world.pickSpot([['any', 'ground']], { x: m.x + (Math.random() - 0.5) * 140, y: m.y + 70 }, { display: this.world.displayAt(m.x, m.y) });
      if (spot) this.goTo(spot, true);
    }
    if (!this.goal && this.phys === 'ground') this.facing = m.x >= this.x ? 1 : -1;
  }

  // 도망가기 시작: 보드에서 뛰어내려 가까운 화면 가장자리 쪽으로. 일을 마쳤으면 보고서(📜)를 부모에게 던지고 간다.
  #startFlee(now) {
    if (this.flee) return;
    this.#unperch();
    const d = this.world.displayAt(this.x, this.y - 1);
    const dir = this.x - d.x < d.x + d.w - this.x ? -1 : 1;
    this.flee = { dir, d, at: now, dustAt: 0 };
    this.goal = null;
    this.jump = null;
    this.peek = null;
    this.call = null;
    this.phys = 'air';
    this.ride = null;
    this.vy = Math.min(this.vy, -380);
    this.facing = dir;
    this.setEmote('shock', 380);
    fx.pop(this.headPos.x, this.headPos.y, '💨');
    const parent = this.app.chars.get(this.agent.parentKey);
    if (this.mode === 'returning' && parent && !parent.dead) {
      fx.fly(
        '📜',
        () => this.headPos,
        () => parent.headPos,
        600,
        () => {
          if (parent.dead) return;
          parent.setEmote('love', 1400, true);
          fx.pop(parent.headPos.x, parent.headPos.y, '💌');
        },
      );
    }
  }

  // 창이나 보드는 무시하고 바닥까지 떨어진 뒤 그 모니터 밖으로 달려 나간다
  #fleeStep(dt, now) {
    const f = this.flee;
    const run = 560 * Math.sqrt(this.h / 68);
    const g = this.world.groundOf(f.d);
    this.x += f.dir * run * dt;
    this.facing = f.dir;
    if (this.phys === 'air') {
      this.vy = Math.min(1700, this.vy + GRAV * dt);
      this.y += this.vy * dt;
      this.airTime += dt;
      if (g && this.y >= g.y) {
        this.y = g.y;
        this.phys = 'ground';
        this.squash = 0.4;
        fx.dust(this.x, this.y);
      }
    } else {
      this.moving = true;
      if (now - f.dustAt > 220) {
        f.dustAt = now;
        fx.dust(this.x - f.dir * this.h * 0.3, this.y);
      }
    }
    const out = this.x < f.d.x - this.h || this.x > f.d.x + f.d.w + this.h;
    if (out || now - f.at > 8000) this.vanish(!out);
  }

  goTo(spot, hurry, onArrive) {
    this.#unperch();
    this.goal = { type: 'spot', ride: spot.ride, relX: spot.relX, x: spot.x, hurry, onArrive };
  }

  // ── 물리 ───────────────────────────────────────────────

  #physics(dt, now) {
    this.moving = false;
    if (this.flee) this.#fleeStep(dt, now);
    else if (this.phys === 'ground') {
      this.#follow();
      if (this.phys === 'ground' && now >= this.pauseUntil) this.#walk(dt, now);
    } else if (this.phys === 'jump') this.#jumpStep(dt, now);
    else if (this.phys === 'air') this.#fall(dt, now);
    else if (this.phys === 'perch') this.#perchFollow(dt, now);
  }

  // ── 보드에 붙기 ────────────────────────────────────────

  /** 프레임 idx 의 불투명 사각형 (발 기준 좌표, 보는 방향 반영) */
  #box(idx, facing) {
    const [x0, y0, x1, y1] = bboxOf(this.animal, idx);
    const C = this.cell * this.px;
    const l = -C / 2 + x0 * this.px;
    const r = -C / 2 + x1 * this.px;
    return { l: facing < 0 ? -r : l, r: facing < 0 ? -l : r, t: -C + y0 * this.px, b: -C + y1 * this.px };
  }

  /** 붙을 때마다 어울리는 자세 하나 (첫 자세가 두 배로 자주) */
  #pickPose() {
    // 웅크려 자는 자세는 쉴 때만 (일하는데 자는 것처럼 보이면 헷갈린다)
    const list = this.mode === 'idle' ? this.poses : this.poses.filter((p) => p !== 'curl');
    if (!list.length) return;
    const bag = [list[0], ...list];
    this.poseName = bag[Math.floor(Math.random() * bag.length)];
  }

  /** 지금 내 보드에 붙을 자리 (보드가 안 보이면 null) */
  #layout() {
    const b = this.host;
    if (!b?.visible || !this.poseName) return null;
    const idx = this.meta.anims[`p_${this.poseName}`][0];
    return spriteLayout(this.poseName, b, { h: this.h, C: this.cell * this.px, px: this.px, ledge: this.meta.ledges[idx], box: this.#box(idx, 1) }, this.slot);
  }

  #settle(now) {
    this.phys = 'perch';
    this.goal = null;
    this.jump = null;
    this.ride = null;
    this.peek = null;
    this.perchAt = now;
    this.squash = 0.4;
    this.swing = { a: 0, w: this.swings ? 70 : 0 };
    this.#perchFollow(0, now);
  }

  // 보드를 따라 다닌다. 보드가 사라지면 떨어진다. 매달렸으면 보드를 흔든 만큼 반대로 흔들린다.
  #perchFollow(dt, now) {
    const lay = this.#layout();
    if (!lay) return this.#drop();
    const s = this.swing;
    if (dt > 0 && this.swings) {
      const vx = (lay.x - this.x) / dt;
      s.w -= (vx - (s.vx || 0)) * 0.1;
      s.vx = vx;
      const rest = Math.sin(now / 560) * 2.5; // 가만히 있어도 살랑살랑
      s.w += (-38 * (s.a - rest) - 2.6 * s.w) * dt;
      s.a = clamp(s.a + s.w * dt, -35, 35);
    }
    this.x = lay.x;
    this.y = lay.y;
    this.facing = lay.facing;
    this.lay = lay;
  }

  // 보드에서 내려온다 (매달렸으면 손을 놓고, 아니면 폴짝)
  #unperch() {
    if (this.phys !== 'perch') return;
    const k = this.poseName;
    this.phys = 'air';
    this.ride = null;
    this.airTime = 0;
    this.vx = k === 'hug' || k === 'climb' ? 140 : rand(-60, 60);
    this.vy = this.swings ? 0 : k === 'peek' ? -420 : -300;
  }

  /** 자세 변형: 고쳐 앉을 때 들썩, 매달렸으면 막대를 축으로 흔들 */
  #poseMatrix(now) {
    const L = this.lay;
    const w = now - this.wiggleAt;
    const lift = w < 380 ? -Math.sin((Math.PI * w) / 380) * this.h * 0.16 : 0;
    const m = new DOMMatrix().translate(0, lift);
    return L.pivot == null ? m : m.translate(0, L.pivot).rotate(this.swing.a).translate(0, -L.pivot);
  }

  // 서 있는 창/보드가 움직이면 같이 움직이고, 사라지면 떨어진다
  #follow() {
    if (this.ride == null) return this.#drop();
    const w = this.world.win(this.ride);
    if (!w) return this.#drop();
    this.x = w.x + this.relX;
    let seg = this.world.segAt(this.ride, this.x, 3);
    // 자는 동안엔 앞 창이나 보드에 가려져도 그 창 윗변에서 계속 잔다 (창이 사라지거나 비켜나야 떨어짐)
    if (!seg && this.mode === 'sleep' && this.x >= w.x && this.x <= w.x + w.w) seg = { x1: w.x, x2: w.x + w.w, y: w.y };
    if (!seg) return this.#drop();
    this.y = seg.y;
    this.seg = seg;
  }

  #drop() {
    this.phys = 'air';
    this.vx = 0;
    this.vy = 0;
    this.ride = null;
    this.airTime = 0;
  }

  #resolve(g) {
    if (g.type === 'char') {
      const c = g.ch;
      if (!c || c.dead) return null;
      if (c.phys !== 'ground' || !c.seg) return { wait: true };
      const side = this.x < c.x ? -1 : 1;
      const x = clamp(c.x + side * g.offset, c.seg.x1 + 4, c.seg.x2 - 4);
      return { ride: c.ride, seg: c.seg, x, y: c.y };
    }
    if (g.type === 'perch') {
      const l = this.#layout();
      return l && { perch: true, ride: null, seg: { x1: l.x - 1, x2: l.x + 1, y: l.y }, x: l.x, y: l.y };
    }
    if (g.ride == null) return null;
    const w = this.world.win(g.ride);
    if (!w) return null;
    const x = w.x + g.relX;
    const seg = this.world.segAt(g.ride, x, 8);
    if (!seg) return null;
    return { ride: g.ride, seg, x: clamp(x, seg.x1 + 4, seg.x2 - 4), y: seg.y };
  }

  #speed(g) {
    return (g.dash ? 240 : g.hurry ? 120 : 58) * Math.sqrt(this.h / 68) * (this.agent.kind === 'sub' ? 1.15 : 1);
  }

  #step(d) {
    this.x += d;
    if (this.ride != null) this.relX += d;
    this.facing = d > 0 ? 1 : -1;
    this.moving = true;
  }

  #walk(dt, now) {
    const g = this.goal;
    if (!g) return;
    const t = this.#resolve(g);
    if (!t) {
      this.goal = null;
      return;
    }
    if (t.wait) return;
    const same = t.ride === this.ride && (t.ride == null || sameSeg(t.seg, this.seg));
    if (same) {
      const dx = t.x - this.x;
      if (Math.abs(dx) < 2.5) {
        this.goal = null;
        g.onArrive?.();
        return;
      }
      this.#step(Math.sign(dx) * Math.min(Math.abs(dx), this.#speed(g) * dt));
      return;
    }
    // 다른 곳: 가까워질 때까지 걷다가 점프 (다른 모니터라도 폴짝)
    const seg = this.seg || t.seg;
    const want = clamp(t.x, seg.x1 + 6, seg.x2 - 6);
    const dx = want - this.x;
    if (Math.abs(t.x - this.x) > 260 && Math.abs(dx) > 3) {
      this.#step(Math.sign(dx) * Math.min(Math.abs(dx), this.#speed(g) * dt));
    } else {
      const dist = Math.hypot(t.x - this.x, t.y - this.y);
      this.phys = 'jump';
      this.jump = { g, x0: this.x, y0: this.y, t: -0.1, T: clamp(0.42 + dist / 1700, 0.42, 1.25), h: 46 + Math.abs(t.x - this.x) * 0.1 };
      this.ride = null;
      this.facing = t.x >= this.x ? 1 : -1;
    }
  }

  #jumpStep(dt, now) {
    const j = this.jump;
    j.t += dt;
    if (j.t < 0) return; // 웅크리기
    const t = this.#resolve(j.g);
    if (!t || t.wait) {
      if (!t) this.goal = null;
      this.phys = 'air';
      this.vx = 0;
      this.vy = 0;
      this.airTime = 0.3;
      return;
    }
    const p = Math.min(1, j.t / j.T);
    const top = Math.min(j.y0, t.y) - j.h;
    this.x = j.x0 + (t.x - j.x0) * p;
    this.y = (1 - p) * (1 - p) * j.y0 + 2 * (1 - p) * p * top + p * p * t.y;
    this.jumpP = p;
    if (p >= 1) {
      if (t.perch) this.#settle(now);
      else this.#land(t.ride, t.x, t.y, now, 500);
    }
  }

  #fall(dt, now) {
    this.airTime += dt;
    this.vy = Math.min(1700, this.vy + GRAV * dt);
    const y0 = this.y;
    this.x += this.vx * dt;
    this.vx *= Math.exp(-1.2 * dt);
    this.y += this.vy * dt;
    // 모니터 사이 빈 곳으로 나가면 벽에 튕긴다
    const cx = this.world.clampX(this.x, this.y);
    if (cx !== this.x) {
      this.vx = -this.vx * 0.5;
      this.x = cx;
    }
    if (this.vy <= 0) return;
    const hit = this.world.landing(this.x, y0, this.y);
    if (hit) return this.#land(hit.ride, this.x, hit.seg.y, now, this.vy);
    // 바닥 끝자락으로 빠지면 그 모니터 바닥에 세운다
    const d = this.world.displayAt(this.x, y0);
    const g = this.world.groundOf(d);
    if (g && this.y >= g.y) this.#land(`g:${d.id}`, clamp(this.x, g.x1, g.x2), g.y, now, this.vy);
  }

  #land(ride, x, y, now, impact) {
    this.phys = 'ground';
    this.ride = ride;
    this.x = x;
    this.y = y;
    const w = ride == null ? null : this.world.win(ride);
    this.relX = w ? x - w.x : 0;
    this.seg = this.world.segAt(ride, x, 6) || { x1: x - 1, x2: x + 1, y };
    this.squash = Math.min(1, 0.35 + impact / 1800);
    this.landAt = now;
    if (impact > 700) fx.dust(x, y);
    if (impact > 1300) this.setEmote('dizzy', 1600, true);
  }

  /** 같은 자리에 겹쳐 서 있으면 살짝 밀어낸다 */
  nudge(d) {
    if (this.goal || this.phys !== 'ground' || !this.seg || this.atBoard) return;
    const x = clamp(this.x + d, this.seg.x1 + 4, this.seg.x2 - 4);
    if (this.ride != null) this.relX += x - this.x;
    this.x = x;
  }

  // ── 그리기 ─────────────────────────────────────────────

  #pickAnim(now) {
    if (this.phys === 'held') return 'dangle';
    if (this.phys === 'jump') return 'jump';
    if (this.phys === 'air') return this.airTime > 0.3 ? 'fall' : 'jump';
    if (this.moving) return 'walk';
    // 매달려 있으면 팔 든 모습만 (신나면 만세)
    if (this.phys === 'perch' && this.lay) return this.#spritePose(now);
    if (this.emote && now < this.emote.until) return this.emote.name;
    if (now - this.landAt < 110) return 'jump';
    const m = this.mode;
    if (m === 'sleep') return 'sleep';
    if (m === 'bye' || m === 'calling') return 'wave';
    if (this.peek) return this.peek.anim;
    if (this.atBoard) {
      if (this.board?.writing) return 'wave';
      const p = this.agent.pending?.[this.agent.pending.length - 1];
      switch (m) {
        case 'work':
          return WORK_ANIM[p?.cat] || 'type';
        case 'supervise':
        case 'thinking':
          return 'think';
        case 'waiting':
          return 'wave';
        case 'listening':
          return 'shock';
        case 'talking':
        case 'done':
          return 'joy';
        default:
          return 'sit';
      }
    }
    if (m === 'thinking' || m === 'supervise') return 'think';
    if (m === 'idle' || m === 'done') return this.idlePose;
    return 'sit';
  }

  // 전용 자세의 프레임: 기분·하는 일에 맞는 프레임이 있으면 그것, 아니면 가만히 있는 프레임
  #spritePose(now) {
    const spec = POSES[this.poseName];
    const e = this.emote && now < this.emote.until ? this.emote.name : '';
    const m = this.mode;
    const p = this.agent.pending?.[this.agent.pending.length - 1];
    let f;
    if (['shock', 'nervous', 'sad', 'angry', 'dizzy'].includes(e)) f = spec.alert;
    else if (e === 'wave' || m === 'waiting' || m === 'calling') f = spec.wave ?? spec.happy;
    else if (e || m === 'talking' || m === 'done') f = spec.happy ?? spec.wave;
    else if (m === 'work') f = spec[WORK_ANIM[p?.cat] || 'type'];
    else if (m === 'idle' && this.idlePose === 'think') f = spec.sleepy;
    return `p_${this.poseName}:${f ?? 'idle'}`;
  }

  #jumpFrame(now) {
    if (this.phys === 'jump') return this.jump.t < 0 ? 0 : this.jumpP < 0.5 ? 1 : 2;
    if (this.phys === 'air') return 2;
    return 3; // 착지
  }

  render(now) {
    if (this.dead) return;
    const anim = this.#pickAnim(now);
    if (anim !== this.anim) {
      this.anim = anim;
      this.animT = 0;
    }
    const list = anim === 'hang' ? [this.meta.anims.jump[1]] : this.meta.anims[anim] || this.meta.anims.sit;
    let idx;
    if (anim.startsWith('p_')) {
      // 전용 자세 'p_<자세>:<프레임 번호|idle>' — idle 은 두 프레임을 천천히 번갈아
      const [name, which] = anim.split(':');
      const frames = this.meta.anims[name];
      const idle = POSES[name.slice(2)].idle;
      idx = which === 'idle' ? frames[idle[Math.floor(this.animT * 1.1) % idle.length]] : frames[Number(which)] ?? frames[0];
    } else if (anim === 'jump') idx = list[Math.min(list.length - 1, this.#jumpFrame(now))];
    else {
      const fps = (FPS[anim] || 0) * (anim === 'walk' ? (this.flee ? 2.2 : this.goal?.dash ? 1.9 : 1) : 1); // 도망가거나 뛰어다닐 땐 발이 빨라진다
      idx = list[fps ? Math.floor(this.animT * fps) % list.length : 0];
    }
    if (idx !== this.frame) {
      this.frame = idx;
      this.dirty = true;
    }

    // 찌그러짐·통통 튀기
    let sx = 1 + 0.16 * this.squash;
    let sy = 1 - 0.22 * this.squash;
    let by = 0;
    if (this.phys === 'jump' && this.jump.t < 0) {
      sx = 1.12;
      sy = 0.88;
    } else if (this.phys === 'jump' || (this.phys === 'air' && this.vy < 0)) {
      sx = 0.94;
      sy = 1.07;
    }
    if (STATIC_EMOTES.has(anim)) by = -Math.abs(Math.sin(this.animT * 7)) * this.h * 0.07;
    else if (anim === 'sit' || anim === 'sleep') sy *= 1 + Math.sin(this.animT * 2.4) * 0.015;
    set(this.spr, 'transform', `scaleX(${this.facing})`);
    this.#renderPose(now, by, sx, sy);

    // 몸 가운데가 있는 모니터 화면으로 요소를 옮긴다
    const v = this.app.viewAt(this.x, this.y - this.h * 0.5);
    if (v !== this.view) {
      v.stage.appendChild(this.el);
      this.view = v;
      this.dirty = true;
    }
    this.#applySkin();
    if (this.dirty && this.sheet) {
      paintFrame(this.cv, this.sheet, this.pal, this.frame);
      this.dirty = false;
    }
    set(this.el, 'transform', `translate3d(${(this.x - v.x).toFixed(1)}px, ${(this.y - v.y).toFixed(1)}px, 0)`);
    set(this.el, 'zIndex', String(1000 + Math.round(this.y)));
    const asleep = this.mode === 'sleep';
    // 말풍선: 생각하거나 도우미를 기다리는 동안(서브에이전트는 일하는 동안에도) 실제로 하는 일을 보여 준다
    const m = this.mode;
    const bubble = !this.flee && (m === 'thinking' || m === 'supervise' || (m === 'work' && this.agent.kind === 'sub' && !this.peek));
    set(this.cloud, 'display', bubble ? '' : 'none');
    if (bubble) this.#placeBubble();
    set(this.zzz, 'display', anim === 'sleep' ? '' : 'none');
    const calling = this.calling;
    if (calling) {
      const title = tr(CALL[this.call.kind].title);
      const p = this.agent.pending?.[this.agent.pending.length - 1];
      const text = this.call.kind === 'ask' && p?.cat === 'ask' ? p.arg || this.agent.name : this.agent.name;
      if (this.callTitle.textContent !== title) this.callTitle.textContent = title;
      if (this.callText.textContent !== text) this.callText.textContent = text;
    }
    // 작은 반복 효과는 CSS 무한 애니메이션(화면 주사율 120Hz 로 돈다) 대신 이 루프(최대 30fps)에서
    const t = now / 1000;
    if (anim === 'sleep') {
      this.zzzLetters.forEach((b, i) => {
        const p = ((t + i * 0.9) % 2.7) / 2.7;
        set(b, 'transform', `translate(${(14 * p).toFixed(1)}px, ${(-26 * p).toFixed(1)}px)`);
        set(b, 'opacity', (p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8).toFixed(2));
      });
    }
    if (calling) {
      const k = (1 - Math.cos((t / 1.1) * Math.PI * 2)) / 2;
      set(this.callEl, 'transform', `translate(-50%, -100%) scale(${(1 + 0.06 * k).toFixed(3)})`);
    }
    this.#cls('calling', calling);
    this.#cls('at-board', this.atBoard);
    this.#cls('asleep', asleep);
    this.#cls('hidden', asleep && !this.app.config.showSleeping);
  }

  // 몸 변형(자세·통통·찌그러짐)과 zzz 자리
  #renderPose(now, by, sx, sy) {
    if (!(this.phys === 'perch' && this.lay)) {
      set(this.body, 'transform', `translateY(${by.toFixed(1)}px) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`);
      if (this.pose) {
        this.pose = null;
        this.headOff = null;
        set(this.zzz, 'translate', '');
      }
      return;
    }
    this.pose = this.#poseMatrix(now);
    set(this.body, 'transform', this.pose.translate(0, by).scale(sx, sy).toString());

    const head = this.pose.transformPoint(new DOMPoint(0, -this.h));
    this.headOff = { x: head.x, y: head.y };
    set(this.zzz, 'translate', `${head.x.toFixed(1)}px ${(head.y + this.h).toFixed(1)}px`);
  }

  // 말풍선은 지금 프레임의 실제 몸 윤곽(귀 포함) 바로 위에 띄워서 캐릭터를 가리지 않게 한다
  #placeBubble() {
    const text = bubbleText(this.agent, this.mode);
    if (this.cloudText.textContent !== text) this.cloudText.textContent = text;
    const b = this.#box(this.frame, this.facing);
    const m = this.pose || new DOMMatrix();
    let top = Infinity;
    let cx = 0;
    for (const [x, y] of [[b.l, b.t], [b.r, b.t], [b.l, b.b], [b.r, b.b]]) {
      const p = m.transformPoint(new DOMPoint(x, y));
      top = Math.min(top, p.y);
      cx += p.x / 4;
    }
    set(this.cloud, 'transform', `translate(${cx.toFixed(1)}px, ${(top - 5).toFixed(1)}px) translate(-14px, -100%)`);
  }

  // 모니터 배율(레티나 2, 보통 모니터 1)과 캐릭터 크기에 맞는 해상도 판을 고른다:
  // 그림 한 픽셀이 화면 픽셀 정수 개로 떨어지는 판 중 가장 촘촘한 것 → 늘 또렷하게(pixelated) 그린다.
  // 그 판을 아직 못 불러왔으면 기본 판으로 그리다가 다 불러오면 바꾼다
  #applySkin() {
    const dpr = this.view?.win?.devicePixelRatio || 1;
    if (dpr === this.skinDpr) return;
    this.skinDpr = dpr;
    let art = pickArt(this.meta, this.px * dpr);
    if (!sheetOf(this.animal, art)) {
      loadArt(this.animal, art).then(() => (this.skinDpr = null));
      art = 1;
    }
    const sh = sheetOf(this.animal, art);
    if (sh === this.sheet) return;
    this.sheet = sh;
    this.pal = paletteOf(this.animal, this.fur, art);
    // 캔버스 픽셀 하나 = CSS px/art (= 화면 픽셀 정수 개)
    const k = this.px / art;
    Object.assign(this.cv.style, { left: `${sh.x0 * k}px`, top: `${sh.y0 * k}px`, width: `${sh.w * k}px`, height: `${sh.h * k}px` });
    this.dirty = true;
  }

  // 클래스도 바뀔 때만
  #cls(name, on) {
    const k = `c:${name}`;
    if (this.flags[k] === on) return;
    this.flags[k] = on;
    this.el.classList.toggle(name, on);
  }
}
