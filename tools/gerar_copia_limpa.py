#!/usr/bin/env python3
"""Gera a cópia em branco do app de negociação (dj.html / js/dj.js) a partir
do app do Beno (beno.html / js/beno.js).

A mesma estrutura, zerada: sem contatos, sem negociações, sem voos, sem
press kit e sem nuvem. É script e não cópia feita à mão de propósito —
quando o app do Beno mudar, roda de novo e a cópia acompanha, sem risco
de alguém esquecer de apagar um dado pessoal no meio de 3.500 linhas.

Uso: python3 tools/gerar_copia_limpa.py
"""

import pathlib
import re
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent


def trocar(texto, alvo, novo, *, vezes=1, rotulo=""):
    """Troca exigindo que o alvo apareça o número esperado de vezes.

    Se o app do Beno mudar e um trecho sumir, o script para aqui em vez de
    gerar uma cópia silenciosamente com dado pessoal dentro.
    """
    achou = texto.count(alvo)
    if achou != vezes:
        raise SystemExit(
            f"ERRO em {rotulo or alvo[:40]!r}: esperava {vezes} ocorrência(s), achei {achou}.\n"
            "O app mudou — ajuste o script antes de gerar a cópia."
        )
    return texto.replace(alvo, novo)


def esvaziar_bloco(texto, nome, vazio="[];", rotulo=""):
    """Substitui `const NOME = [ ... ];` inteiro por uma lista vazia."""
    padrao = re.compile(r"  const " + re.escape(nome) + r" = \[.*?\n  \];", re.S)
    novo, n = padrao.subn("  const " + nome + " = " + vazio, texto)
    if n != 1:
        raise SystemExit(f"ERRO: não achei o bloco {nome} ({rotulo}).")
    return novo


# ─────────────────────────────────────────────────────────────
# JavaScript
# ─────────────────────────────────────────────────────────────

js = (RAIZ / "js" / "beno.js").read_text(encoding="utf-8")

js = trocar(
    js,
    """/* beno · negociação de shows — pipeline de curadores, agenda e WhatsApp.
   Mesma arquitetura da agenda do Frisson: sincroniza via Firebase quando dá,
   e cai pro armazenamento local do aparelho quando o Firebase não responde,
   pra que o app nunca fique travado numa tela vazia. */""",
    """/* DJ Negocia — pipeline de curadores, agenda e WhatsApp.

   Cópia em branco, gerada por tools/gerar_copia_limpa.py. Não edite este
   arquivo à mão: mexa em js/beno.js e rode o script de novo, senão a
   próxima geração apaga o que você escreveu aqui.

   Guarda tudo no próprio aparelho. Sincronização na nuvem vem desligada —
   veja firebaseConfig logo abaixo pra ligar com uma conta sua. */""",
    rotulo="cabeçalho",
)

# A config do Firebase apontava pro projeto do Beno, e a primeira
# sincronização SOBE o que é local. Deixar isso numa cópia jogaria as
# negociações de quem recebe dentro do banco do Beno, e traria as dele
# pra cá. Sai inteira; quem quiser nuvem põe a própria.
js = re.sub(
    r"  /\* ── Firebase \(opcional\).*?\n  \};\n",
    '''  /* ── Firebase (opcional, desligado) ─────────────────────
     Sem isto o app guarda tudo só neste aparelho — funciona normal,
     mas não aparece no celular e no computador ao mesmo tempo.

     Pra ligar: crie um projeto no console do Firebase (grátis), ative
     Authentication > Anônimo e o Firestore, e cole aqui a config do
     projeto no lugar do null. Use um projeto SEU: apontar pro de outra
     pessoa mistura os dados dos dois. */
  const firebaseConfig = null;
''',
    js,
    count=1,
    flags=re.S,
)

js = trocar(
    js,
    "  async function connectFirebase() {\n    try {",
    "  async function connectFirebase() {\n    if (!firebaseConfig) return;\n    try {",
    rotulo="guarda do connectFirebase",
)

# Senha: a do Beno estava fixa no código, e quem recebe a cópia não
# consegue trocar (o arquivo não é dele). Aqui ela é escolhida na
# primeira abertura e fica no aparelho.
js = trocar(
    js,
    '''  /* Trava de acesso simples: senha única embutida no app, checada
     localmente. Segura visitante casual, mas não é segurança de verdade —
     quem ler o código do app acha a senha. Troque aqui quando quiser. */
  const APP_PASSWORD = "231019";
  /* o sufixo acompanha a senha: trocar a senha desconecta os aparelhos
     que já estavam destravados, em vez de deixá-los entrando pela antiga */
  const UNLOCK_KEY = "beno_negocia_unlocked_v2";
  const LOCAL_KEY = "beno_negocia_data_v1";''',
    '''  /* Trava de acesso simples: a senha é escolhida na primeira vez que o
     app abre e fica guardada neste aparelho. Segura visitante casual, mas
     não é segurança de verdade — quem abrir as ferramentas do navegador
     acha a senha. Não guarde aqui nada que não possa vazar. */
  const SENHA_KEY = "dj_negocia_senha_v1";
  const UNLOCK_KEY = "dj_negocia_unlocked_v1";
  const LOCAL_KEY = "dj_negocia_data_v1";

  function senhaDefinida() {
    try { return !!localStorage.getItem(SENHA_KEY); } catch (err) { return false; }
  }
  function senhaConfere(valor) {
    try { return localStorage.getItem(SENHA_KEY) === valor; } catch (err) { return false; }
  }
  function definirSenha(valor) {
    try { localStorage.setItem(SENHA_KEY, valor); } catch (err) {}
  }''',
    rotulo="senha",
)

js = trocar(
    js,
    '''  document.getElementById("login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("login-password");
    if (input.value === APP_PASSWORD) {
      document.getElementById("login-error").hidden = true;
      input.value = "";
      unlockApp();
    } else {
      document.getElementById("login-error").hidden = false;
    }
  });''',
    '''  /* Primeira abertura: em vez de pedir uma senha que ninguém definiu,
     a tela vira cadastro e a primeira senha digitada passa a valer. */
  function pintarPortao() {
    const primeira = !senhaDefinida();
    document.getElementById("login-titulo").textContent = primeira ? "Crie sua senha" : "Acesso restrito";
    document.getElementById("login-ajuda").textContent = primeira
      ? "É a sua primeira vez aqui. Escolha uma senha pra proteger suas negociações neste aparelho."
      : "Digite a senha pra abrir suas negociações.";
    document.getElementById("login-submit").textContent = primeira ? "Criar senha" : "Entrar";
  }
  pintarPortao();

  document.getElementById("login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("login-password");
    const valor = input.value;
    if (!senhaDefinida()) {
      if (valor.length < 4) {
        document.getElementById("login-error").textContent = "Use pelo menos 4 caracteres.";
        document.getElementById("login-error").hidden = false;
        return;
      }
      definirSenha(valor);
      pintarPortao();
    } else if (!senhaConfere(valor)) {
      document.getElementById("login-error").textContent = "Senha incorreta.";
      document.getElementById("login-error").hidden = false;
      return;
    }
    document.getElementById("login-error").hidden = true;
    input.value = "";
    unlockApp();
  });''',
    rotulo="submit do login",
)

# Com o nome em branco as mensagens saem "Aqui é o, DJ". Em vez de remendar
# cada template, o app abre as Configurações na primeira entrada e pede o
# nome — que é o que a pessoa ia ter que preencher de qualquer jeito.
js = trocar(
    js,
    '''  function unlockApp() {
    try { localStorage.setItem(UNLOCK_KEY, "1"); } catch (err) {}
    loginGate.hidden = true;
    connectFirebase();
  }''',
    '''  function unlockApp() {
    try { localStorage.setItem(UNLOCK_KEY, "1"); } catch (err) {}
    loginGate.hidden = true;
    connectFirebase();
    /* App recém-aberto, sem nome cadastrado: abre as Configurações em vez
       de deixar a falta aparecer no meio de uma mensagem pro curador. */
    if (!config.dj) {
      openTemplatesPanel();
      showToast("Comece pelo seu nome e seu estilo — as mensagens usam os dois.");
    }
  }''',
    rotulo="abrir configurações na estreia",
)

js = trocar(
    js,
    '''  document.getElementById("logout-btn").addEventListener("click", () => {
    try { localStorage.removeItem(UNLOCK_KEY); } catch (err) {}
    loginGate.hidden = false;
  });''',
    '''  document.getElementById("logout-btn").addEventListener("click", () => {
    try { localStorage.removeItem(UNLOCK_KEY); } catch (err) {}
    pintarPortao();
    loginGate.hidden = false;
  });''',
    rotulo="logout",
)

# Press kit: eram dois PDFs do Beno, fixos no código. Viram campo de
# configuração, pra cada um apontar pro seu.
js = trocar(
    js,
    '''  /* Press kit hospedado junto do app — link fixo, sempre no ar, que o
     Beno manda pros curadores. Absoluto porque vai viajar pro WhatsApp. */
  const PRESSKIT_BASE = "https://bananagoldrec-wq.github.io/Boogie-app/press";
  const PRESSKIT_URL = `${PRESSKIT_BASE}/beno-presskit-pt.pdf`;
  const PRESSKIT_EN_URL = `${PRESSKIT_BASE}/beno-presskit-en.pdf`;''',
    '''  /* Press kit: o link é cadastrado em Configurações e vai viajar pro
     WhatsApp, então tem que ser endereço completo (com https://).
     Hospede o PDF onde quiser — Drive, Dropbox, seu site. */
  function presskitUrl() { return ((config && config.linkPresskit) || "").trim(); }
  function presskitEnUrl() { return ((config && config.linkPresskitEn) || "").trim(); }''',
    rotulo="constantes do press kit",
)

js = trocar(js, "PRESSKIT_EN_URL", "presskitEnUrl()", vezes=4, rotulo="usos do press kit EN")
js = trocar(js, "PRESSKIT_URL", "presskitUrl()", vezes=4, rotulo="usos do press kit PT")

# Botão de anexar/copiar press kit sem link cadastrado mandaria mensagem
# capenga pro curador. Avisa em vez de anexar vazio.
js, n = re.subn(
    r"(\n(\s+)const url = btn\.dataset\.\w+ === \"en\" \? presskitEnUrl\(\) : presskitUrl\(\);)",
    r'\1\n\2if (!url) return showToast("Cadastre o link do seu press kit em Configurações.");',
    js,
)
if n != 3:
    raise SystemExit(f"ERRO: esperava 3 botões de press kit, achei {n}.")

js = trocar(
    js,
    '''    if (tpl.includes("{linkInsta}") && !config.linkInsta) return "seu Instagram";''',
    '''    if (tpl.includes("{linkInsta}") && !config.linkInsta) return "seu Instagram";
    if (tpl.includes("{presskit}") && !presskitUrl()) return "o link do seu press kit";
    if (tpl.includes("{presskitEn}") && !presskitEnUrl()) return "o link do seu press kit em inglês";
    if (tpl.includes("{estilo}") && !config.estiloPadrao) return "seu estilo";
    if (tpl.includes("{dj}") && !config.dj) return "seu nome";''',
    rotulo="aviso de link faltando",
)

# Sem press kit cadastrado, tira a frase inteira em vez de deixar
# "segue meu press kit:" com nada depois.
js = trocar(
    js,
    '''    // idem pro Instagram: sem o perfil, sai "— Instagram." sozinho
    if (!config.linkInsta) tpl = tpl.replace(/\\s*[—–-]?\\s*Instagram\\s+\\{linkInsta\\}/gi, "");''',
    '''    // idem pro Instagram: sem o perfil, sai "— Instagram." sozinho
    if (!config.linkInsta) tpl = tpl.replace(/\\s*[—–-]?\\s*Instagram\\s+\\{linkInsta\\}/gi, "");
    // e sem press kit, some a frase toda em vez de deixar "press kit:" vazio
    if (!presskitUrl()) tpl = tpl.replace(/[,;]?\\s*segue meu press kit:\\s*\\{presskit\\}/gi, "");
    if (!presskitEnUrl()) tpl = tpl.replace(/[,;]?\\s*here'?s my press kit:\\s*\\{presskitEn\\}/gi, "");
    /* Mesma coisa pro estilo. No app original ele já vinha preenchido, então
       a frase nunca ficava pela metade; aqui começa vazio e sairia "Set de."
       na cara do curador. */
    if (!(deal.estilo || config.estiloPadrao)) {
      tpl = tpl
        .replace(/\\s*Meu set é de \\{estilo\\}\\./gi, "")
        .replace(/\\s*Set de \\{estilo\\}\\./gi, "")
        .replace(/\\s*Levo set de \\{estilo\\},\\s*/gi, " Toco ")
        .replace(/\\s*Tô com set novo de \\{estilo\\} e queria/gi, " Queria")
        .replace(/I play \\{estilo\\} and I'?d/gi, "I'd");
    }''',
    rotulo="limpeza da frase do press kit",
)

# Nome do DJ: some o "Beno" de dentro do app.
js = trocar(js, '    dj: "Beno",', '    dj: "",', rotulo="nome no DEFAULT_CONFIG")
js = trocar(
    js,
    '    linkInsta: "",\n',
    '    linkInsta: "",\n    linkPresskit: "",\n    linkPresskitEn: "",\n',
    rotulo="campos do press kit no DEFAULT_CONFIG",
)
js = trocar(
    js,
    '.replaceAll("{dj}", config.dj || "Beno")',
    '.replaceAll("{dj}", config.dj || "")',
    rotulo="fallback do nome",
)
js = trocar(
    js,
    '''      apresentacao: "{curador}, segue meu press kit: {presskit} — Instagram {linkInsta}. Set de {estilo}, tocando bastante aqui no Rio. Se abrir alguma data no {casa} me chama que eu me viro pra encaixar 🙌",
      apresentacaoEn: "Hi {curador}, this is {dj}, DJ from Rio 🎧 Here's my press kit: {presskitEn} — Instagram {linkInsta}. I play {estilo} and I'd love to play at {casa}. Any date coming up?",''',
    '''      apresentacao: "{curador}, segue meu press kit: {presskit} — Instagram {linkInsta}. Set de {estilo}. Se abrir alguma data no {casa} me chama que eu me viro pra encaixar 🙌",
      apresentacaoEn: "Hi {curador}, this is {dj}, DJ 🎧 Here's my press kit: {presskitEn} — Instagram {linkInsta}. I play {estilo} and I'd love to play at {casa}. Any date coming up?",''',
    rotulo="templates com 'Rio'",
)
js = trocar(
    js,
    '''      primeiroContato: "Oi {curador}, tudo bem? Aqui é o {dj}, DJ do Rio 🎧 Acompanho o trabalho de vocês no {casa} e queria muito tocar aí. Meu set é de {estilo}. Posso te mandar meu material?",''',
    '''      primeiroContato: "Oi {curador}, tudo bem? Aqui é o {dj}, DJ 🎧 Acompanho o trabalho de vocês no {casa} e queria muito tocar aí. Meu set é de {estilo}. Posso te mandar meu material?",''',
    rotulo="template de primeiro contato",
)
js = trocar(
    js,
    '    estiloPadrao: "Disco/Boogie/House",',
    '    estiloPadrao: "",',
    rotulo="estilo padrão",
)

# Configurações: dois campos novos pro press kit, no mesmo molde do Instagram.
js = trocar(
    js,
    '  const cfgLinkInsta = document.getElementById("cfg-link-insta");',
    '  const cfgLinkInsta = document.getElementById("cfg-link-insta");\n'
    '  const cfgPresskit = document.getElementById("cfg-presskit");\n'
    '  const cfgPresskitEn = document.getElementById("cfg-presskit-en");',
    rotulo="inputs do press kit",
)
js = trocar(
    js,
    '    cfgLinkInsta.value = config.linkInsta || "";',
    '    cfgLinkInsta.value = config.linkInsta || "";\n'
    '    cfgPresskit.value = config.linkPresskit || "";\n'
    '    cfgPresskitEn.value = config.linkPresskitEn || "";',
    rotulo="preenchimento do press kit",
)
js = trocar(
    js,
    '    config.linkInsta = cfgLinkInsta.value.trim();',
    '    config.linkInsta = cfgLinkInsta.value.trim();\n'
    '    config.linkPresskit = cfgPresskit.value.trim();\n'
    '    config.linkPresskitEn = cfgPresskitEn.value.trim();\n'
    '    pintarLinksPresskit();',
    rotulo="gravação do press kit",
)

# Os dois "Abrir press kit" apontavam pro PDF do Beno. Agora seguem o
# que estiver cadastrado, e somem enquanto não houver nada.
js = trocar(
    js,
    '  const presskitMenu = document.getElementById("presskit-menu");',
    '''  /* Liga os "Abrir press kit" ao link cadastrado; sem link, esconde,
     porque um botão que abre o nada é pior do que botão nenhum. */
  function pintarLinksPresskit() {
    [["pt", presskitUrl()], ["en", presskitEnUrl()]].forEach(([lang, url]) => {
      document.querySelectorAll(`[data-abrir-presskit="${lang}"]`).forEach((a) => {
        a.href = url || "#";
        a.hidden = !url;
      });
    });
  }

  const presskitMenu = document.getElementById("presskit-menu");''',
    rotulo="links de abrir press kit",
)

# ── Sementes: tudo que era dado do Beno vira lista vazia ──
js = esvaziar_bloco(js, "SEED_SHOWS", rotulo="agenda")
js = esvaziar_bloco(js, "SEED_CURADOR_LOTES", rotulo="curadores")
js = esvaziar_bloco(js, "SEED_LOGISTICA_LOTES", rotulo="lotes de voos")
js = esvaziar_bloco(js, "SEED_LOGISTICA", rotulo="voos")
js = esvaziar_bloco(js, "COMPLEMENTOS", rotulo="complementos de contato")
js = esvaziar_bloco(js, "COMPLEMENTOS_LOG", rotulo="complementos de voo")
js = trocar(js, '  const REMOCOES = ["Jazz Mansion", "Curtis"];', "  const REMOCOES = [];", rotulo="remoções")
js = trocar(
    js,
    '  const AGENCIA = "Travel Blue Turismo · Alessandro (21) 98875-5873 · alessandro@travelblueturismo.com.br";\n',
    "",
    rotulo="agência de viagem",
)

# O service worker era o do Beno: registrar aquele aqui faria a cópia
# servir o cache do outro app.
js = trocar(js, 'register("sw-beno.js")', 'register("sw-dj.js")', rotulo="service worker")
js = trocar(js, 'downloadCsv("beno-negociacoes.csv"', 'downloadCsv("dj-negociacoes.csv"', rotulo="CSV de negociações")
js = trocar(js, 'downloadCsv("beno-contatos.csv"', 'downloadCsv("dj-contatos.csv"', rotulo="CSV de contatos")
js = trocar(js, "o ?v= do beno.html", "o ?v= do dj.html", rotulo="comentário do ?v=")

# Comentários que falavam do Beno em primeira pessoa.
for antes, depois in [
    ("Aeroportos que aparecem nas viagens do Beno — só", "Aeroportos usados nas viagens — só"),
    ("mantém como o Beno escreveu", "mantém como foi escrito"),
    ("Casas que o Beno foi confirmando depois", "Casas confirmadas depois"),
    ("que o Beno quer enxergar", "que interessa enxergar"),
    ("que é justamente o que o Beno não", "que é justamente o que quem digita não"),
    ("o melhor que dá é o país, até o Beno digitar a cidade", "o melhor que dá é o país, até digitarem a cidade"),
    ("Beno conferir se exportou da conta certa", "conferir se exportou da conta certa"),
    ("nem apagar nada na conta do Beno", "nem apagar nada na sua conta"),
    ("Curadores passados pelo Beno. Cada", "Curadores iniciais, se houver. Cada"),
    ("Passagens que o Beno já comprou. Mesmo", "Passagens já compradas, se houver. Mesmo"),
    ("Shows já marcados, lançados a partir da agenda do Beno", "Shows já marcados, se houver"),
    ("Contatos que o Beno pediu pra tirar. Roda", "Contatos a remover, se houver. Roda"),
    ("sem tocar no que o Beno editou.", "sem tocar no que já foi editado à mão."),
    ("um link que o\n     Beno ainda não cadastrou", "um link que\n     ainda não foi cadastrado"),
    ("o Beno\n     manda pros curadores", "você\n     manda pros curadores"),
]:
    if antes in js:
        js = js.replace(antes, depois)

# Chaves de armazenamento e coleções: beno_* → dj_*. O app do Beno e a
# cópia moram no mesmo endereço, e o navegador guarda por endereço — com
# o mesmo nome de chave, um sobrescreveria o outro no aparelho de quem
# abrisse os dois.
js = re.sub(r'"beno_', '"dj_', js)

# "js/beno.js" no cabeçalho é de propósito: diz de onde esta cópia veio.
conferindo = js.replace("js/beno.js", "")
if re.search("[Bb]eno", conferindo):
    linhas = [f"  {i}: {l.strip()}" for i, l in enumerate(conferindo.splitlines(), 1) if re.search("[Bb]eno", l)]
    raise SystemExit("ERRO: ainda sobrou 'beno' no JS:\n" + "\n".join(linhas))

(RAIZ / "js" / "dj.js").write_text(js, encoding="utf-8")


# ─────────────────────────────────────────────────────────────
# HTML
# ─────────────────────────────────────────────────────────────

html = (RAIZ / "beno.html").read_text(encoding="utf-8")

html = trocar(
    html,
    '<meta name="description" content="Negociação de shows do DJ Beno no Rio de Janeiro: curadores, casas, pipeline de contato e agenda, com mensagens prontas no WhatsApp." />',
    '<meta name="description" content="Negociação de shows de DJ: curadores, casas, pipeline de contato e agenda, com mensagens prontas no WhatsApp." />',
    rotulo="description",
)
html = trocar(html, "<title>beno · negociação de shows</title>", "<title>DJ · negociação de shows</title>", rotulo="title")
html = trocar(html, '<meta name="apple-mobile-web-app-title" content="Beno Negocia" />', '<meta name="apple-mobile-web-app-title" content="DJ Negocia" />', rotulo="nome no iOS")
html = trocar(html, 'href="manifest-beno.json"', 'href="manifest-dj.json"', rotulo="manifest")
html = trocar(html, 'href="icons/apple-touch-icon-beno.png"', 'href="icons/apple-touch-icon-dj.png"', rotulo="ícone iOS")
html = trocar(html, 'href="icons/icon-beno-192.png"', 'href="icons/icon-dj-192.png"', rotulo="ícone 192")
html = trocar(html, 'href="icons/icon-beno-512.png"', 'href="icons/icon-dj-512.png"', rotulo="ícone 512")
html = re.sub(r'src="js/beno\.js\?v=\d+"', 'src="js/dj.js?v=1"', html, count=1)

# A marca "beno" aparece no crachá do topo e na tela de senha.
html = trocar(html, '<div class="logo-badge login-logo">beno</div>', '<div class="logo-badge login-logo">dj</div>', rotulo="crachá do login")
html = trocar(html, '<div class="logo-badge">beno</div>', '<div class="logo-badge">dj</div>', rotulo="crachá do topo")

# Tela de senha: os textos mudam entre "criar" e "entrar", então ganham id.
html = trocar(html, "<h2>Acesso restrito</h2>", '<h2 id="login-titulo">Acesso restrito</h2>', rotulo="título do login")
html = trocar(
    html,
    '<p class="wa-hint">Digite a senha pra abrir suas negociações.</p>',
    '<p class="wa-hint" id="login-ajuda">Digite a senha pra abrir suas negociações.</p>',
    rotulo="ajuda do login",
)
# A senha do Beno era só números; a nova pode ter letras.
html = trocar(
    html,
    '<input id="login-password" type="password" inputmode="numeric" autocomplete="current-password" required />',
    '<input id="login-password" type="password" autocomplete="current-password" required />',
    rotulo="campo de senha",
)

# Placeholders que sugeriam os dados do Beno.
html = trocar(html, '<input id="cfg-dj" type="text" placeholder="Beno" autocomplete="off" />', '<input id="cfg-dj" type="text" placeholder="Seu nome de DJ" autocomplete="off" />', rotulo="placeholder do nome")
html = trocar(html, '<input id="cfg-estilo" type="text" placeholder="Disco/Boogie/House" autocomplete="off" />', '<input id="cfg-estilo" type="text" placeholder="House, techno, disco..." autocomplete="off" />', rotulo="placeholder do estilo")
html = trocar(html, '<input id="cfg-link-insta" type="text" placeholder="@beno" autocomplete="off" />', '<input id="cfg-link-insta" type="text" placeholder="@seuperfil" autocomplete="off" />', rotulo="placeholder do instagram")

# O exemplo do campo "localizador" era o código da reserva real da TAP do
# Beno, e o do número do voo era um voo dele. Exemplo é exemplo.
html = trocar(html, 'placeholder="C5ZJTY"', 'placeholder="ABC123"', rotulo="exemplo de localizador")
html = trocar(html, 'placeholder="TP74"', 'placeholder="TP1234"', rotulo="exemplo de número de voo")

# Os PDFs do Beno saem; entram links que seguem o que for cadastrado.
html = trocar(
    html,
    '''        <a href="press/beno-presskit-pt.pdf" target="_blank" rel="noopener">Abrir press kit · PT</a>
        <a href="press/beno-presskit-en.pdf" target="_blank" rel="noopener">Abrir press kit · EN</a>''',
    '''        <a data-abrir-presskit="pt" href="#" target="_blank" rel="noopener" hidden>Abrir press kit · PT</a>
        <a data-abrir-presskit="en" href="#" target="_blank" rel="noopener" hidden>Abrir press kit · EN</a>''',
    rotulo="menu do press kit",
)
html = trocar(
    html,
    '''        <a class="wa-chip" href="press/beno-presskit-pt.pdf" target="_blank" rel="noopener">Abrir PT</a>
        <a class="wa-chip" href="press/beno-presskit-en.pdf" target="_blank" rel="noopener">Abrir EN</a>''',
    '''        <a class="wa-chip" data-abrir-presskit="pt" href="#" target="_blank" rel="noopener" hidden>Abrir PT</a>
        <a class="wa-chip" data-abrir-presskit="en" href="#" target="_blank" rel="noopener" hidden>Abrir EN</a>''',
    rotulo="chips do press kit",
)

# Campos novos de configuração, logo depois do Instagram.
html = trocar(
    html,
    '          <input id="cfg-link-insta" type="text" placeholder="@seuperfil" autocomplete="off" />',
    '''          <input id="cfg-link-insta" type="text" placeholder="@seuperfil" autocomplete="off" />
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="cfg-presskit">Link do press kit (PT)</label>
          <input id="cfg-presskit" type="url" placeholder="https://..." autocomplete="off" />
        </div>
        <div class="field">
          <label for="cfg-presskit-en">Link do press kit (EN)</label>
          <input id="cfg-presskit-en" type="url" placeholder="https://..." autocomplete="off" />''',
    rotulo="campos do press kit",
)

# O CSS é compartilhado de propósito: não tem nada pessoal dentro, e assim
# um ajuste de estilo vale pros dois apps em vez de precisar ser feito duas
# vezes. Por isso "css/beno.css" fica — é o único "beno" permitido aqui.
conferindo = html.replace("css/beno.css", "")
if re.search("[Bb]eno", conferindo):
    linhas = [f"  {i}: {l.strip()}" for i, l in enumerate(conferindo.splitlines(), 1) if re.search("[Bb]eno", l)]
    raise SystemExit("ERRO: ainda sobrou 'beno' no HTML:\n" + "\n".join(linhas))

(RAIZ / "dj.html").write_text(html, encoding="utf-8")


# ─────────────────────────────────────────────────────────────
# Manifesto e service worker
# ─────────────────────────────────────────────────────────────

manifesto = (RAIZ / "manifest-beno.json").read_text(encoding="utf-8")
manifesto = (
    manifesto.replace("beno.html", "dj.html")
    .replace("icon-beno-", "icon-dj-")
    .replace("Beno · Negociação de Shows", "DJ · Negociação de Shows")
    .replace("Beno Negocia", "DJ Negocia")
    .replace(
        "Agenda de shows, contatos de curadores e logística de viagem do DJ Beno, "
        "com mensagens prontas no WhatsApp.",
        "Agenda de shows, contatos de curadores e logística de viagem, "
        "com mensagens prontas no WhatsApp.",
    )
)
if re.search("[Bb]eno", manifesto):
    raise SystemExit("ERRO: sobrou 'beno' no manifesto:\n" + manifesto)
(RAIZ / "manifest-dj.json").write_text(manifesto, encoding="utf-8")

sw = (RAIZ / "sw-beno.js").read_text(encoding="utf-8")
sw = sw.replace("beno", "dj").replace("Beno", "DJ")
(RAIZ / "sw-dj.js").write_text(sw, encoding="utf-8")

print("Gerado: dj.html, js/dj.js, manifest-dj.json, sw-dj.js")
