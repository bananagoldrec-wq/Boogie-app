#!/usr/bin/env python3
"""Gera os ícones do app do Beno em PNG puro, sem dependências.
Saída: icons/icon-beno-192.png, icons/icon-beno-512.png,
       icons/apple-touch-icon-beno.png (180).

Um disco de vinil no verde-limão do app sobre o roxo escuro do fundo —
as mesmas cores de css/beno.css, pra o ícone instalado combinar com a
janela que ele abre."""
import math, os, struct, zlib

BG_DARK = (13, 11, 19)       # --bg
BG_CARD = (30, 26, 43)       # --card
ACC = (201, 242, 77)         # --acc (verde-limão)
VIOLET = (185, 140, 255)     # --violet
LABEL = (13, 11, 19)


def lerp(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def pixel(x, y, size):
    """Cor do pixel: disco de vinil verde-limão sobre fundo roxo."""
    u, v = x / size, y / size          # 0..1
    cx, cy = 0.5, 0.5
    d = math.hypot(u - cx, v - cy)     # distância do centro

    # fundo: gradiente diagonal do roxo do card pro roxo do fundo
    base = lerp(BG_CARD, BG_DARK, (u * 0.35 + v * 0.95) * 0.95)
    # brilho violeta no alto à esquerda, pra não ficar chapado
    glow = max(0.0, 1.0 - math.hypot(u - 0.28, v - 0.24) * 2.0)
    base = lerp(base, VIOLET, glow * 0.16)

    disco_r = 0.365
    if d > disco_r:
        return base

    # borda do disco, um pouco mais escura que o corpo
    if d > disco_r - 0.018:
        return lerp(ACC, BG_DARK, 0.45)

    # sulcos: anéis concêntricos alternando claro e escuro
    sulco = math.sin((d - 0.085) / 0.0295 * math.pi * 2.0)
    corpo = lerp(ACC, BG_DARK, 0.20 + 0.16 * max(0.0, sulco))

    # brilho diagonal atravessando o disco, como luz num vinil
    brilho = max(0.0, 1.0 - abs((u - cx) * 0.72 + (v - cy) * 0.72 + 0.10) * 5.2)
    corpo = lerp(corpo, ACC, brilho * 0.55)

    # etiqueta central e furo
    if d <= 0.052:
        return lerp(LABEL, corpo, 0.0) if d <= 0.019 else ACC
    if d <= 0.135:
        return lerp(ACC, BG_DARK, 0.10)

    return corpo


def render(size, ss=3):
    big = size * ss
    out = bytearray(size * size * 4)
    inv = 1.0 / (ss * ss)
    for y in range(size):
        for x in range(size):
            r = g = b = 0
            for sy in range(ss):
                for sx in range(ss):
                    c = pixel(x * ss + sx + 0.5, y * ss + sy + 0.5, big)
                    r += c[0]; g += c[1]; b += c[2]
            i = (y * size + x) * 4
            out[i] = int(r * inv)
            out[i + 1] = int(g * inv)
            out[i + 2] = int(b * inv)
            out[i + 3] = 255
    return bytes(out)


def write_png(path, size, rgba):
    def chunk(typ, data):
        return (struct.pack(">I", len(data)) + typ + data +
                struct.pack(">I", zlib.crc32(typ + data) & 0xffffffff))
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    stride = size * 4
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        raw.extend(rgba[y * stride:(y + 1) * stride])
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", zlib.compress(bytes(raw), 9)))
        f.write(chunk(b"IEND", b""))
    print("wrote", path, size, "x", size)


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    icons = os.path.join(root, "icons")
    os.makedirs(icons, exist_ok=True)
    for size, name in [(192, "icon-beno-192.png"), (512, "icon-beno-512.png"),
                       (180, "apple-touch-icon-beno.png")]:
        write_png(os.path.join(icons, name), size, render(size))
