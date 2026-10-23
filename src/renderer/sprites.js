// 픽셀 스프라이트를 불러오고, 캐릭터마다 털색을 입혀 그린다.
//  - 아틀라스(PNG)는 불러올 때 한 번만 풀어서, 모든 프레임을 덮는 사각형 밖의 빈 여백은 버리고
//    픽셀마다 색 번호 1바이트로 들고 있는다 (색은 동물마다 50개 안쪽). GPU 에 큰 그림을 올리지 않는다.
//  - 털색은 그 색 번호표(팔레트)에서 털 색(fur.colors·lines)만 새 털색으로 바꿔 칠한다 —
//    원래 털색(base)과의 명도 차이는 유지. 캐릭터는 지금 프레임 하나만 작은 캔버스에 그린다.

const BASE = new URL('../../assets/sprites/', import.meta.url);

// 털색 이름은 i18n 의 'fur.<id>'
export const FURS = {
  orig: null,
  black: '#3b3538',
  darkbrown: '#5c3b2a',
  brown: '#8a5a3a',
  lightbrown: '#ba8d65',
  redbrown: '#a14e2b',
  orange: '#ef8f38',
  tan: '#c89956',
  beige: '#dcc49f',
  cream: '#f1deb4',
  white: '#f5f2ec',
  gray: '#9fa4ac',
  darkgray: '#595e66',
  lime: '#97d257',
  teal: '#3db398',
  darkgreen: '#3d8c42',
  yellow: '#e8c23a',
  blue: '#4a8fd9',
};

// 동물마다 어울리는 털색
const SPECIES_FURS = {
  cat: ['orig', 'black', 'darkbrown', 'brown', 'lightbrown', 'redbrown', 'tan', 'beige', 'cream', 'white', 'gray', 'darkgray'],
  dog: ['orig', 'cream', 'white', 'black', 'tan', 'brown', 'redbrown', 'beige', 'gray'],
  bear: ['orig', 'darkbrown', 'brown', 'lightbrown', 'black', 'white', 'cream', 'redbrown', 'gray'],
  rabbit: ['orig', 'cream', 'beige', 'lightbrown', 'brown', 'darkbrown', 'gray', 'darkgray', 'black', 'tan'],
  fox: ['orig', 'redbrown', 'tan', 'white', 'gray', 'darkgray', 'cream', 'black'],
  panda: ['orig', 'darkbrown', 'brown', 'darkgray', 'gray'],
  penguin: ['orig', 'black', 'darkgray', 'gray', 'brown'],
  hamster: ['orig', 'cream', 'white', 'gray', 'darkgray', 'brown', 'black', 'beige', 'orange', 'tan'],
  frog: ['orig', 'lime', 'teal', 'darkgreen', 'brown', 'yellow', 'blue'],
  chick: ['orig', 'cream', 'white', 'orange', 'lightbrown', 'gray', 'beige'],
};

export const TEAM_COLORS = [
  '#ff6b6b',
  '#4d96ff',
  '#2fb86e',
  '#ff9f1c',
  '#a374ff',
  '#ff6fae',
  '#14b8a6',
  '#e2b007',
  '#5c7cfa',
  '#e8590c',
];

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const metas = new Map();
const sheets = new Map(); // `${animal}@${art}` → 색 번호 시트 (indexSheet)
const alphas = new Map(); // animal → { w, a } — 불투명한 픽셀 비트 (투명한 칸 여백은 클릭·호버로 안 친다)
const solid = (al, x, y) => (al.a[(y * al.w + x) >> 3] >> ((y * al.w + x) & 7)) & 1;
export let ANIMALS = [];

async function readPixels(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth;
  cv.height = img.naturalHeight;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, cv.width, cv.height);
  const w = cv.width;
  cv.width = cv.height = 0; // 캔버스 메모리를 GC 전에 바로 돌려준다
  return { w, d: data };
}

export async function loadSprites() {
  const index = await fetch(new URL('index.json', BASE)).then((r) => r.json());
  ANIMALS = index.animals;
  await Promise.all(
    ANIMALS.map(async (a) => {
      const meta = await fetch(new URL(`${a}.json`, BASE)).then((r) => r.json());
      metas.set(a, meta);
      const { w, d } = await readPixels(new URL(`${a}.png`, BASE).href);
      const n = d.length / 4;
      const mask = new Uint8Array((n + 7) >> 3); // 픽셀당 1비트
      for (let i = 0; i < n; i++) if (d[i * 4 + 3] > 40) mask[i >> 3] |= 1 << (i & 7);
      alphas.set(a, { w, a: mask });
      sheets.set(`${a}@1`, indexSheet(meta, 1, w, d));
    }),
  );
  return ANIMALS;
}

export const metaOf = (animal) => metas.get(animal);

/** 프레임 idx 의 칸 안 좌표 (cx, cy) 근처 r 픽셀 안에 불투명한 픽셀이 있는가 */
export function opaqueAt(animal, idx, cx, cy, r = 2) {
  const m = metas.get(animal);
  const al = alphas.get(animal);
  if (!m || !al || idx < 0) return true;
  const c = m.cell;
  const ox = (idx % m.cols) * c;
  const oy = Math.floor(idx / m.cols) * c;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= c || y >= c) continue;
      if (solid(al, ox + x, oy + y)) return true;
    }
  }
  return false;
}

const boxes = new Map();
/** 프레임 idx 에서 불투명한 픽셀이 차지하는 칸 안 사각형 [x0, y0, x1, y1] (x1·y1 은 끝 다음 칸) */
export function bboxOf(animal, idx) {
  const key = `${animal}:${idx}`;
  if (boxes.has(key)) return boxes.get(key);
  const m = metas.get(animal);
  const al = alphas.get(animal);
  if (!m || !al) return [0, 0, m?.cell || 96, m?.cell || 96];
  const c = m.cell;
  const ox = (idx % m.cols) * c;
  const oy = Math.floor(idx / m.cols) * c;
  let x0 = c;
  let y0 = c;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < c; y++) {
    for (let x = 0; x < c; x++) {
      if (!solid(al, ox + x, oy + y)) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x + 1);
      y1 = Math.max(y1, y + 1);
    }
  }
  const box = x1 > x0 ? [x0, y0, x1, y1] : [0, 0, c, c];
  boxes.set(key, box);
  return box;
}

export function fursOf(animal) {
  return SPECIES_FURS[animal] || ['orig'];
}

/** seed 로 털색 하나 고르기 (같은 에이전트는 항상 같은 색) */
export function pickFur(animal, seed) {
  const list = fursOf(animal);
  return list[hash(`${seed}|fur`) % list.length];
}

// ── 색 변환 ─────────────────────────────────────────────

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function furMap(meta, targetHex) {
  const [hb, sb, lb] = rgbToHsl(...meta.fur.base);
  const [ht, st, lt] = rgbToHsl(...hexToRgb(targetHex));
  // 아주 밝거나 어두운 털은 음영 폭을 줄여야 뭉개지지 않는다
  const k = lt > 0.8 ? 0.55 : lt < 0.28 ? 0.6 : 0.9;
  const map = new Map();
  for (const c of meta.fur.colors) {
    const [h, s, l] = rgbToHsl(...c);
    const nl = clamp(lt + (l - lb) * k, 0.07, 0.97);
    const ns = clamp(sb > 0.06 ? st * (s / sb) : st, 0, 1);
    const nh = ht + (h - hb) * 0.25;
    map.set((c[0] << 16) | (c[1] << 8) | c[2], hslToRgb(nh, ns, nl));
  }
  // 털 안쪽 선은 새 털색 쪽으로 물들이되 늘 어둡게 (흰 털이어도 선이 사라지지 않게)
  for (const c of meta.fur.lines || []) {
    const [, , l] = rgbToHsl(...c);
    map.set((c[0] << 16) | (c[1] << 8) | c[2], hslToRgb(ht, st * 0.8, Math.min(l, lt * 0.5)));
  }
  return map;
}

/**
 * 아틀라스 픽셀(d, 가로 W) → 색 번호 시트 { x0, y0, w, h, px, colors, keys }.
 * 칸 안 (x0, y0) 부터 w × h 만 남긴다 (모든 프레임을 덮는 사각형). colors 는 번호별 RGBA, keys 는 털로 칠할 색이면 그 RGB.
 * 털색 픽셀이라도 까만 픽셀에 둘러싸였으면(눈 하이라이트) 원래 색으로 남기도록 다른 번호를 준다.
 */
function indexSheet(meta, art, W, d) {
  const c = Math.round(meta.cell * art);
  const { cols, frames: n } = meta;
  const at = (f, x, y) => ((Math.floor(f / cols) * c + y) * W + (f % cols) * c + x) * 4;
  let x0 = c;
  let y0 = c;
  let x1 = 0;
  let y1 = 0;
  for (let f = 0; f < n; f++) {
    for (let y = 0; y < c; y++) {
      for (let x = 0; x < c; x++) {
        if (!d[at(f, x, y) + 3]) continue;
        if (x < x0) x0 = x;
        if (x >= x1) x1 = x + 1;
        if (y < y0) y0 = y;
        if (y >= y1) y1 = y + 1;
      }
    }
  }
  const w = Math.max(0, x1 - x0);
  const h = Math.max(0, y1 - y0);
  const fur = new Set([...(meta.fur?.colors || []), ...(meta.fur?.lines || [])].map(([r, g, b]) => (r << 16) | (g << 8) | b));
  const dark = (i) => d[i + 3] > 0 && d[i] + d[i + 1] + d[i + 2] < 100;
  const row = W * 4;
  const ids = new Map();
  const colors = [0];
  const keys = [-1];
  const px = new Uint8Array(n * w * h);
  for (let f = 0; f < n; f++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = at(f, x0 + x, y0 + y);
        if (!d[i + 3]) continue;
        const rgb = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
        const paint = fur.has(rgb) && dark(i - 4) + dark(i + 4) + dark(i - row) + dark(i + row) < 2;
        const key = paint ? rgb : -1 - rgb;
        let k = ids.get(key);
        if (k === undefined) {
          k = colors.length;
          ids.set(key, k);
          colors.push(((d[i + 3] << 24) | (d[i + 2] << 16) | (d[i + 1] << 8) | d[i]) >>> 0);
          keys.push(paint ? rgb : -1);
        }
        px[(f * h + y) * w + x] = k;
      }
    }
  }
  if (colors.length > 256) console.warn(`[sprites] ${meta.animal || ''} 색이 너무 많아요 (${colors.length})`);
  return { x0, y0, w, h, px, colors: Uint32Array.from(colors), keys };
}

const artLoads = new Map();

/** 다른 해상도 판(<동물>@<배율>x.png)을 불러 색 번호 시트로 만들어 둔다. 1배 판은 처음부터 있다 */
export function loadArt(animal, art) {
  const key = `${animal}@${art}`;
  if (sheets.has(key)) return Promise.resolve();
  if (!artLoads.has(key)) {
    artLoads.set(
      key,
      readPixels(new URL(`${animal}@${art}x.png`, BASE).href).then(
        ({ w, d }) => sheets.set(key, indexSheet(metas.get(animal), art, w, d)),
        () => {},
      ),
    );
  }
  return artLoads.get(key);
}

export const sheetOf = (animal, art) => sheets.get(`${animal}@${art}`) || null;

/**
 * 화면 배율 dev(= 캐릭터 px × 모니터 배율)에 맞는 해상도 판: 그림 한 픽셀이 화면 픽셀 정수 개가 되는 판 중
 * 가장 촘촘한 것. 그러면 어떤 크기·모니터에서도 늘이거나 흐리게 그리지 않는다
 */
export function pickArt(meta, dev) {
  const list = meta.arts || [1];
  let best = null;
  for (const a of list) {
    const n = dev / a;
    if (Math.abs(n - Math.round(n)) < 0.01 && Math.round(n) >= 1 && (best == null || a > best)) best = a;
  }
  return best ?? 1;
}

const palettes = new Map();
/** 털색을 입힌 색 번호표 (번호 → RGBA). 털 색 번호만 새 털색으로 바뀐다 */
export function paletteOf(animal, fur, art) {
  const key = `${animal}:${fur}:${art}`;
  if (palettes.has(key)) return palettes.get(key);
  const sh = sheetOf(animal, art);
  const meta = metas.get(animal);
  const pal = sh.colors.slice();
  const hex = FURS[fur];
  if (hex && meta.fur) {
    const map = furMap(meta, hex);
    sh.keys.forEach((rgb, k) => {
      const to = rgb >= 0 && map.get(rgb);
      if (to) pal[k] = ((255 << 24) | (to[2] << 16) | (to[1] << 8) | to[0]) >>> 0;
    });
  }
  palettes.set(key, pal);
  return pal;
}

const buffers = new WeakMap(); // 캔버스 → 다시 쓰는 ImageData

/**
 * 시트 sh 의 프레임 idx 를 털색 pal 로 캔버스에 그린다. 캔버스 크기는 그리는 영역에 맞춘다.
 * rect [x, y, w, h] 는 칸 안 영역 (그 판의 픽셀) — 없으면 시트가 남긴 사각형 전체
 */
export function paintFrame(cv, sh, pal, idx, rect = [sh.x0, sh.y0, sh.w, sh.h]) {
  const [rx, ry, rw, rh] = rect;
  if (cv.width !== rw || cv.height !== rh) {
    cv.width = rw;
    cv.height = rh;
  }
  const ctx = cv.getContext('2d');
  let img = buffers.get(cv);
  if (!img || img.width !== rw || img.height !== rh) {
    img = ctx.createImageData(rw, rh);
    buffers.set(cv, img);
  }
  const out = new Uint32Array(img.data.buffer);
  out.fill(0);
  const base = idx * sh.w * sh.h;
  for (let y = 0; y < rh; y++) {
    const sy = ry + y - sh.y0;
    if (sy < 0 || sy >= sh.h) continue;
    for (let x = 0; x < rw; x++) {
      const sx = rx + x - sh.x0;
      if (sx < 0 || sx >= sh.w) continue;
      const k = sh.px[base + sy * sh.w + sx];
      if (k) out[y * rw + x] = pal[k];
    }
  }
  ctx.putImageData(img, 0, 0);
}
