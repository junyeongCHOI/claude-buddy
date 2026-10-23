// 주인 캐릭터가 보드에 붙는 자세 — 동물마다 전용 스프라이트(assets/sprites/<동물>.json 의 p_* 애니메이션과 ledges)가 있다.
// 시트에 보드 가장자리(초록 막대)를 같이 그려 두었고, ledges 에 그 막대 위치가 있다. 그 막대를 진짜 보드 가장자리에 맞춘다.
//  bar   막대가 캐릭터의 어디에 있나: below(윗변에 올라탐) · above(아래 변에 매달림) · left(오른쪽 옆면을 붙듦)
//  idle  가만히 있을 때 번갈아 보여 줄 프레임, happy·alert·read·type 은 그 기분/일일 때 프레임 (애니메이션 안 번호)
export const POSES = {
  hang: { bar: 'above', idle: [0, 1], happy: 2, wave: 3 },
  hug: { bar: 'left', idle: [0, 1], happy: 2, alert: 3 },
  lie: { bar: 'below', idle: [0, 1], happy: 2, sleepy: 3 },
  sit: { bar: 'below', idle: [0, 1], happy: 1, read: 2, type: 3 },
  peek: { bar: 'below', idle: [0, 1], wave: 2 },
  drape: { bar: 'below', idle: [0, 1], happy: 2, sleepy: 3 },
  lounge: { bar: 'below', idle: [0, 1], read: 2, type: 3 },
  climb: { bar: 'left', idle: [0, 1], happy: 2, wave: 3 },
  upside: { bar: 'above', idle: [0, 1], happy: 2, wave: 3 },
  curl: { bar: 'below', idle: [0, 1] },
  balance: { bar: 'below', idle: [0] },
};

// 동물마다 어울리는 자세들 (앞일수록 자주). 가끔 다른 자세로 바꿔 앉는다
export const SPRITE_PERCH = {
  bear: ['hug', 'sit', 'lounge'],
  cat: ['drape', 'lounge', 'lie', 'curl'],
  chick: ['balance', 'sit', 'peek'],
  dog: ['sit', 'lie', 'peek'],
  fox: ['lounge', 'sit', 'curl'],
  frog: ['climb', 'sit', 'hug'],
  hamster: ['hang', 'upside', 'peek'],
  panda: ['hang', 'lounge', 'drape'],
  penguin: ['peek', 'sit', 'balance'],
  rabbit: ['peek', 'lie', 'sit'],
};

/**
 * 전용 스프라이트 자세로 보드 b 에 붙을 발 위치.
 * @param {string} pose
 * @param {{x, y, w, h}} b
 * @param {object} g  h 키, C 칸 크기(px), px 배율, ledge 막대 [x0, y0, x1, y1] (칸 좌표), box 그 프레임의 불투명 사각형 (발 기준)
 * @param {number} slot  0 = 보드 주인 (오른쪽), 1… = 서브에이전트 줄 (왼쪽부터)
 */
export function spriteLayout(pose, b, g, slot = 0) {
  const spec = POSES[pose];
  const { h, C, px, ledge, box } = g;
  // 칸 좌표 → 발 기준 좌표 (보는 방향은 그림 그대로)
  const lx = (tx) => -C / 2 + tx * px;
  const ly = (ty) => -C + ty * px;
  const cw = box.r - box.l;
  const right = b.x + b.w;
  const mid = (box.l + box.r) / 2; // 몸 가운데가 x 에 오도록
  const lineX = (fromRight) => (slot > 0 ? b.x + 8 + cw * 1.1 * (slot - 0.5) : fromRight) - mid;
  if (spec.bar === 'left') {
    // 막대 오른쪽 끝 = 보드 오른쪽 변, 머리는 윗변 위로 조금 나온다
    return { x: right - lx(ledge[2]), y: b.y - h * 0.18 - box.t, facing: 1, sprite: pose };
  }
  if (spec.bar === 'above') {
    // 막대 아래 끝 = 보드 아래 변. 막대 가운데를 축으로 흔들린다
    return { x: lineX(right - Math.max(cw * 0.8, 30)), y: b.y + b.h - ly(ledge[3]), facing: 1, sprite: pose, pivot: ly((ledge[1] + ledge[3]) / 2) };
  }
  // 막대 위 끝 = 보드 윗변. 주인은 헤더의 상태·접기 버튼(오른쪽 90px)을 비켜 앉는다
  return { x: lineX(Math.max(b.x + cw * 0.6, right - cw * 0.5 - 90)), y: b.y - ly(ledge[1]), facing: 1, sprite: pose };
}
