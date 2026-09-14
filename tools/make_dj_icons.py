#!/usr/bin/env python3
"""Gera os ícones da cópia em branco (DJ Negocia).

Mesmo desenho do ícone do app original — o disco de vinil de
tools/make_beno_icons.py — só que no violeta do tema em vez do
verde-limão, pra os dois não virarem o mesmo ícone no Dock de quem
instalar os dois.

Saída: icons/icon-dj-192.png, icons/icon-dj-512.png,
       icons/apple-touch-icon-dj.png (180).

Uso: python3 tools/make_dj_icons.py
"""
import importlib.util
import os

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)

spec = importlib.util.spec_from_file_location("icones", os.path.join(AQUI, "make_beno_icons.py"))
icones = importlib.util.module_from_spec(spec)
spec.loader.exec_module(icones)

# O desenho inteiro é construído a partir de ACC; trocar a cor aqui repinta
# o disco sem mexer em mais nada. VIOLET já é a segunda cor do tema.
icones.ACC = icones.VIOLET
icones.VIOLET = (201, 242, 77)  # o brilho de fundo troca com ele, pro contraste continuar

if __name__ == "__main__":
    pasta = os.path.join(RAIZ, "icons")
    os.makedirs(pasta, exist_ok=True)
    for tamanho, nome in [(192, "icon-dj-192.png"), (512, "icon-dj-512.png"),
                          (180, "apple-touch-icon-dj.png")]:
        icones.write_png(os.path.join(pasta, nome), tamanho, icones.render(tamanho))
