// OpenAI 이미지 API로 동물 스프라이트 시트(4열×5행)를 만든다.
//   OPENAI_API_KEY=... node scripts/gen-sprites.mjs --sheet move --animals cat,dog
// sheet=emote·perch 는 같은 동물의 move 시트를 참고 이미지로 넘겨서 생김새를 맞춘다.
// sheet=perch 는 보드에 붙는 자세들: 보드 가장자리를 순수 초록 막대로 그리게 해서 pixelate.py 가 위치를 재고 지운다.
// 결과: assets/raw/<animal>-<sheet>.png
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'assets', 'raw');

export const ANIMALS = {
  cat: 'an orange tabby kitten with a cream belly, tiny pink nose and striped tail',
  dog: 'a tan-and-white shiba inu puppy with a curly tail',
  rabbit: 'a white bunny with long pink-lined ears and a pink nose',
  bear: 'a brown bear cub with round ears and a light tan muzzle',
  fox: 'an orange fox kit with a white chest, black-tipped ears and a fluffy white-tipped tail',
  panda: 'a baby panda with black ears, black eye patches and black limbs',
  penguin: 'a navy-blue baby penguin with a white belly, orange beak and orange feet',
  hamster: 'a golden hamster with chubby white cheeks and tiny round ears',
  frog: 'a green frog with big round eyes on top of its head and a pale yellow belly',
  chick: 'a fluffy yellow chick with an orange beak, orange feet and a tiny head tuft',
};

// 동물별로 자주 틀리는 부분을 못 박아 둔다
const NOTES = {
  frog: 'IMPORTANT: this frog has exactly TWO eyes and they sit inside the two round bumps on top of its head. Show every emotion only with those two top eyes (closed arcs, hearts, swirls, tears below them). Never draw any extra eyes on the face: count them, exactly two eyes in every frame.',
  rabbit: 'IMPORTANT: the bunny always keeps its two LONG upright pink-lined ears clearly visible in every single frame. When holding the whiteboard, it holds the board high above the tips of its long ears, so both long ears are fully visible between its head and the board.',
};

const style = (desc, animal) => `Cute chibi pixel-art game sprite sheet of ${desc}.
Style: retro 16-bit pixel art, oversized round head (about 60% of the total height), tiny body, short stubby limbs, big shiny eyes, rosy cheeks, clean dark outline, flat bright colors. Exactly the same character design, colors and proportions in every frame.
Layout: a precise grid of 4 columns and 5 rows (20 frames). Every cell is the same size, the character is centered in its cell with plenty of empty margin, all frames drawn at the same scale and never touching each other.
Background: one flat solid pure magenta color (#FF00FF) everywhere. No ground, no shadows, no grid lines, no borders, no text, no numbers, no labels.
${NOTES[animal] || ''}`;

// 보드 가장자리 = 순수한 한 색의 막대 (pixelate.py 가 위치를 재고 지운다).
// 몸 색과 겹치면 안 되니 초록 동물(개구리)은 청록으로 — pixelate.py 의 GUIDE 와 맞춘다
const GUIDE = { frog: ['pure cyan', '#00FFFF', 'cyan'] };
const EDGE = (animal) => {
  const [name, hex, word] = GUIDE[animal] || ['pure green', '#00FF00', 'green'];
  return `Use the reference image only to copy the character design exactly (same animal, colors, proportions and pixel style). Draw a NEW sheet of the character holding on to an EDGE.
THE EDGE: in every frame (except the last one) the edge is drawn as one straight flat bar filled with ${name} (${hex}) only: no shading, no outline, no texture, about as thick as the character's paw, and long enough to stick out a little past the character on both ends. It is the only ${word} thing in the image. The character's paws, arms and body may overlap the bar where they are in front of it.`;
};

const REF_NOTE = 'Use the reference image only to copy the character design exactly (same animal, colors, proportions and pixel style). Draw a NEW sheet:';

const SHEETS = {
  move: `Rows, left to right:
Row 1: walking cycle seen from the side, facing right (4 frames: left foot forward, passing, right foot forward, passing).
Row 2: standing facing the viewer, holding a large BLANK white whiteboard up above its head with both paws (the board is about twice as wide as the head, plain white with a thin grey frame, nothing written on it), 4 frames of gentle bobbing.
Row 3: walking to the right while holding the same large blank white whiteboard up above its head with both paws (4 frames of a walking cycle).
Row 4: jumping: crouching, springing up with arms up, high in the air, landing with squashed legs.
Row 5: being picked up and dangling with flailing legs and a surprised face (2 frames), falling with arms up in panic, sitting down relaxed facing the viewer.`,
  emote: `Use the reference image only to copy the character design exactly (same animal, colors, proportions and pixel style). Draw a NEW sheet with these rows, all facing the viewer:
Row 1: overjoyed with closed smiling eyes, in love with heart-shaped eyes, shocked with wide eyes and open mouth, laughing hard.
Row 2: sad and crying with tears, angry and pouting with puffed cheeks, nervous with a sweat drop, dizzy with swirly eyes.
Row 3: thinking with a paw on its chin looking up (2 frames), sleeping curled up with eyes closed (2 frames).
Row 4: celebrating with both arms raised high (2 frames), waving hello with one paw (2 frames).
Row 5: typing on a tiny laptop (2 frames), reading an open book (2 frames).`,
  perch: (animal) => `${EDGE(animal)}
Rows, left to right, all facing the viewer:
Row 1: HANGING below a horizontal green bar: both arms stretched straight up over its head, both paws gripping the bar, body and legs dangling in the air under it. Frames: calm, legs swinging to one side, happily kicking its legs, hanging by one paw while waving the other paw.
Row 2: HUGGING a vertical green bar that is on the LEFT side of the character: the character is to the right of the bar, both arms wrapped around the bar in front of it, one cheek pressed against it, feet off the ground. Frames: calm, content with closed eyes, smiling at the viewer, surprised.
Row 3: LYING ON ITS BELLY on top of a horizontal green bar: the bar runs under its chest, the chin rests on the bar, both front paws hang limply down over the front of the bar, back legs relaxed or kicking up behind. Frames: calm, blinking, kicking its back legs happily, sleepy yawn.
Row 4: SITTING on top of a horizontal green bar: its bottom rests on the bar and both legs dangle down in front of the bar. Frames: calm, swinging its legs, reading an open book, typing on a tiny laptop on its lap.
Row 5: PEEKING over a horizontal green bar: only the head (with ears) and both front paws gripping the top of the bar are visible above it, everything below the bar is hidden. Frames: curious, tilting its head, waving one paw over the bar. Last frame: NO bar, the character simply standing still facing the viewer (size reference).`,
  perch2: (animal) => `${EDGE(animal)}
Rows, left to right:
Row 1: DRAPED over a horizontal green bar like a wet towel, seen from the side: its belly lies across the bar, the head and front paws flop down limply on the left side of the bar, the hind legs and tail flop down on the right side. Frames: limp and relaxed, blinking, front paws swinging, dozing with closed eyes.
Row 2: LOUNGING on its side on top of a horizontal green bar, facing the viewer, head propped up on one paw, the body stretched along the bar. Frames: calm, blinking, reading an open book while lying, typing on a tiny laptop while lying.
Row 3: CLIMBING a vertical green bar that is on the LEFT side of the character, seen from the side facing left: all four paws grip the bar, body pressed against it. Frames: climbing cycle (2 frames), looking back at the viewer over its shoulder, waving one paw while holding on.
Row 4: HANGING UPSIDE DOWN below a horizontal green bar: its feet hook over the bar, the body and head hang down, ears and arms dangle toward the ground. Frames: calm, swinging, arms crossed relaxed, waving.
Row 5: SLEEPING curled up into a ball on top of a horizontal green bar (2 frames, breathing), BALANCING standing on top of a horizontal green bar with both arms stretched out sideways (1 frame). Last frame: NO bar, the character simply standing still facing the viewer (size reference).`,
};

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const KEY = process.env.OPENAI_API_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(url, init, label) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${KEY}`, ...(init.headers || {}) } });
    const text = await res.text();
    if (res.ok) return JSON.parse(text);
    const retry = res.status === 429 || res.status >= 500;
    console.warn(`[${label}] HTTP ${res.status} (시도 ${attempt}) ${text.slice(0, 300)}`);
    if (!retry) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    await sleep(5000 * attempt);
  }
  throw new Error('재시도 초과');
}

async function generate({ model, animal, sheet, quality, suffix, refSheet }) {
  const label = `${animal}-${sheet}${suffix}`;
  const prompt = `${style(ANIMALS[animal], animal)}\n${refSheet && sheet !== 'emote' ? REF_NOTE + '\n' : ''}${typeof SHEETS[sheet] === "function" ? SHEETS[sheet](animal) : SHEETS[sheet]}`;
  const t0 = Date.now();
  let json;
  const refName = refSheet || (sheet === 'move' ? null : 'move');
  if (refName) {
    const ref = path.join(RAW, `${animal}-${refName}${suffix}.png`);
    if (!fs.existsSync(ref)) throw new Error(`참고 이미지 없음: ${ref}`);
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', prompt);
    form.append('size', '1024x1536');
    form.append('quality', quality);
    form.append('image[]', new Blob([fs.readFileSync(ref)], { type: 'image/png' }), 'ref.png');
    json = await call('https://api.openai.com/v1/images/edits', { method: 'POST', body: form }, label);
  } else {
    json = await call(
      'https://api.openai.com/v1/images/generations',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, size: '1024x1536', quality, n: 1 }),
      },
      label,
    );
  }
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error(`[${label}] 이미지 없음: ${JSON.stringify(json).slice(0, 200)}`);
  const out = path.join(RAW, `${label}.png`);
  fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  console.log(`[${label}] 완료 ${((Date.now() - t0) / 1000).toFixed(0)}s → ${path.relative(ROOT, out)}`);
}

if (!KEY) {
  console.error('OPENAI_API_KEY 가 필요해요');
  process.exit(1);
}
fs.mkdirSync(RAW, { recursive: true });

const model = arg('model', 'gpt-image-2.5-flare');
const sheet = arg('sheet', 'move');
const quality = arg('quality', 'high');
const suffix = arg('suffix', '');
const refSheet = arg('ref', null); // 다른 시트를 참고 이미지로 (예: --ref emote)
const animals = arg('animals', Object.keys(ANIMALS).join(',')).split(',');

const results = await Promise.allSettled(animals.map((animal) => generate({ model, animal, sheet, quality, suffix, refSheet })));
const failed = results.filter((r) => r.status === 'rejected');
failed.forEach((r) => console.error('실패:', r.reason?.message));
process.exit(failed.length ? 1 : 0);
