"""Cut README illustrations out of the sprite atlases into docs/readme/.

Run after redrawing sprites: python3 scripts/readme-art.py
"""
import json, sys
from pathlib import Path
from PIL import Image

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs' / 'readme'
OUT.mkdir(parents=True, exist_ok=True)
SPR = ROOT / 'assets' / 'sprites'
CELL, COLS = 96, 8
BOX = (16, 28, 80, 96)  # union of every frame's bbox, padded
S = 3

atlas = {}
meta = {}
for a in json.load(open(SPR / 'index.json'))['animals']:
    atlas[a] = Image.open(SPR / f'{a}.png').convert('RGBA')
    meta[a] = json.load(open(SPR / f'{a}.json'))


def frame(a, f, box=BOX):
    x, y = (f % COLS) * CELL, (f // COLS) * CELL
    return atlas[a].crop((x + box[0], y + box[1], x + box[2], y + box[3]))


def up(im, s=S):
    return im.resize((im.width * s, im.height * s), Image.NEAREST)


def save_gif(frames, path, ms, shared=False):
    # 1-bit alpha in the source, so a single transparent palette slot is lossless
    pal = []
    ref = None
    if shared:
        sheet = Image.new('RGB', (frames[0].width, frames[0].height * len(frames)))
        for i, im in enumerate(frames):
            sheet.paste(im.convert('RGB'), (0, i * im.height))
        ref = sheet.quantize(colors=127, method=Image.FASTOCTREE, dither=Image.NONE)
    for im in frames:
        if ref:
            p = im.convert('RGB').quantize(palette=ref, dither=Image.NONE)
        else:
            p = im.convert('RGB').quantize(colors=255, method=Image.FASTOCTREE, dither=Image.NONE)
        p = p.copy()
        mask = im.getchannel('A').point(lambda v: 255 if v < 128 else 0)
        p.paste(255, mask=mask)
        pal.append(p)
    pal[0].save(path, save_all=True, append_images=pal[1:], duration=ms, loop=0,
                transparency=255, disposal=2, optimize=shared)


def save(a, anim, name, ms=420, s=S, trim=False):
    fs = meta[a]['anims'][anim]
    box = BOX
    if trim:
        # same width everywhere, but drop empty rows above this pose
        top = min(frame(a, f).getbbox()[1] for f in fs) + BOX[1]
        box = (BOX[0], max(BOX[1], top - 2), BOX[2], BOX[3])
    ims = [up(frame(a, f, box), s) for f in fs]
    if len(ims) == 1:
        ims[0].save(OUT / f'{name}.png')
    else:
        save_gif(ims, OUT / f'{name}.gif', ms)


# narrator
for anim, ms in [('wave', 380), ('think', 520), ('type', 260), ('read', 600),
                 ('cheer', 300), ('walk', 150)]:
    save('cat', anim, f'me-{anim}', ms, trim=True)
for anim in ['dizzy', 'shock']:
    save('cat', anim, f'me-{anim}', trim=True)

# mode table: one pose per state, each by a different animal
MODES = [('work', 'dog', 'type', 260), ('supervise', 'panda', 'think', 520),
         ('waiting', 'rabbit', 'wave', 380), ('listening', 'chick', 'shock', 0),
         ('talking', 'fox', 'joy', 0), ('thinking', 'penguin', 'think', 520),
         ('idle', 'hamster', 'sit', 0), ('sleep', 'bear', 'sleep', 900),
         ('returning', 'frog', 'walk', 150), ('done', 'cat', 'cheer', 300)]
for mode, a, anim, ms in MODES:
    save(a, anim, f'mode-{mode}', ms or 400, s=2)

EMO = [('nervous', 'fox', 'nervous'), ('sad', 'penguin', 'sad'), ('dizzy', 'dog', 'dizzy'),
       ('angry', 'rabbit', 'angry'), ('love', 'chick', 'love')]
for emo, a, anim in EMO:
    save(a, anim, f'emo-{emo}', 300, s=2)

# hero: everybody walking across a strip, seamless loop
animals = list(atlas)
s = 2
PBOX = (16, 40, 80, 96)
fw, fh = (PBOX[2] - PBOX[0]) * s, (PBOX[3] - PBOX[1]) * s
W, H = 800, fh + 4
gap = W / len(animals)
speed = 10
n = int(W / speed)
order = ['cat', 'dog', 'rabbit', 'bear', 'frog', 'hamster', 'fox', 'penguin', 'chick', 'panda']
frames = []
for t in range(n):
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for i, a in enumerate(order):
        walk = meta[a]['anims']['walk']
        f = walk[(t + i) % len(walk)]
        sp = up(frame(a, f, PBOX), s)
        x = int((i * gap + t * speed) % W) - fw // 2
        bob = 0
        # draw wrapped copies so the loop has no seam
        for dx in (0, -W, W):
            xx = x + dx
            if xx + fw <= 0 or xx >= W:
                continue
            l, r = max(0, -xx), min(fw, W - xx)
            canvas.alpha_composite(sp.crop((l, 0, r, fh)), (xx + l, H - fh - bob))
    frames.append(canvas)
save_gif(frames, OUT / 'parade.gif', 110, shared=True)

# still lineup for the bottom
fw, fh = (BOX[2] - BOX[0]) * s, (BOX[3] - BOX[1]) * s
line = Image.new('RGBA', (fw * len(order), fh), (0, 0, 0, 0))
for i, a in enumerate(order):
    line.alpha_composite(up(frame(a, meta[a]['anims']['sleep'][0]), s), (i * fw, 0))
line.save(OUT / 'nap.png')

print(sorted(p.name for p in OUT.iterdir()))

# social preview card (1280x640) for the GitHub repo settings
GLYPHS = {  # 5x9 pixel font, just the letters the card needs
    'a': ['.....', '.....', '.###.', '....#', '.####', '#...#', '.####', '.....', '.....'],
    'b': ['#....', '#....', '####.', '#...#', '#...#', '#...#', '####.', '.....', '.....'],
    'c': ['.....', '.....', '.####', '#....', '#....', '#....', '.####', '.....', '.....'],
    'd': ['....#', '....#', '.####', '#...#', '#...#', '#...#', '.####', '.....', '.....'],
    'e': ['.....', '.....', '.###.', '#...#', '#####', '#....', '.####', '.....', '.....'],
    'f': ['..##.', '.#...', '####.', '.#...', '.#...', '.#...', '.#...', '.....', '.....'],
    'k': ['#....', '#....', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '.....', '.....'],
    'l': ['.#...', '.#...', '.#...', '.#...', '.#...', '.#...', '..##.', '.....', '.....'],
    'o': ['.....', '.....', '.###.', '#...#', '#...#', '#...#', '.###.', '.....', '.....'],
    'p': ['.....', '.....', '####.', '#...#', '#...#', '#...#', '####.', '#....', '#....'],
    'r': ['.....', '.....', '#.##.', '##...', '#....', '#....', '#....', '.....', '.....'],
    's': ['.....', '.....', '.####', '#....', '.###.', '....#', '####.', '.....', '.....'],
    't': ['.#...', '.#...', '####.', '.#...', '.#...', '.#...', '..##.', '.....', '.....'],
    'u': ['.....', '.....', '#...#', '#...#', '#...#', '#...#', '.####', '.....', '.....'],
    'y': ['.....', '.....', '#...#', '#...#', '#...#', '#...#', '.####', '....#', '.###.'],
    '-': ['.....', '.....', '.....', '.....', '####.', '.....', '.....', '.....', '.....'],
    ' ': [],
}


def glyph_rows(ch):
    return GLYPHS[ch]


def pixel_text(draw, text, x, y, scale, fill):
    for ch in text:
        if ch == ' ':
            x += 3 * scale
            continue
        for r, row in enumerate(glyph_rows(ch)):
            for c, v in enumerate(row):
                if v == '#':
                    draw.rectangle([x + c * scale, y + r * scale, x + (c + 1) * scale - 1, y + (r + 1) * scale - 1], fill=fill)
        x += 6 * scale
    return x


def text_width(text, scale):
    return sum(3 * scale if ch == ' ' else 6 * scale for ch in text) - scale


from PIL import ImageDraw
card = Image.new('RGBA', (1280, 640), (255, 246, 229, 255))
d = ImageDraw.Draw(card)
title, sub = 'claude-buddy', 'a desktop pet for claude code'
pixel_text(d, title, (1280 - text_width(title, 11)) // 2, 70, 11, (59, 47, 47, 255))
pixel_text(d, sub, (1280 - text_width(sub, 5)) // 2, 210, 5, (138, 109, 90, 255))
cast = [('cat', 'love'), ('dog', 'type'), ('rabbit', 'wave'), ('frog', 'cheer'),
        ('bear', 'read'), ('penguin', 'type'), ('chick', 'wave')]
ground = 560
sprites = []
for a, anim in cast:
    im = frame(a, meta[a]['anims'][anim][0])
    sprites.append(up(im.crop(im.getbbox()), 3))
gap = 28
total = sum(s.width for s in sprites) + gap * (len(sprites) - 1)
x = (1280 - total) // 2
for s in sprites:
    card.alpha_composite(s, (x, ground - s.height))
    x += s.width + gap
d.rectangle([60, ground + 6, 1220, ground + 9], fill=(232, 214, 186, 255))
card.convert('RGB').save(ROOT / 'docs' / 'social-preview.png')
