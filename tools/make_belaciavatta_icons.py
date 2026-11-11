#!/usr/bin/env python3
"""Gera os ícones do app Bela Ciavatta (precisa do Pillow).
Saída: icons/icon-belaciavatta-192.png, icons/icon-belaciavatta-512.png,
       icons/apple-touch-icon-belaciavatta.png (180).
No estilo da capa de "De lá": azul do céu com "bc" escrito à mão em ocre
(Reenie Beanie, em tools/fonts — licença SIL OFL)."""
import os
from PIL import Image, ImageDraw, ImageFont

SKY = (77, 107, 141)
OCHRE = (221, 154, 51)
HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(HERE, "fonts", "ReenieBeanie.ttf")
ROOT = os.path.join(HERE, "..", "icons")


def render(size):
    ss = 4
    S = size * ss
    im = Image.new("RGB", (S, S), SKY)
    d = ImageDraw.Draw(im)
    font = ImageFont.truetype(FONT, int(S * 0.78))
    d.text((S * 0.5, S * 0.47), "bc", font=font, fill=OCHRE, anchor="mm")
    return im.resize((size, size), Image.LANCZOS)


for name, size in [("icon-belaciavatta-192.png", 192), ("icon-belaciavatta-512.png", 512), ("apple-touch-icon-belaciavatta.png", 180)]:
    render(size).save(os.path.join(ROOT, name))
    print(name)
