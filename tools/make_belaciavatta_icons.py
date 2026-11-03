#!/usr/bin/env python3
"""Gera os ícones do app Bela Ciavatta (precisa do Pillow).
Saída: icons/icon-belaciavatta-192.png, icons/icon-belaciavatta-512.png,
       icons/apple-touch-icon-belaciavatta.png (180).
Monograma "BC" em serifa: B vinho e C tinta sobre o creme do app."""
import os
from PIL import Image, ImageDraw, ImageFont

PAPER = (243, 235, 221)
INK = (29, 23, 20)
WINE = (142, 31, 47)
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
ROOT = os.path.join(os.path.dirname(__file__), "..", "icons")


def render(size):
    ss = 4
    S = size * ss
    im = Image.new("RGB", (S, S), PAPER)
    d = ImageDraw.Draw(im)
    # disco fino em volta, lembrando um vinil
    m = int(S * 0.10)
    d.ellipse([m, m, S - m, S - m], outline=INK, width=int(S * 0.022))
    font = ImageFont.truetype(FONT, int(S * 0.36))
    bw = d.textlength("B", font=font)
    cw = d.textlength("C", font=font)
    gap = -S * 0.02
    x = (S - (bw + cw + gap)) / 2
    y = S * 0.5
    d.text((x, y), "B", font=font, fill=WINE, anchor="lm")
    d.text((x + bw + gap, y), "C", font=font, fill=INK, anchor="lm")
    return im.resize((size, size), Image.LANCZOS)


for name, size in [("icon-belaciavatta-192.png", 192), ("icon-belaciavatta-512.png", 512), ("apple-touch-icon-belaciavatta.png", 180)]:
    render(size).save(os.path.join(ROOT, name))
    print(name)
