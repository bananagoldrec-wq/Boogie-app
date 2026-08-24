#!/usr/bin/env python3
"""Gera os ícones (botão de controle) do app Oficina de Áudio em PNG puro,
sem dependências. Saída: icons/icon-oficina-192.png, icons/icon-oficina-512.png,
apple-touch-icon-oficina.png (180)."""
import math, os, struct, zlib

BG_DARK    = (27, 24, 21)
BG_EDGE    = (18, 16, 14)
KNOB_BODY  = (40, 35, 29)
KNOB_RIM   = (61, 53, 43)
POINTER    = (224, 138, 77)
POINTER_DK = (169, 83, 31)
TICK       = (122, 98, 72)


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def pixel(x, y, size):
    cx = cy = size / 2.0
    dx, dy = x - cx, y - cy
    r = math.hypot(dx, dy) / (size / 2.0)
    ang = math.atan2(dy, dx)  # -pi..pi, 0 = direita, sentido horário para baixo

    knob_r = 0.66
    rim_r = 0.74
    ticks_in, ticks_out = 0.80, 0.92

    # ponteiro apontando para ~ -45deg (cima-direita, "ganho alto")
    pointer_ang = math.radians(-55)
    pointer_r0, pointer_r1 = 0.14, 0.56
    pointer_width = 0.11

    if r <= knob_r:
        # corpo do botão com brilho sutil vindo de cima-esquerda
        shine = max(0.0, (-dx - dy) / (size)) * 0.35
        base = lerp(KNOB_BODY, (90, 78, 64), shine)
        # ponteiro
        da = (ang - pointer_ang + math.pi) % (2 * math.pi) - math.pi
        if pointer_r0 <= r <= pointer_r1 and abs(da) < pointer_width * (1.0 - r * 0.4):
            t = (r - pointer_r0) / (pointer_r1 - pointer_r0)
            return lerp(POINTER, POINTER_DK, t)
        return base
    if r <= rim_r:
        t = (r - knob_r) / (rim_r - knob_r)
        return lerp(KNOB_RIM, KNOB_BODY, t)
    if ticks_in <= r <= ticks_out:
        # 9 marcas ao redor, de -140deg a +140deg
        span = math.radians(280)
        start = math.radians(-140)
        n = 9
        for i in range(n):
            ta = start + span * i / (n - 1)
            da = (ang - ta + math.pi) % (2 * math.pi) - math.pi
            if abs(da) < 0.045:
                return TICK
        t = (r - ticks_in) / (ticks_out - ticks_in)
        return lerp(BG_DARK, BG_EDGE, t)
    t = min(1.0, (r - ticks_out) / (1.0 - ticks_out))
    return lerp(BG_DARK, BG_EDGE, t)


def render(size, ss=2):
    big = size * ss
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
        (192, os.path.join(root, "icons", "icon-oficina-192.png")),
        (512, os.path.join(root, "icons", "icon-oficina-512.png")),
        (180, os.path.join(root, "apple-touch-icon-oficina.png")),
    ]:
        write_png(path, size, render(size))
