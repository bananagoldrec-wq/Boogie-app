#!/usr/bin/env python3
"""Gera os ícones (vinil retrô) do app em PNG puro, sem dependências.
Saída: icons/icon-192.png, icons/icon-512.png, apple-touch-icon.png (180)."""
import math, os, struct, zlib

BROWN      = (74, 44, 23)
BROWN_SOFT = (107, 67, 38)
GOLD       = (232, 181, 74)
ORANGE     = (232, 115, 44)
DARK1      = (24, 24, 24)
DARK2      = (44, 44, 44)


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def pixel(x, y, size):
    """Cor RGB de um pixel (coordenadas no espaço final)."""
    cx = cy = size / 2.0
    dx, dy = x - cx, y - cy
    r = math.hypot(dx, dy) / (size / 2.0)  # 0 no centro, 1 na borda

    disc_r = 0.92
    ring_r = 0.97       # aro dourado externo
    label_r = 0.34
    hole_r = 0.03

    if r <= hole_r:
        return BROWN
    if r <= label_r:
        # rótulo: dourado no miolo, laranja na borda
        return GOLD if r <= label_r * 0.45 else ORANGE
    if r <= disc_r:
        # sulcos do vinil
        groove = int((r * size / 2.0) / 3.0) % 2
        base = DARK1 if groove == 0 else DARK2
        # brilho diagonal sutil
        shine = max(0.0, (dx - dy) / (size)) * 0.25
        return lerp(base, (90, 90, 90), shine)
    if r <= ring_r:
        return GOLD
    # fundo: gradiente radial marrom
    t = min(1.0, (r - ring_r) / (1.0 - ring_r))
    return lerp(BROWN_SOFT, BROWN, t)


def render(size, ss=2):
    """Renderiza com supersampling ss para antialiasing."""
    big = size * ss
    # cache da linha grande
    out = bytearray(size * size * 4)
    inv = 1.0 / (ss * ss)
    for y in range(size):
        for x in range(size):
            r = g = b = 0
            for sy in range(ss):
                for sx in range(ss):
                    px = x * ss + sx
                    py = y * ss + sy
                    c = pixel(px + 0.5, py + 0.5, big)
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
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    stride = size * 4
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        raw.extend(rgba[y * stride:(y + 1) * stride])
    idat = zlib.compress(bytes(raw), 9)
    with open(path, "wb") as f:
        f.write(sig)
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", idat))
        f.write(chunk(b"IEND", b""))
    print("wrote", path, size, "x", size)


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.makedirs(os.path.join(root, "icons"), exist_ok=True)
    for size, path in [
        (192, os.path.join(root, "icons", "icon-192.png")),
        (512, os.path.join(root, "icons", "icon-512.png")),
        (180, os.path.join(root, "apple-touch-icon.png")),
    ]:
        write_png(path, size, render(size))
