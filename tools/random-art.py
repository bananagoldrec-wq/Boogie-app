"""Arte aleatória por árvore de expressões (x, y, cor → sin/cos/+/−/×/÷).

Baseado no script enviado, com duas correções:
- np.tile precisa de repetições inteiras (dX / img.shape[0] dava float no Python 3);
- o final ficou cortado em "Image": aqui salva com Image.fromarray(...).save().

Uso: python3 tools/random-art.py [quantidade] [pasta]
Gera PNG/JPG em refs/gerativas/ para o banco de referências do Cycles Visual.
"""
import random, sys, os
import numpy as np
from PIL import Image

dX, dY = 512, 512
xArray = np.linspace(0.0, 1.0, dX).reshape((1, dX, 1))
yArray = np.linspace(0.0, 1.0, dY).reshape((dY, 1, 1))

def randColor():
    return np.array([random.random(), random.random(), random.random()]).reshape((1, 1, 3))
def getX(): return xArray
def getY(): return yArray
def safeDivide(a, b):
    return np.divide(a, np.maximum(b, 0.001))

functions = [(0, randColor), (0, getX), (0, getY),
             (1, np.sin), (1, np.cos),
             (2, np.add), (2, np.subtract), (2, np.multiply), (2, safeDivide)]
depthMin, depthMax = 2, 10

def buildImg(depth=0):
    funcs = [f for f in functions if (f[0] > 0 and depth < depthMax) or (f[0] == 0 and depth >= depthMin)]
    nArgs, func = random.choice(funcs)
    args = [buildImg(depth + 1) for _ in range(nArgs)]
    return func(*args)

def make():
    img = buildImg()
    # garante dX × dY × 3 (correção: repetições inteiras)
    img = np.tile(img, (dX // img.shape[0], dY // img.shape[1], 3 // img.shape[2]))
    return np.uint8(np.rint(img.clip(0.0, 1.0) * 255.0))

def interesting(a):
    # descarta imagens chapadas (quase uma cor só)
    s = a[::8, ::8].astype(float) / 255
    sat = (s.max(2) - s.min(2)).mean()                     # quanto de cor tem
    edges = np.abs(np.diff(s, axis=0)).mean() + np.abs(np.diff(s, axis=1)).mean()  # quanta estrutura
    return a.std() > 35 and sat > 0.22 and edges > 0.02 and len(np.unique(a[::16, ::16].reshape(-1, 3), axis=0)) > 80

if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 24
    out = sys.argv[2] if len(sys.argv) > 2 else "refs/gerativas"
    os.makedirs(out, exist_ok=True)
    made = tries = 0
    while made < n and tries < n * 40:
        tries += 1
        random.seed(); a = make()
        if not interesting(a): continue
        made += 1
        Image.fromarray(a).resize((384, 384), Image.LANCZOS).save(f"{out}/arte-{made:02d}.jpg", quality=85)
    print(f"{made} imagens em {out} ({tries} tentativas)")
