#!/usr/bin/env python3
"""Generate SONIQ UI assets.

All icons are authored at 4x and downsampled for clean anti-aliasing.
Output: assets/soniq.s/**.png (referenced from device code as e.g. 'icon/play.png').
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "assets", "soniq")
GREEN = (29, 185, 84, 255)
WHITE = (255, 255, 255, 255)
GREY = (179, 179, 179, 255)
BG = (18, 18, 18, 255)
S = 4


def canvas(size, bg=(0, 0, 0, 0)):
    return Image.new("RGBA", (size * S, size * S), bg)


def save(img, name, size):
    os.makedirs(os.path.dirname(os.path.join(OUT, name)), exist_ok=True)
    img = img.resize((size, size), Image.LANCZOS)
    img.save(os.path.join(OUT, name))


def triangle(draw, box, color, direction="right"):
    x0, y0, x1, y1 = box
    if direction == "right":
        draw.polygon([(x0, y0), (x0, y1), (x1, (y0 + y1) / 2)], fill=color)
    elif direction == "left":
        draw.polygon([(x1, y0), (x1, y1), (x0, (y0 + y1) / 2)], fill=color)


def icon_play(size=88):
    # The reference player's triangle is optically centred: its bounding box
    # sits slightly right of the canvas centre so it does not look left-heavy.
    img = canvas(size)
    d = ImageDraw.Draw(img)
    triangle(d, (size * S * 0.38, size * S * 0.30, size * S * 0.68, size * S * 0.70), WHITE)
    save(img, "icon/play.png", size)


def icon_pause(size=88):
    img = canvas(size)
    d = ImageDraw.Draw(img)
    w = size * 0.11 * S
    gap = size * 0.10 * S
    h = size * 0.44 * S
    cx = size * S / 2
    top = (size * S - h) / 2
    d.rounded_rectangle([cx - gap - w, top, cx - gap, top + h], radius=w * 0.35, fill=WHITE)
    d.rounded_rectangle([cx + gap, top, cx + gap + w, top + h], radius=w * 0.35, fill=WHITE)
    save(img, "icon/pause.png", size)


def icon_skip(size=64, name="next", direction="right"):
    img = canvas(size)
    d = ImageDraw.Draw(img)
    pad = size * 0.24 * S
    bar_w = size * 0.10 * S
    if direction == "right":
        triangle(d, (pad, pad, size * S - pad - bar_w * 2, size * S - pad), WHITE)
        d.rounded_rectangle(
            [size * S - pad - bar_w, pad, size * S - pad, size * S - pad],
            radius=bar_w * 0.4, fill=WHITE)
    else:
        triangle(d, (pad + bar_w * 2, pad, size * S - pad, size * S - pad), WHITE, "left")
        d.rounded_rectangle([pad, pad, pad + bar_w, size * S - pad], radius=bar_w * 0.4, fill=WHITE)
    save(img, "icon/%s.png" % name, size)


def heart_points(size, pad):
    # Normalised heart outline, drawn as a polygon.
    w = size * S - pad * 2
    h = w * 0.86
    return w, h


def icon_heart(size=30, filled=False, color=WHITE):
    img = canvas(size)
    d = ImageDraw.Draw(img)
    w = size * S * 0.78
    h = w * 0.9
    ox = (size * S - w) / 2
    oy = (size * S - h) / 2
    # two circles + a triangle: simple, legible at small sizes
    r = w / 4
    d.ellipse([ox, oy, ox + w / 2, oy + w / 2], fill=color)
    d.ellipse([ox + w / 2, oy, ox + w, oy + w / 2], fill=color)
    d.polygon([(ox, oy + w / 4), (ox + w, oy + w / 4), (ox + w / 2, oy + h)], fill=color)
    if not filled:
        # punch a smaller heart out of the middle to make an outline
        cut = canvas(size)
        cd = ImageDraw.Draw(cut)
        iw = w * 0.55
        ih = iw * 0.95
        ix = (size * S - iw) / 2
        iy = (size * S - ih) / 2 + w * 0.06
        ir = iw / 4
        cd.ellipse([ix, iy, ix + iw / 2, iy + iw / 2], fill=(0, 0, 0, 0))
        cd.ellipse([ix + iw / 2, iy, ix + iw, iy + iw / 2], fill=(0, 0, 0, 0))
        cd.polygon([(ix, iy + iw / 4), (ix + iw, iy + iw / 4), (ix + iw / 2, iy + ih)],
                   fill=(0, 0, 0, 0))
        img = Image.composite(cut, img, cut.split()[3])
    save(img, "icon/%s.png" % ("heart_filled" if filled else "heart"), size)


def icon_download(size=30, done=False):
    img = canvas(size)
    d = ImageDraw.Draw(img)
    color = GREEN if done else WHITE
    lw = int(size * 0.075 * S)
    cx = size * S / 2
    d.line([(cx, size * S * 0.12), (cx, size * S * 0.62)], fill=color, width=lw)
    d.line([(cx - size * S * 0.18, size * S * 0.44), (cx, size * S * 0.62)],
           fill=color, width=lw)
    d.line([(cx + size * S * 0.18, size * S * 0.44), (cx, size * S * 0.62)],
           fill=color, width=lw)
    if done:
        d.line([(size * S * 0.22, size * S * 0.8), (size * S * 0.42, size * S * 0.95)],
               fill=color, width=lw)
        d.line([(size * S * 0.42, size * S * 0.95), (size * S * 0.8, size * S * 0.55)],
               fill=color, width=lw)
    else:
        d.line([(size * S * 0.2, size * S * 0.85), (size * S * 0.8, size * S * 0.85)],
               fill=color, width=lw)
    save(img, "icon/%s.png" % ("downloaded" if done else "download"), size)


def icon_check(size=26, color=GREEN):
    img = canvas(size)
    d = ImageDraw.Draw(img)
    lw = int(size * 0.09 * S)
    d.line([(size * S * 0.14, size * S * 0.55), (size * S * 0.4, size * S * 0.8)],
           fill=color, width=lw)
    d.line([(size * S * 0.4, size * S * 0.8), (size * S * 0.86, size * S * 0.24)],
           fill=color, width=lw)
    save(img, "icon/check.png", size)


def icon_search(size=30):
    img = canvas(size)
    d = ImageDraw.Draw(img)
    lw = int(size * 0.075 * S)
    r = size * S * 0.29
    cx = size * S * 0.43
    cy = size * S * 0.43
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=WHITE, width=lw)
    d.line([(cx + r * 0.72, cy + r * 0.72), (size * S * 0.88, size * S * 0.88)],
           fill=WHITE, width=lw)
    save(img, "icon/search.png", size)


def icon_speaker(size=30):
    img = canvas(size)
    d = ImageDraw.Draw(img)
    lw = int(size * 0.07 * S)
    # speaker body
    d.polygon([(size * S * 0.14, size * S * 0.36), (size * S * 0.32, size * S * 0.36),
               (size * S * 0.5, size * S * 0.18), (size * S * 0.5, size * S * 0.82),
               (size * S * 0.32, size * S * 0.64), (size * S * 0.14, size * S * 0.64)],
              fill=WHITE)
    for i, rr in enumerate((0.16, 0.27, 0.38)):
        d.arc([size * S * (0.42 - rr), size * S * (0.5 - rr),
               size * S * (0.42 + rr) + size * S * 0.22, size * S * (0.5 + rr)],
              start=-55, end=55, fill=WHITE, width=lw)
    save(img, "icon/speaker.png", size)


def icon_list(size=28):
    img = canvas(size)
    d = ImageDraw.Draw(img)
    lw = int(size * 0.075 * S)
    for i, y in enumerate((0.24, 0.5, 0.76)):
        d.line([(size * S * 0.2, size * S * y), (size * S * 0.82, size * S * y)],
               fill=WHITE, width=lw)
        d.ellipse([size * S * 0.09, size * S * y - lw, size * S * 0.09 + lw * 2,
                   size * S * y + lw], fill=WHITE)
    save(img, "icon/list.png", size)


def icon_back(size=22, color=WHITE):
    img = canvas(size)
    d = ImageDraw.Draw(img)
    lw = int(size * 0.1 * S)
    d.line([(size * S * 0.62, size * S * 0.22), (size * S * 0.32, size * S * 0.5),
            (size * S * 0.62, size * S * 0.78)], fill=color, width=lw, joint="curve")
    save(img, "icon/back.png", size)


def icon_chevron(size=18, color=GREY):
    img = canvas(size)
    d = ImageDraw.Draw(img)
    lw = int(size * 0.1 * S)
    d.line([(size * S * 0.36, size * S * 0.22), (size * S * 0.66, size * S * 0.5),
            (size * S * 0.36, size * S * 0.78)], fill=color, width=lw, joint="curve")
    save(img, "icon/chevron.png", size)


def icon_trash(size=26):
    img = canvas(size)
    d = ImageDraw.Draw(img)
    lw = int(size * 0.07 * S)
    d.rounded_rectangle([size * S * 0.22, size * S * 0.28, size * S * 0.78, size * S * 0.86],
                        radius=size * S * 0.06, outline=GREY, width=lw)
    d.line([(size * S * 0.14, size * S * 0.22), (size * S * 0.86, size * S * 0.22)],
           fill=GREY, width=lw)
    d.line([(size * S * 0.4, size * S * 0.22), (size * S * 0.4, size * S * 0.12)],
           fill=GREY, width=lw)
    d.line([(size * S * 0.6, size * S * 0.22), (size * S * 0.6, size * S * 0.12)],
           fill=GREY, width=lw)
    for x in (0.42, 0.58):
        d.line([(size * S * x, size * S * 0.4), (size * S * x, size * S * 0.74)],
               fill=GREY, width=lw)
    save(img, "icon/trash.png", size)


def icon_backspace(size=28):
    img = canvas(size)
    d = ImageDraw.Draw(img)
    lw = int(size * 0.07 * S)
    d.polygon([(size * S * 0.08, size * S * 0.5), (size * S * 0.28, size * S * 0.2),
               (size * S * 0.9, size * S * 0.2), (size * S * 0.9, size * S * 0.8),
               (size * S * 0.28, size * S * 0.8)], outline=WHITE)
    d.line([(size * S * 0.44, size * S * 0.38), (size * S * 0.7, size * S * 0.62)],
           fill=WHITE, width=lw)
    d.line([(size * S * 0.7, size * S * 0.38), (size * S * 0.44, size * S * 0.62)],
           fill=WHITE, width=lw)
    save(img, "icon/backspace.png", size)


def icon_plus(size=28):
    img = canvas(size)
    d = ImageDraw.Draw(img)
    lw = int(size * 0.08 * S)
    d.line([(size * S * 0.2, size * S * 0.5), (size * S * 0.8, size * S * 0.5)], fill=WHITE, width=lw)
    d.line([(size * S * 0.5, size * S * 0.2), (size * S * 0.5, size * S * 0.8)], fill=WHITE, width=lw)
    save(img, "icon/plus.png", size)


def icon_minus(size=28):
    img = canvas(size)
    d = ImageDraw.Draw(img)
    lw = int(size * 0.08 * S)
    d.line([(size * S * 0.2, size * S * 0.5), (size * S * 0.8, size * S * 0.5)], fill=WHITE, width=lw)
    save(img, "icon/minus.png", size)


def icon_refresh(size=26):
    img = canvas(size)
    d = ImageDraw.Draw(img)
    lw = int(size * 0.075 * S)
    d.arc([size * S * 0.16, size * S * 0.16, size * S * 0.84, size * S * 0.84],
          start=40, end=330, fill=WHITE, width=lw)
    d.polygon([(size * S * 0.78, size * S * 0.06), (size * S * 0.94, size * S * 0.3),
               (size * S * 0.66, size * S * 0.3)], fill=WHITE)
    save(img, "icon/refresh.png", size)


def icon_close(size=24):
    img = canvas(size)
    d = ImageDraw.Draw(img)
    lw = int(size * 0.08 * S)
    d.line([(size * S * 0.24, size * S * 0.24), (size * S * 0.76, size * S * 0.76)],
           fill=GREY, width=lw)
    d.line([(size * S * 0.76, size * S * 0.24), (size * S * 0.24, size * S * 0.76)],
           fill=GREY, width=lw)
    save(img, "icon/close.png", size)


def icon_blank(size=16):
    img = canvas(size)
    save(img, "icon/blank.png", size)


def artwork_placeholder(size=300):
    img = Image.new("RGBA", (size * S, size * S), BG)
    d = ImageDraw.Draw(img)
    # subtle concentric rings
    for i, alpha in enumerate((26, 20, 14, 8)):
        r = size * S * (0.42 - i * 0.075)
        cx = cy = size * S / 2
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 255, 255, alpha), width=2 * S)
    # music note
    cx = size * S * 0.481
    cy = size * S * 0.564
    r = size * S * 0.11
    d.ellipse([cx - r * 2.1, cy, cx, cy + r * 1.5], fill=GREEN)
    d.ellipse([cx + r * 0.35, cy - r * 0.5, cx + r * 2.45, cy + r], fill=GREEN)
    d.rectangle([cx - r * 0.35, cy - size * S * 0.24, cx, cy + r * 0.6], fill=GREEN)
    d.rectangle([cx + r * 2.1, cy - size * S * 0.29, cx + r * 2.45, cy + r * 0.5], fill=GREEN)
    d.polygon([(cx - r * 0.35, cy - size * S * 0.24),
               (cx + r * 2.45, cy - size * S * 0.29),
               (cx + r * 2.45, cy - size * S * 0.22),
               (cx - r * 0.35, cy - size * S * 0.17)], fill=GREEN)
    save(img, "artwork/placeholder.png", size)


def app_icon(size=240):
    img = Image.new("RGBA", (size * S, size * S), GREEN)
    d = ImageDraw.Draw(img)
    # black equaliser bars forming an "S" rhythm
    widths = [0.09, 0.09, 0.09, 0.09]
    heights = [0.30, 0.52, 0.40, 0.24]
    gap = 0.07
    total = sum(widths) + gap * (len(widths) - 1)
    x = (1 - total) / 2
    for w, h in zip(widths, heights):
        d.rounded_rectangle(
            [x * size * S, (0.5 - h / 2) * size * S,
             (x + w) * size * S, (0.5 + h / 2) * size * S],
            radius=w * size * S * 0.45, fill=(0, 0, 0, 255))
        x += w + gap
    save(img, "icon.png", size)


def main():
    os.makedirs(OUT, exist_ok=True)
    icon_play()
    icon_pause()
    icon_skip(64, "next", "right")
    icon_skip(64, "previous", "left")
    icon_heart(38, False, WHITE)
    icon_heart(38, True, GREEN)
    icon_download(38, False)
    icon_download(38, True)
    icon_check(30)
    icon_search(36)
    icon_speaker(36)
    icon_list(34)
    icon_back(32)
    icon_chevron(22)
    icon_trash(32)
    icon_backspace(32)
    icon_plus(32)
    icon_minus(32)
    icon_refresh(32)
    icon_close(28)
    icon_blank(16)
    artwork_placeholder(300)
    app_icon(240)
    print("assets written to", os.path.abspath(OUT))


if __name__ == "__main__":
    main()
