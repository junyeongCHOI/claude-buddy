// 캐릭터가 설 수 있는 곳들 (전역 좌표 = macOS 화면 좌표, 주 모니터 왼쪽 위가 0,0)
//  - 모니터마다 바닥 하나 ('g:<디스플레이 id>')
//  - 보이는 창/위젯의 윗변 (창 목록은 앞에서 뒤 순서로 온다. 앞 창에 가려진 구간은 뺀다)
//  - 화이트보드 윗변 ('b:<key>')

const CATS = [
  ['editor', /^(code|cursor|visual studio code|xcode|intellij|webstorm|pycharm|android studio|sublime text|zed|nova|fleet|windsurf|goland|rider|clion|phpstorm|rubymine|datagrip|macvim|emacs|bbedit|textedit|kiro|trae)/i],
  ['terminal', /^(terminal|터미널|ターミナル|终端|iterm|warp|ghostty|alacritty|kitty|hyper|wezterm|tabby|rio)/i],
  ['browser', /^(google chrome|chrome|safari|arc|firefox|microsoft edge|brave|opera|vivaldi|orion|dia|zen|chromium|comet)/i],
  ['claude', /^claude/i],
  ['notes', /^(stickies|스티커|スティッキーズ|便笺|notes|메모|メモ|备忘录|reminders|미리 알림|リマインダー|提醒事项|notion|obsidian|bear|craft|things)/i],
  ['chat', /^(slack|카카오톡|kakaotalk|discord|telegram|messages|메시지|メッセージ|信息|line|microsoft teams|zoom)/i],
];

export function catOf(owner, kind) {
  if (kind === 'widget') return 'widget';
  for (const [cat, re] of CATS) if (re.test(owner || '')) return cat;
  return 'other';
}

const HEADROOM = 96; // 모니터 위쪽 끝에 이보다 가까운 창 윗변엔 올라가지 않는다
const MIN_SEG = 44;

export class World {
  constructor() {
    this.displays = [];
    this.home = { id: 'home', x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
    this.wins = new Map();
    this.extra = new Map(); // 화이트보드 (오버레이 안의 물건)
    this.grounds = new Map(); // 'g:<id>' → 바닥 사각형
    this.segs = new Map();
    this.order = [];
    this.occluders = []; // 패널처럼 창을 가리는 오버레이 UI (전역 좌표)
  }

  setOccluders(list) {
    this.occluders = list;
    this.rebuild();
  }

  /** @param {{id, x, y, w, h}[]} list 모니터 작업 영역 (전역 좌표), homeId 패널이 있는 모니터 */
  setDisplays(list, homeId) {
    this.displays = list.map((d) => ({ ...d, id: String(d.id) }));
    this.home = this.displays.find((d) => d.id === String(homeId)) || this.displays[0] || this.home;
    this.grounds = new Map(this.displays.map((d) => [`g:${d.id}`, { id: `g:${d.id}`, x: d.x, y: d.y + d.h - 1, w: d.w, h: 1, cat: 'ground', display: d }]));
    this.rebuild();
  }

  setWindows(list) {
    this.order = list;
    this.wins = new Map(list.map((w) => [w.id, { ...w, cat: catOf(w.owner, w.kind) }]));
    this.rebuild();
  }

  /** 화이트보드 윗변도 설 수 있는 곳 */
  setSurfaces(list) {
    this.extra = new Map(list.map((s) => [s.id, s]));
    this.rebuild();
  }

  /** (x, y) 가 들어 있는 모니터, 없으면 가장 가까운 모니터 */
  displayAt(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const d of this.displays) {
      const dx = x < d.x ? d.x - x : x > d.x + d.w ? x - d.x - d.w : 0;
      const dy = y < d.y ? d.y - y : y > d.y + d.h ? y - d.y - d.h : 0;
      const dist = dx * dx + dy * dy;
      if (dist === 0) return d;
      if (dist < bestD) {
        best = d;
        bestD = dist;
      }
    }
    return best || this.home;
  }

  /** 모니터 사이 빈 곳으로 나가지 않게 x 를 그 높이의 모니터 안으로 */
  clampX(x, y) {
    const d = this.displayAt(x, y);
    return Math.max(d.x + 14, Math.min(d.x + d.w - 14, x));
  }

  groundOf(d) {
    return this.segs.get(`g:${d.id}`)?.[0];
  }

  rebuild() {
    this.segs = new Map();
    const list = this.order || [];
    for (let i = 0; i < list.length; i++) {
      const w = list[i];
      const y = w.y;
      const d = this.displayAt(w.x + w.w / 2, y);
      if (y - d.y < HEADROOM || y > d.y + d.h - 40) continue;
      let parts = [[Math.max(d.x + 8, w.x + 10), Math.min(d.x + d.w - 8, w.x + w.w - 10)]];
      for (let j = 0; j < i && parts.length; j++) {
        const f = list[j];
        // 앞 창이 이 윗변이나 그 바로 위(캐릭터 서 있을 자리)를 덮으면 그 구간 제외
        if (f.y < y + 4 && f.y + f.h > y - 40) parts = subtract(parts, f.x - 6, f.x + f.w + 6);
      }
      // 화이트보드(오버레이라 항상 맨 앞)에 가려진 구간도 제외
      for (const b of [...this.extra.values(), ...this.occluders]) {
        if (b.y < y + 4 && b.y + b.h > y - 40) parts = subtract(parts, b.x - 6, b.x + b.w + 6);
      }
      const segs = parts.filter(([a, b]) => b - a >= MIN_SEG).map(([x1, x2]) => ({ x1, x2, y }));
      if (segs.length) this.segs.set(w.id, segs);
    }
    for (const s of this.extra.values()) {
      const d = this.displayAt(s.x + s.w / 2, s.y);
      if (s.y - d.y < 40 || s.y > d.y + d.h - 4) continue;
      const inset = 6;
      this.segs.set(s.id, [{ x1: s.x + inset, x2: s.x + s.w - inset, y: s.y }]);
    }
    for (const g of this.grounds.values()) this.segs.set(g.id, [{ x1: g.x + 8, x2: g.x + g.w - 8, y: g.y }]);
  }

  win(id) {
    return this.wins.get(id) || this.extra.get(id) || this.grounds.get(id);
  }

  catOfRide(ride) {
    return this.win(ride)?.cat || 'other';
  }

  segAt(ride, x, tol = 0) {
    return this.segs.get(ride)?.find((s) => x >= s.x1 - tol && x <= s.x2 + tol) || null;
  }

  /** y0 → y1 로 떨어지는 동안 처음 닿는 윗변 (바닥 포함) */
  landing(x, y0, y1) {
    let best = null;
    for (const [id, segs] of this.segs) {
      for (const s of segs) {
        if (x < s.x1 || x > s.x2 || s.y < y0 || s.y > y1) continue;
        if (!best || s.y < best.seg.y) best = { ride: id, seg: s };
      }
    }
    return best;
  }

  /**
   * 원하는 종류의 자리 고르기. groups 는 우선순위 순서의 카테고리 묶음 ('any' = 바닥 빼고 아무 데나).
   * display 를 주면 그 모니터 안에서만 고른다.
   * @returns {{ride, relX, x, cats} | null}
   */
  pickSpot(groups, from, { maxDist = Infinity, notRide, display } = {}) {
    for (const cats of groups) {
      const cands = [];
      for (const [id, segs] of this.segs) {
        if (id === notRide) continue;
        const cat = this.win(id)?.cat;
        if (!(cats.includes(cat) || (cats.includes('any') && cat !== 'ground'))) continue;
        for (const s of segs) {
          if (display) {
            const mx = (s.x1 + s.x2) / 2;
            if (mx < display.x || mx > display.x + display.w || s.y < display.y || s.y > display.y + display.h) continue;
          }
          cands.push({ ride: id, seg: s });
        }
      }
      let best = null;
      for (const c of cands) {
        const nx = Math.max(c.seg.x1, Math.min(c.seg.x2, from.x));
        const d = Math.hypot(nx - from.x, c.seg.y - from.y);
        if (d > maxDist) continue;
        const score = d * (0.6 + Math.random() * 0.8);
        if (!best || score < best.score) best = { ...c, score };
      }
      if (!best) continue;
      const { seg } = best;
      const margin = Math.min(22, (seg.x2 - seg.x1) / 3);
      let x = from.x >= seg.x1 && from.x <= seg.x2 ? from.x + (Math.random() - 0.5) * 120 : seg.x1 + Math.random() * (seg.x2 - seg.x1);
      x = Math.max(seg.x1 + margin, Math.min(seg.x2 - margin, x));
      const w = this.win(best.ride);
      return { ride: best.ride, relX: x - w.x, x, cats };
    }
    return null;
  }
}

function subtract(parts, a, b) {
  const out = [];
  for (const [x1, x2] of parts) {
    if (b <= x1 || a >= x2) out.push([x1, x2]);
    else {
      if (a > x1) out.push([x1, a]);
      if (b < x2) out.push([b, x2]);
    }
  }
  return out;
}
