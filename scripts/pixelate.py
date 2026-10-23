#!/usr/bin/env python3
"""GPT로 만든 스프라이트 시트(4열×5행)를 진짜 픽셀 아트 아틀라스로 바꾼다.

    python3 scripts/pixelate.py [동물 ...] [--suffix _g2] [--preview DIR]

입력  assets/raw/<animal>-{move,emote,perch,perch2}<suffix>.png (move 만 꼭 있어야 함)
출력  assets/sprites/<animal>.png   CELL×CELL 프레임을 8열로 늘어놓은 아틀라스
      assets/sprites/<animal>.json  애니메이션 이름 → 프레임 번호, 화이트보드 위치, 보드 가장자리 위치

perch 시트는 보드 가장자리를 순수한 한 색(보통 초록, 개구리는 청록)의 막대로 그려 둔다: 막대 위치를 프레임마다 재서
ledges 에 남기고(렌더러가 진짜 보드 가장자리에 맞춘다) 막대는 지운다.
      assets/sprites/index.json     동물 목록

처리 순서: 배경(마젠타) 제거 → 덩어리 찾기 → 격자 칸별로 묶기 → 같은 배율로 축소
→ 동물별 팔레트로 색 줄이기 → 바깥 외곽선 → 발 기준으로 칸에 배치.
Pillow 만 쓴다.
"""
import colorsys
import json
import os
import sys
from collections import deque
from statistics import median

from PIL import Image, ImageChops, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "assets", "raw")
OUT = os.path.join(ROOT, "assets", "sprites")

COLS, ROWS = 4, 5
CELL = 96  # 아틀라스 한 칸 (픽셀)
TARGET_H = 48  # 걷기 프레임 키 (픽셀)
# 같은 그림을 이 배율로도 따로 픽셀화해 <동물>@<배율>x.png 로 저장한다 (위치 정보는 1배 기준 하나만).
# 렌더러는 화면 픽셀과 정수 배로 맞는 판을 골라서, 어떤 크기·모니터에서도 늘이거나 흐리게 그리지 않는다
ARTS = (0.75, 1.5, 2)
ATLAS_COLS = 8
PALETTE = 48
OUTLINE = (43, 33, 51, 255)
DOWN = 4  # 덩어리 찾기용 축소 배율

SHEET_ANIMS = {
    "move": [
        ("walk", 4), ("hold", 4), ("holdwalk", 4), ("jump", 4),
        ("dangle", 2), ("fall", 1), ("sit", 1),
    ],
    "emote": [
        ("joy", 1), ("love", 1), ("shock", 1), ("laugh", 1),
        ("sad", 1), ("angry", 1), ("nervous", 1), ("dizzy", 1),
        ("think", 2), ("sleep", 2),
        ("cheer", 2), ("wave", 2),
        ("type", 2), ("read", 2),
    ],
    # 보드에 붙는 자세 (p_ 로 시작). p_ref* 는 크기 기준으로만 쓰는 선 자세
    "perch": [
        ("p_hang", 4), ("p_hug", 4), ("p_lie", 4), ("p_sit", 4), ("p_peek", 3), ("p_ref", 1),
    ],
    "perch2": [
        ("p_drape", 4), ("p_lounge", 4), ("p_climb", 4), ("p_upside", 4), ("p_curl", 2), ("p_balance", 1), ("p_ref2", 1),
    ],
}
SHEETS = list(SHEET_ANIMS)
REF_ANIM = {"perch": "p_ref", "perch2": "p_ref2"}  # 이 프레임 키가 걷기 키와 같아지게 축소
BOARD_ANIMS = {"hold", "holdwalk"}

# 털(피부·깃털) 팔레트 고르는 조건: [(색상 범위°, 채도 범위, 명도 범위), ...]
# 렌더러가 이 색들만 골라서 다른 털색으로 바꿔 칠한다.
FUR = {
    "bear": [((5, 32), (0.45, 1), (0.17, 0.52))],
    "cat": [((5, 45), (0.6, 1), (0.30, 0.72))],
    "chick": [((40, 62), (0.8, 1), (0.5, 0.9)), ((0, 15), (0.5, 0.7), (0.28, 0.36))],
    "dog": [((8, 40), (0.4, 1), (0.28, 0.72))],
    "fox": [((8, 40), (0.75, 1), (0.30, 0.72))],
    "frog": [((85, 140), (0.4, 1), (0.2, 0.7))],
    "hamster": [((25, 50), (0.75, 1), (0.5, 0.72)), ((0, 10), (0.4, 0.6), (0.2, 0.3))],
    "panda": [((0, 360), (0, 0.25), (0.15, 0.32))],
    "penguin": [((212, 236), (0.55, 1), (0.2, 0.4))],
    "rabbit": [((0, 360), (0, 0.35), (0.75, 1.0))],
}


def fur_palette(animal, atlases):
    rules = FUR.get(animal)
    if not rules:
        return None
    counts = {}
    for atlas in atlases:
        for p in atlas.getdata():
            if p[3] and p[:3] != OUTLINE[:3]:
                counts[p[:3]] = counts.get(p[:3], 0) + 1
    fur = []
    for c, n in counts.items():
        h, l, sat = colorsys.rgb_to_hls(*(v / 255 for v in c))
        h *= 360
        if any(hr[0] <= h <= hr[1] and sr[0] <= sat <= sr[1] and lr[0] <= l <= lr[1] for hr, sr, lr in rules):
            fur.append((n, c))
    if not fur:
        return None
    fur.sort(reverse=True)
    base = fur[0][1]
    # 규칙엔 조금 못 미치지만 기본 털색과 색상이 아주 가까운 중간 톤 (채도가 살짝 낮은 털 그림자 등)도 털로 친다.
    # 안 그러면 털색을 바꿨을 때 원래 털색 점이 군데군데 남는다
    bh0 = colorsys.rgb_to_hls(*(v / 255 for v in base))[0] * 360
    taken0 = {c for _, c in fur}
    for c, n in counts.items():
        if c in taken0:
            continue
        h, l, sat = colorsys.rgb_to_hls(*(v / 255 for v in c))
        dh = min(abs(h * 360 - bh0), 360 - abs(h * 360 - bh0))
        if dh <= 20 and sat >= 0.4 and 0.3 <= l <= 0.75:
            fur.append((n, c))
    # 털 안쪽 선: 털과 색상이 비슷하고 아주 어두운 색. 털색을 바꿀 때 이것도 같이 바꿔야
    # 갈색·검정 털에 원래 털색(주황 등)의 붉은 선이 테두리처럼 남지 않는다
    bh = colorsys.rgb_to_hls(*(v / 255 for v in base))[0] * 360
    taken = {c for _, c in fur}
    lines = []
    for c, n in counts.items():
        if c in taken:
            continue
        h, l, sat = colorsys.rgb_to_hls(*(v / 255 for v in c))
        dh = min(abs(h * 360 - bh), 360 - abs(h * 360 - bh))
        if 0.06 <= l <= 0.48 and sat >= 0.3 and dh <= 45:
            lines.append((n, c))
    lines.sort(reverse=True)
    return {"base": list(base), "colors": [list(c) for _, c in fur], "lines": [list(c) for _, c in lines]}


def threshold(img, fn):
    return img.point(lambda v: 255 if fn(v) else 0)


def foreground_mask(img):
    """불투명/전경 = 255"""
    rgba = img.convert("RGBA")
    alpha = rgba.getchannel("A")
    lo, _ = alpha.getextrema()
    if lo < 10:
        return threshold(alpha, lambda v: v > 128)

    rgb = rgba.convert("RGB")
    w, h = rgb.size
    # 테두리 색의 중앙값을 배경색으로 본다
    border = [rgb.getpixel((x, y)) for x in range(0, w, 16) for y in (0, h - 1)]
    border += [rgb.getpixel((x, y)) for y in range(0, h, 16) for x in (0, w - 1)]
    bg = tuple(int(median(c[i] for c in border)) for i in range(3))

    diff = ImageChops.difference(rgb, Image.new("RGB", rgb.size, bg))
    dr, dg, db = diff.split()
    dist = ImageChops.add(ImageChops.add(dr, dg), db)
    far = threshold(dist, lambda v: v > 70)

    # 마젠타 계열(경계에 번진 보라색 포함)은 배경
    r, g, b = rgb.split()
    rg = threshold(ImageChops.subtract(r, g), lambda v: v > 70)
    bgc = threshold(ImageChops.subtract(b, g), lambda v: v > 70)
    rb = threshold(ImageChops.difference(r, b), lambda v: v < 80)
    magenta = ImageChops.multiply(ImageChops.multiply(rg, bgc), rb)
    return ImageChops.subtract(far, magenta)


# 보드 가장자리 막대 색. 몸 색과 겹치면 안 되니 초록 동물(개구리)은 청록 (gen-sprites.mjs 의 GUIDE 와 맞춘다)
GUIDE = {"frog": "cyan"}


def guide_mask(img, color, loose=False):
    """보드 가장자리 막대 = 255.
    loose 면 막대 근처(약 15px 안)에서 막대색 계열(색상 기준)인 것까지: 생성된 막대는 군데군데 탁하거나 어두운
    초록이라 순수한 색만으로는 다 못 잡는다. 멀리 있는 같은 계열 색(눈물 등)은 건드리지 않는다"""
    rgb = img.convert("RGB")
    r, g, b = rgb.split()
    t = threshold
    if color == "cyan":  # (0, 255, 255)
        strict = ImageChops.multiply(ImageChops.multiply(t(g, lambda v: v > 190), t(b, lambda v: v > 190)), t(r, lambda v: v < 70))
    else:  # 초록 (0, 255, 0)
        strict = ImageChops.multiply(
            ImageChops.multiply(t(g, lambda v: v > 180), t(r, lambda v: v < 45)), t(ImageChops.subtract(g, b), lambda v: v > 120)
        )
    if not loose:
        return strict
    h, sat, val = rgb.convert("HSV").split()  # 색상 0~255 = 0~360°
    lo, hi = (113, 152) if color == "cyan" else (50, 120)  # 청록 160~215°, 초록 70~170°
    hue = t(h, lambda v: lo <= v <= hi)
    family = ImageChops.multiply(ImageChops.multiply(hue, t(sat, lambda v: v > 45)), t(val, lambda v: v > 40))
    return ImageChops.multiply(family, strict.filter(ImageFilter.MaxFilter(31)))


def blend_mask(img, color):
    """막대색과 마젠타(255, 0, 255) 사이에 놓인 색 = 255. 초록↔마젠타는 (s, 1-s, s), 청록↔마젠타는 (s, 1-s, 1)"""
    r, g, b = img.convert("RGB").split()
    sum_ok = threshold(ImageChops.add(r, g), lambda v: 195 <= v)  # r + g ≈ 255 (ImageChops.add 는 255 에서 잘린다)
    near = threshold(ImageChops.difference(ImageChops.add(r, g, scale=2), Image.new("L", r.size, 128)), lambda v: v < 30)
    if color == "cyan":
        other = threshold(b, lambda v: v > 190)
    else:
        other = threshold(ImageChops.difference(r, b), lambda v: v < 45)
    return ImageChops.multiply(ImageChops.multiply(sum_ok, near), other)


def components(mask):
    """8방향 연결 덩어리. [(픽셀목록, bbox)]"""
    w, h = mask.size
    px = mask.load()
    seen = bytearray(w * h)
    out = []
    for y0 in range(h):
        for x0 in range(w):
            if px[x0, y0] < 128 or seen[y0 * w + x0]:
                continue
            q = deque([(x0, y0)])
            seen[y0 * w + x0] = 1
            pts = []
            x1 = x2 = x0
            y1 = y2 = y0
            while q:
                x, y = q.popleft()
                pts.append((x, y))
                x1, x2, y1, y2 = min(x1, x), max(x2, x), min(y1, y), max(y2, y)
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and px[nx, ny] >= 128:
                            seen[ny * w + nx] = 1
                            q.append((nx, ny))
            out.append((pts, (x1, y1, x2 + 1, y2 + 1)))
    return out


def fill_behind_bars(img, gm, fg, bars):
    """막대가 몸 앞을 가로지른 곳(걸쳐 눕기의 배 등)을 막대 양쪽 몸 색으로 채운다.
    그냥 막대를 지우면 몸에 투명한 줄이 생긴다. 막대 양쪽이 모두 몸일 때만 채운다 (다리 사이 같은 빈틈은 그대로).
    img·gm·fg 를 그 자리에서 고친다"""
    W, H = img.size
    ip, gp, fp = img.load(), gm.load(), fg.load()
    reach = 8  # 막대 가장자리의 번진 색·막대 테두리를 건너 몸을 찾는 거리
    filled = 0

    def body(x, y):
        # 아주 어두운 색(생성 그림이 막대에 그린 테두리, 몸 외곽선)은 건너뛰고 그 너머의 몸 색으로 채운다
        return 0 <= x < W and 0 <= y < H and fp[x, y] and not gp[x, y] and sum(ip[x, y][:3]) > 150

    for x1, y1, x2, y2 in bars:
        x1, y1, x2, y2 = max(0, x1 - DOWN), max(0, y1 - DOWN), min(W, x2 + DOWN), min(H, y2 + DOWN)
        horiz = (x2 - x1) >= (y2 - y1)
        lines = range(x1, x2) if horiz else range(y1, y2)
        done = set()  # 몸으로 채운 줄
        for u in lines:
            span = range(y1, y2) if horiz else range(x1, x2)
            at = (lambda v, u=u: (u, v)) if horiz else (lambda v, u=u: (v, u))
            v = span.start
            while v < span.stop:
                if not gp[at(v)]:
                    v += 1
                    continue
                a = v
                while v < span.stop and gp[at(v)]:
                    v += 1
                b = v - 1
                before = next((at(a - k) for k in range(1, reach + 1) if body(*at(a - k))), None)
                after = next((at(b + k) for k in range(1, reach + 1) if body(*at(b + k))), None)
                if not (before and after):
                    continue
                mid = (a + b) // 2
                for w in range(a, b + 1):
                    xy = at(w)
                    ip[xy] = ip[before] if w <= mid else ip[after]
                    gp[xy] = 0
                    fp[xy] = 255
                    filled += 1
                done.add(u)
        # 채우지 않은 줄의 막대 띠 안에 남은 막대 찌꺼기(생성 그림이 막대에 그린 어두운 테두리, 탁한 막대 끝)를 지운다.
        # 막대를 잡은 앞발처럼 밝거나 진한 색은 남긴다 (외곽선은 픽셀화할 때 다시 그린다)
        for u in lines:
            if u in done:
                continue
            for v in range(y1, y2) if horiz else range(x1, x2):
                xy = (u, v) if horiz else (v, u)
                if not fp[xy]:
                    continue
                h, l, sat = colorsys.rgb_to_hls(*(c / 255 for c in ip[xy][:3]))
                if l < 0.3 or sat < 0.35 or gp[xy]:
                    fp[xy] = 0
    return filled


def split_frames(img, ledge=None):
    """격자 칸마다 그 칸에 중심이 있는 덩어리들을 모아 RGBA 프레임으로 잘라낸다.
    (프레임들, 프레임 왼쪽 위의 시트 좌표들, 칸별 초록 막대 사각형(시트 좌표) 또는 None)"""
    img = img.convert("RGBA")
    W, H = img.size
    fg = foreground_mask(img)
    green = []
    if ledge:  # 막대 색 이름
        gm = guide_mask(img, ledge)
        gsmall = threshold(gm.resize((W // DOWN, H // DOWN), Image.BOX), lambda v: v > 100)
        green = [[x1 * DOWN, y1 * DOWN, x2 * DOWN, y2 * DOWN] for pts, (x1, y1, x2, y2) in components(gsmall) if len(pts) >= 8]
        # 번진 테두리까지 막대로 쳐야 채울 때 그 색을 몸으로 착각하지 않는다
        gm = ImageChops.lighter(gm, guide_mask(img, ledge, loose=True))
        fg = ImageChops.subtract(fg, gm)
        # 막대와 마젠타 배경이 섞인 가장자리(보랏빛·회색빛)도 막대로 친다: 막대 근처이면서 배경 근처인, 막대색↔마젠타 사이 색만
        # (노트북 같은 회색 물건과 헷갈리지 않게). 채우기 전에 빼야 그 색으로 몸을 채우지 않는다
        bg = ImageChops.invert(foreground_mask(img)).filter(ImageFilter.MaxFilter(15))
        rim = ImageChops.multiply(ImageChops.multiply(gm.filter(ImageFilter.MaxFilter(15)), bg), blend_mask(img, ledge))
        fg = ImageChops.subtract(fg, rim)
        gm = ImageChops.lighter(gm, rim)
        fill_behind_bars(img, gm, fg, green)
        # 남은 막대와 그 번진 테두리만 지운다
        fg = ImageChops.subtract(fg, gm.filter(ImageFilter.MaxFilter(3)))
    small = threshold(fg.resize((W // DOWN, H // DOWN), Image.BOX), lambda v: v > 60)
    sw, sh = small.size
    cw, ch = sw / COLS, sh / ROWS

    cells = [[] for _ in range(COLS * ROWS)]
    for pts, (x1, y1, x2, y2) in components(small):
        if len(pts) < 6:
            continue  # 잡티
        cx = sum(p[0] for p in pts) / len(pts)
        cy = sum(p[1] for p in pts) / len(pts)
        col = min(COLS - 1, int(cx / cw))
        row = min(ROWS - 1, int(cy / ch))
        cells[row * COLS + col].append((pts, (x1, y1, x2, y2)))

    frames = []
    origins = []
    boxes = []  # 프레임을 잘라낸 시트 영역
    for idx, comps in enumerate(cells):
        if not comps:
            frames.append(None)
            origins.append(None)
            boxes.append(None)
            continue
        # 가장 큰 덩어리 근처(칸 크기의 절반 안)에 있는 것만 남긴다
        main = max(comps, key=lambda c: len(c[0]))
        mx1, my1, mx2, my2 = main[1]
        keep = []
        for c in comps:
            x1, y1, x2, y2 = c[1]
            gap = max(mx1 - x2, x1 - mx2, my1 - y2, y1 - my2, 0)
            if c is main or gap < min(cw, ch) * 0.35:
                keep.append(c)
        lab = Image.new("L", small.size, 0)
        lp = lab.load()
        for pts, _ in keep:
            for x, y in pts:
                lp[x, y] = 255
        x1 = min(c[1][0] for c in keep) * DOWN
        y1 = min(c[1][1] for c in keep) * DOWN
        x2 = max(c[1][2] for c in keep) * DOWN
        y2 = max(c[1][3] for c in keep) * DOWN
        pad = DOWN * 2
        box = (max(0, x1 - pad), max(0, y1 - pad), min(W, x2 + pad), min(H, y2 + pad))
        lab_full = lab.resize((W, H), Image.NEAREST).filter(ImageFilter.MaxFilter(9)).crop(box)
        alpha = ImageChops.multiply(fg.crop(box), lab_full)
        crop = img.crop(box)
        crop.putalpha(alpha)
        bb = alpha.getbbox()
        frames.append(crop.crop(bb) if bb else None)
        origins.append((box[0] + bb[0], box[1] + bb[1]) if bb else None)
        boxes.append(box if bb else None)

    # 막대는 격자 칸이 아니라 가장 가까운 캐릭터 것으로 친다 (막대가 칸 경계에 걸쳐 그려지기도 한다).
    # 캐릭터에 가려 끊긴 막대 조각들은 하나로 합친다
    bars = [None] * len(frames)
    best = [None] * len(frames)
    # 캐릭터의 실제 윤곽(여백 없이)으로 거리를 재고, 같으면 가운데끼리 가까운 쪽
    shapes = [(o[0], o[1], o[0] + f.width, o[1] + f.height) if f else None for f, o in zip(frames, origins)]
    for g in green:
        gx, gy = (g[0] + g[2]) / 2, (g[1] + g[3]) / 2

        def dist(b):
            dx = max(b[0] - g[2], g[0] - b[2], 0)
            dy = max(b[1] - g[3], g[1] - b[3], 0)
            cx, cy = (b[0] + b[2]) / 2 - gx, (b[1] + b[3]) / 2 - gy
            return (dx * dx + dy * dy, cx * cx + cy * cy)
        near = [(dist(b), i) for i, b in enumerate(shapes) if b]
        if not near:
            continue
        d, i = min(near)
        old = bars[i]
        if not old:
            bars[i], best[i] = g, d
            continue
        # 한 줄에 있는 조각(캐릭터에 가려 끊긴 막대)만 합친다. 아니면 캐릭터에 더 가까운 조각
        horiz = (old[2] - old[0]) >= (old[3] - old[1])
        lo, hi = (1, 3) if horiz else (0, 2)
        if min(old[hi], g[hi]) > max(old[lo], g[lo]):
            bars[i] = [min(old[0], g[0]), min(old[1], g[1]), max(old[2], g[2]), max(old[3], g[3])]
        elif d < best[i]:
            bars[i], best[i] = g, d
    return frames, origins, bars


def find_board(frame):
    """프레임(원본 해상도) 안의 흰 화이트보드 사각형 (x, y, w, h)"""
    rgb = frame.convert("RGB")
    a = frame.getchannel("A")
    r, g, b = rgb.split()
    white = ImageChops.multiply(
        ImageChops.multiply(threshold(r, lambda v: v > 215), threshold(g, lambda v: v > 215)),
        ImageChops.multiply(threshold(b, lambda v: v > 215), threshold(a, lambda v: v > 128)),
    )
    w, h = white.size
    f = 3
    small = threshold(white.resize((max(1, w // f), max(1, h // f)), Image.BOX), lambda v: v > 160)
    best = None
    for pts, (x1, y1, x2, y2) in components(small):
        bw, bh = x2 - x1, y2 - y1
        if bw < small.size[0] * 0.35 or y1 > small.size[1] * 0.55:
            continue
        score = len(pts)
        if best is None or score > best[0]:
            best = (score, (x1 * f, y1 * f, bw * f, bh * f))
    return best[1] if best else None


def build_palette(frames):
    pixels = []
    for fr in frames:
        if fr is None:
            continue
        for p in fr.getdata():
            if p[3] >= 128:
                pixels.append(p[:3])
    # 많이 쓰인 색(털)만 남지 않도록, 비슷한 색 구간마다 한 번씩만 넣는다.
    # 그래야 하트 눈·책·노트북·눈물 같은 작은 포인트 색이 살아남는다.
    bins = {}
    for p in pixels:
        bins.setdefault((p[0] >> 3, p[1] >> 3, p[2] >> 3), p)
    common = pixels[:: max(1, len(pixels) // 20000)]
    pixels = list(bins.values()) * 3 + common
    strip = Image.new("RGB", (len(pixels), 1))
    strip.putdata(pixels)
    return strip.quantize(colors=PALETTE, method=Image.Quantize.MEDIANCUT)


def pixelize(frame, scale, pal):
    w = max(1, round(frame.width * scale))
    h = max(1, round(frame.height * scale))
    # 알파를 곱한 채로 줄인다: 투명한 픽셀에 남아 있는 배경 마젠타·막대 초록이 가장자리 색에 섞여 들지 않게
    small = frame.convert("RGBa").resize((w, h), Image.BOX).convert("RGBA")
    alpha = threshold(small.getchannel("A"), lambda v: v >= 110)
    q = small.convert("RGB").quantize(palette=pal, dither=Image.Dither.NONE).convert("RGBA")
    q.putalpha(alpha)
    return q


def outline_n(img, n):
    for _ in range(n):
        img = outline(img)
    return img


def outline(img):
    """바깥 테두리 1px"""
    w, h = img.size
    out = Image.new("RGBA", (w + 2, h + 2), (0, 0, 0, 0))
    out.paste(img, (1, 1))
    a = out.getchannel("A")
    grown = a.filter(ImageFilter.MaxFilter(3))
    # 대각선은 빼고 상하좌우만: MaxFilter(3)는 대각선도 포함하므로 십자형으로 다시 계산
    ap = a.load()
    gp = grown.load()
    for y in range(h + 2):
        for x in range(w + 2):
            if gp[x, y] and not ap[x, y]:
                n = any(
                    0 <= x + dx < w + 2 and 0 <= y + dy < h + 2 and ap[x + dx, y + dy]
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                )
                if n:
                    out.putpixel((x, y), OUTLINE)
    return out


def process(animal, suffix, preview_dir):
    sheets, origins, bars = {}, {}, {}
    for sheet in SHEETS:
        p = os.path.join(RAW, f"{animal}-{sheet}{suffix}.png")
        if os.path.exists(p):
            sheets[sheet], origins[sheet], bars[sheet] = split_frames(Image.open(p), ledge=GUIDE.get(animal, "green") if sheet in REF_ANIM else None)
    if "move" not in sheets:
        print(f"  {animal}: move 시트 없음, 건너뜀")
        return None

    def heights(frames, idxs):
        hs = [frames[i].height for i in idxs if i < len(frames) and frames[i] is not None]
        return median(hs) if hs else None

    walk_h = heights(sheets["move"], range(0, 4)) or heights(sheets["move"], range(20))
    scales = {"move": TARGET_H / walk_h}
    if "emote" in sheets:
        scales["emote"] = TARGET_H / (heights(sheets["emote"], range(20)) or walk_h)
    for sheet, ref in REF_ANIM.items():
        if sheet not in sheets:
            continue
        # 선 자세(마지막 칸)의 키가 걷기 키와 같도록. 없으면 emote 와 같은 배율
        i = sum(n for _, n in SHEET_ANIMS[sheet])
        ref_h = heights(sheets[sheet], [i - 1])
        scales[sheet] = TARGET_H / ref_h if ref_h else scales.get("emote", scales["move"])

    pal = build_palette([f for fr in sheets.values() for f in fr])

    tiles, anims, boards, ledges, missing = [], {}, {}, {}, []
    sources = []  # 타일마다 (원본 프레임, 1배 최종 배율)
    for sheet, specs in SHEET_ANIMS.items():
        frames = sheets.get(sheet)
        i = 0
        for name, count in specs:
            idxs = []
            for _ in range(count):
                fr = frames[i] if frames and i < len(frames) else None
                cell = i
                i += 1
                if fr is None:
                    missing.append(f"{sheet}:{i - 1}")
                    continue
                s = scales[sheet]
                px = outline(pixelize(fr, s, pal))
                if px.width > CELL or px.height > CELL:
                    k = min(CELL / px.width, CELL / px.height)
                    s *= k
                    px = outline(pixelize(fr, s, pal))
                ox = (CELL - px.width) // 2
                oy = CELL - px.height
                tile = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
                tile.paste(px, (ox, oy), px)
                n = len(tiles)
                tiles.append(tile)
                sources.append((fr, s))
                idxs.append(n)
                bar = bars[sheet][cell] if sheet in bars else None
                if bar and origins[sheet][cell]:
                    # 초록 막대를 이 칸(타일) 좌표로: 프레임 원점 기준 → 축소 → 가운데·바닥 맞춤 + 외곽선 1px
                    fx, fy = origins[sheet][cell]
                    ledges[str(n)] = [
                        ox + 1 + round((bar[0] - fx) * s), oy + 1 + round((bar[1] - fy) * s),
                        ox + 1 + round((bar[2] - fx) * s), oy + 1 + round((bar[3] - fy) * s),
                    ]
                if name in BOARD_ANIMS:
                    b = find_board(fr)
                    if b:
                        bx, by, bw, bh = b
                        boards[str(n)] = [
                            ox + 1 + round(bx * s), oy + 1 + round(by * s),
                            max(4, round(bw * s)), max(3, round(bh * s)),
                        ]
            if idxs:
                anims[name] = idxs

    rows = (len(tiles) + ATLAS_COLS - 1) // ATLAS_COLS
    atlas = Image.new("RGBA", (ATLAS_COLS * CELL, rows * CELL), (0, 0, 0, 0))
    for n, t in enumerate(tiles):
        atlas.paste(t, ((n % ATLAS_COLS) * CELL, (n // ATLAS_COLS) * CELL))
    os.makedirs(OUT, exist_ok=True)
    atlas.save(os.path.join(OUT, f"{animal}.png"))

    # 다른 해상도 판: 같은 원본·같은 팔레트로 배율만 바꿔 픽셀화하고, 칸 가운데·바닥에 똑같이 맞춘다
    extra = []
    for art in ARTS:
        cell = round(CELL * art)
        big = Image.new("RGBA", (ATLAS_COLS * cell, rows * cell), (0, 0, 0, 0))
        for n, (fr, s) in enumerate(sources):
            t = outline_n(pixelize(fr, s * art, pal), max(1, round(art)))
            x0, y0 = (n % ATLAS_COLS) * cell, (n // ATLAS_COLS) * cell
            big.paste(t.crop((0, max(0, t.height - cell), min(cell, t.width), t.height)), (x0 + max(0, (cell - t.width) // 2), y0 + max(0, cell - t.height)))
        big.save(os.path.join(OUT, f"{animal}@{art}x.png"))
        extra.append(big)

    meta = {"cell": CELL, "charH": TARGET_H, "cols": ATLAS_COLS, "frames": len(tiles), "arts": [1, *ARTS], "anims": anims, "boards": boards, "ledges": ledges, "fur": fur_palette(animal, [atlas, *extra])}
    with open(os.path.join(OUT, f"{animal}.json"), "w") as f:
        json.dump(meta, f)

    if preview_dir:
        os.makedirs(preview_dir, exist_ok=True)
        z = 4
        bg = Image.new("RGBA", atlas.size, (236, 240, 246, 255))
        for n in range(len(tiles)):
            if (n // ATLAS_COLS + n % ATLAS_COLS) % 2:
                x, y = (n % ATLAS_COLS) * CELL, (n // ATLAS_COLS) * CELL
                bg.paste((222, 228, 238, 255), (x, y, x + CELL, y + CELL))
        bg.alpha_composite(atlas)
        for key, (lx1, ly1, lx2, ly2) in ledges.items():
            n = int(key)
            x0, y0 = (n % ATLAS_COLS) * CELL, (n // ATLAS_COLS) * CELL
            for xx in range(max(0, lx1), min(CELL, lx2)):
                for yy in range(max(0, ly1), min(CELL, ly2)):
                    bg.putpixel((x0 + xx, y0 + yy), (40, 200, 90, 255))
        for key, (bx, by, bw, bh) in boards.items():
            n = int(key)
            x, y = (n % ATLAS_COLS) * CELL + bx, (n // ATLAS_COLS) * CELL + by
            for xx in range(x, x + bw):
                bg.putpixel((xx, y), (255, 0, 0, 255))
                bg.putpixel((xx, min(bg.height - 1, y + bh - 1)), (255, 0, 0, 255))
        bg.resize((atlas.width * z, atlas.height * z), Image.NEAREST).save(os.path.join(preview_dir, f"{animal}.png"))

    print(f"  {animal}: {len(tiles)}프레임, 보드 {len(boards)}개, 가장자리 {len(ledges)}개" + (f", 빠짐 {missing}" if missing else ""))
    return animal


def main():
    args = sys.argv[1:]
    suffix = ""
    preview = None
    if "--suffix" in args:
        i = args.index("--suffix")
        suffix = args[i + 1]
        del args[i : i + 2]
    if "--preview" in args:
        i = args.index("--preview")
        preview = args[i + 1]
        del args[i : i + 2]
    animals = args or sorted({f.split("-")[0] for f in os.listdir(RAW) if f.endswith(f"-move{suffix}.png")})
    done = []
    for a in animals:
        print(f"[pixelate] {a}")
        if process(a, suffix, preview):
            done.append(a)
    existing = sorted(f[:-5] for f in os.listdir(OUT) if f.endswith(".json") and f != "index.json")
    with open(os.path.join(OUT, "index.json"), "w") as f:
        json.dump({"animals": existing}, f)


if __name__ == "__main__":
    main()
