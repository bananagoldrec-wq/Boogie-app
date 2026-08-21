#!/usr/bin/env python3
"""Gera os ícones do Coach em PNG puro, sem dependências.
Saída: icons/icon-coach-192.png, icons/icon-coach-512.png,
       icons/apple-touch-icon-coach.png (180)."""
import math, os, struct, zlib

TEAL_DARK = (16, 62, 54)
TEAL = (34, 102, 90)
TEAL_LIGHT = (74, 154, 137)
CREAM = (246, 244, 240)


def lerp(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def pixel(x, y, size):
    """Cor do pixel: microfone creme sobre fundo verde-profundo."""
    u, v = x / size, y / size          # 0..1
    cx, cy = 0.5, 0.5

    # fundo: gradiente diagonal suave
    base = lerp(TEAL_LIGHT, TEAL_DARK, (u * 0.4 + v * 0.9) * 0.9)
    # brilho no alto à esquerda
    glow = max(0.0, 1.0 - math.hypot(u - 0.3, v - 0.24) * 1.9)
    base = lerp(base, TEAL, glow * 0.5)

    # cápsula do microfone
    cap_w, cap_top, cap_bot, cap_r = 0.085, 0.255, 0.505, 0.085
    dx = abs(u - cx)
    if cap_top + cap_r <= v <= cap_bot - cap_r:
        d_cap = dx
    else:
        ny = cap_top + cap_r if v < cap_top + cap_r else cap_bot - cap_r
        d_cap = math.hypot(dx, v - ny)
    if d_cap <= cap_w:
        return CREAM

    # arco em volta (meia-lua aberta pra cima)
    arc_r, arc_t = 0.20, 0.028
    d_arc = abs(math.hypot(u - cx, v - 0.44) - arc_r)
    if d_arc <= arc_t and v >= 0.44:
        return CREAM

    # haste e base
    if abs(u - cx) <= 0.026 and 0.64 <= v <= 0.735:
        return CREAM
    if abs(v - 0.745) <= 0.026 and abs(u - cx) <= 0.105:
        return CREAM

    return base


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
    for size, name in [(192, "icon-coach-192.png"), (512, "icon-coach-512.png"),
                       (180, "apple-touch-icon-coach.png")]:
        write_png(os.path.join(icons, name), size, render(size))
