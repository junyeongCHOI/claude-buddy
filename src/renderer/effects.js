// 파티클·날아가는 물건 같은 짧은 효과. Web Animations API 로 그리고 끝나면 지운다.
// 좌표는 전역 좌표이고, 그 점이 있는 모니터 화면(app.viewAt)에 그린다.

let app = null;

export function initEffects(a) {
  app = a;
}

function spawn(cls, x, y, text = '') {
  const v = app.viewAt(x, y);
  const el = v.doc.createElement('div');
  el.className = `fx ${cls}`;
  el.textContent = text;
  el.style.left = `${x - v.x}px`;
  el.style.top = `${y - v.y}px`;
  v.fx.appendChild(el);
  el.view = v;
  return el;
}

/** 뿅! 하고 사라지거나 나타날 때 픽셀 조각 */
export function poof(x, y, color = '#fff') {
  for (let i = 0; i < 10; i++) {
    const el = spawn('bit', x, y);
    el.style.background = i % 3 ? '#fffdf7' : color;
    const a = (i / 10) * Math.PI * 2 + Math.random() * 0.4;
    const d = 22 + Math.random() * 26;
    el.animate(
      [
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(.4)`, opacity: 0 },
      ],
      { duration: 520 + Math.random() * 200, easing: 'cubic-bezier(.2,.7,.3,1)' },
    ).onfinish = () => el.remove();
  }
}

/** 반짝이 (완료 축하) */
export function sparkle(x, y) {
  const glyphs = ['✦', '✧', '★', '✦'];
  const colors = ['#ffd84a', '#ff8fb1', '#7fd3ff', '#9cf09c'];
  for (let i = 0; i < 9; i++) {
    const el = spawn('star', x + (Math.random() - 0.5) * 50, y + (Math.random() - 0.5) * 20, glyphs[i % 4]);
    el.style.color = colors[i % 4];
    const dy = 40 + Math.random() * 40;
    el.animate(
      [
        { transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 },
        { transform: 'translate(-50%,-80%) scale(1.2)', opacity: 1, offset: 0.25 },
        { transform: `translate(-50%, calc(-50% - ${dy}px)) scale(.6)`, opacity: 0 },
      ],
      { duration: 900 + Math.random() * 500, delay: i * 40, easing: 'ease-out', fill: 'backwards' },
    ).onfinish = () => el.remove();
  }
}

/** 머리 위로 톡 튀어 오르는 이모지 */
export function pop(x, y, emoji) {
  const el = spawn('pop', x, y, emoji);
  el.animate(
    [
      { transform: 'translate(-50%,-50%) scale(.2)', opacity: 0 },
      { transform: 'translate(-50%,-90%) scale(1.25)', opacity: 1, offset: 0.2 },
      { transform: 'translate(-50%,-110%) scale(1)', opacity: 1, offset: 0.75 },
      { transform: 'translate(-50%,-150%) scale(.9)', opacity: 0 },
    ],
    { duration: 1300, easing: 'ease-out' },
  ).onfinish = () => el.remove();
}

/**
 * 물건 하나를 from → to 로 포물선을 그리며 날린다. from/to 는 {x,y} 를 돌려주는 함수(움직이는 대상).
 */
export function fly(emoji, from, to, ms = 650, done) {
  const a = from();
  const el = spawn('flyer', a.x, a.y, emoji);
  el.style.left = el.style.top = '0';
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / ms);
    const b = to();
    const x = a.x + (b.x - a.x) * p - el.view.x;
    const y = a.y + (b.y - a.y) * p - Math.sin(p * Math.PI) * 70 - el.view.y;
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%,-50%) rotate(${p * 360}deg)`;
    if (p < 1) requestAnimationFrame(step);
    else {
      el.remove();
      done?.();
    }
  };
  requestAnimationFrame(step);
}

/** 하늘에서 편지가 떨어진다 */
export function drop(emoji, to, done) {
  const start = to();
  const el = spawn('flyer', start.x, start.y, emoji);
  el.style.left = el.style.top = '0';
  const t0 = performance.now();
  const ms = 700;
  const step = (t) => {
    const p = Math.min(1, (t - t0) / ms);
    const b = to();
    const top = -30; // 그 모니터 맨 위에서
    const y = top + (b.y - el.view.y - top) * (p * p);
    const x = b.x - el.view.x + Math.sin(p * 9) * 10 * (1 - p);
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%,-50%) rotate(${Math.sin(p * 8) * 18}deg)`;
    if (p < 1) requestAnimationFrame(step);
    else {
      el.remove();
      done?.();
    }
  };
  requestAnimationFrame(step);
}

/** 착지할 때 먼지 */
export function dust(x, y) {
  for (const s of [-1, 1]) {
    const el = spawn('dust', x + s * 8, y);
    el.animate(
      [
        { transform: 'translate(-50%,-50%) scale(.6)', opacity: 0.8 },
        { transform: `translate(calc(-50% + ${s * 18}px), calc(-50% - 6px)) scale(1.3)`, opacity: 0 },
      ],
      { duration: 380, easing: 'ease-out' },
    ).onfinish = () => el.remove();
  }
}
