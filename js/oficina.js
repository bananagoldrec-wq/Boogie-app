/* Oficina de Áudio — guia de montagem (pré-amp, equalizador, compressor).
   App de página única, estado salvo em localStorage, funciona offline. */

const STORAGE_KEY = "oficina-state-v1";
const BANNER_KEY = "oficina-hide-install-banner";

const CHECK_ICON = `<svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 7l3.5 3.5L12 3" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// ---------------------------------------------------------------- dados ---

const PROJECTS = {
  preamp: {
    id: "preamp",
    num: "01",
    title: "Pré-Amplificador",
    difficulty: 1,
    difficultyLabel: "Comece aqui",
    desc: "Buffer JFET + estágio de ganho com TL072. Converte um sinal fraco de instrumento em sinal de linha, limpo.",
    intro:
      "Buffer JFET (Q1) seguido de um estágio de ganho com amplificador operacional TL072. " +
      "O sinal entra à esquerda, é bufferizado (impedância alta na entrada, baixa na saída) e depois amplificado pelo pot de ganho.",
    walkthrough: [
      "O plugue de <b>entrada</b> recebe o sinal fraco do instrumento/microfone.",
      "<b>C1 (100nF)</b> bloqueia corrente contínua vinda do instrumento e deixa passar só o áudio.",
      "<b>R1 (1MΩ)</b> puxa o gate do transistor para 0V em repouso — sem ele o gate ficaria \"flutuando\".",
      "<b>Q1</b>, o JFET, é o buffer: mesmo sinal na saída, mas com impedância baixa — evita perder agudos do instrumento.",
      "<b>R2 (10kΩ)</b> define o ponto de polarização (bias) do JFET.",
      "<b>C2</b> acopla a saída do buffer à entrada do op-amp, bloqueando só a parte contínua.",
      "<b>R3 + R4 + C3</b> formam o ponto médio (~4,5V) — a referência que permite ao op-amp amplificar os dois lados da onda, já que o circuito roda só com +9V.",
      "O <b>TL072</b> é o ganho de verdade: <code>Ganho = 1 + P1/R5</code> — de 1x a ~11x girando o potenciômetro.",
      "<b>C4</b> acopla a saída para o próximo equipamento.",
      "O sinal amplificado sai pelo plugue de <b>saída</b>.",
      "A <b>bateria de 9V</b> alimenta tudo; <b>D1</b> protege contra polaridade invertida; <b>C5</b> filtra ruído perto do CI.",
    ],
    materiais: [
      { qty: "1", part: "Transistor JFET", value: "2N5457 (ou J201)", role: "Buffer de entrada, alta impedância" },
      { qty: "1", part: "Amp. operacional duplo, DIP-8", value: "TL072", role: "Estágio de ganho" },
      { qty: "1", part: "Resistor", value: "1MΩ", role: "Polarização do gate (R1)" },
      { qty: "1", part: "Resistor", value: "10kΩ", role: "Resistor de fonte do JFET (R2)" },
      { qty: "1", part: "Resistor", value: "10kΩ", role: "Resistor de ganho, Rg (R5)" },
      { qty: "1", part: "Potenciômetro linear", value: "100kΩ", role: "Controle de ganho, Rf (P1)" },
      { qty: "2", part: "Resistor (par igual)", value: "100kΩ", role: "Divisor de tensão de polarização (R3, R4)" },
      { qty: "1", part: "Capacitor de poliéster", value: "100nF", role: "Acoplamento de entrada (C1)" },
      { qty: "2", part: "Capacitor eletrolítico", value: "1–10µF", role: "Acoplamento entre estágios / saída (C2, C4)" },
      { qty: "1", part: "Capacitor eletrolítico", value: "10µF", role: "Filtro do ponto médio (C3)" },
      { qty: "1", part: "Capacitor de poliéster", value: "100nF", role: "Desacoplamento da alimentação (C5)" },
      { qty: "1", part: "Diodo", value: "1N4001", role: "Proteção contra inversão de polaridade (D1)" },
      { qty: "1", part: "Clipe/conector para bateria 9V", value: "—", role: "Alimentação" },
      { qty: "2", part: "Jaque P10 mono", value: "—", role: "Entrada e saída" },
    ],
    passos: [
      "Monte só o buffer primeiro (Q1, R1, R2, C1) na protoboard, isolado.",
      "Meça a polarização com o multímetro: tensão na fonte do JFET entre 1/3 e 1/2 da alimentação.",
      "Injete um sinal real (fone de celular via capacitor de proteção) e escute a saída do buffer.",
      "Monte o divisor de tensão de polarização (R3, R4, C3) — o ponto médio de 4,5V.",
      "Monte o estágio de ganho (TL072, R5, P1) ligado à saída do buffer e ao ponto médio.",
      "Meça de novo: saída do TL072 perto de 4,5V sem sinal; repita o teste de escuta com o pot de ganho.",
      "Passe para a placa de ilhas (stripboard) — buffer primeiro, testar, depois o estágio de ganho.",
      "Monte na caixa: potenciômetro de ganho, jaques de entrada/saída, fiação final.",
    ],
    problemas: [
      { symptom: "Nenhum sinal passa", cause: "Confira a pinagem do JFET — a do 2N5457 é fácil de inverter" },
      { symptom: "Zumbido alto", cause: "Falta uma ligação de terra, ou um jaque encostando na caixa metálica" },
      { symptom: "Som distorcido mesmo com ganho baixo", cause: "Ponto de polarização errado — confira os 4,5V e a tensão na fonte do JFET" },
      { symptom: "Saída do op-amp travada perto de 0V ou 9V", cause: "O ponto médio de 4,5V não está chegando na entrada não-inversora" },
    ],
  },

  eq: {
    id: "eq",
    num: "02",
    title: "Equalizador",
    difficulty: 2,
    difficultyLabel: "Moderado",
    desc: "3 bandas — grave, médio e agudo. Baxandall ativo (TL072) + estágio de médio em gyrator (TL071).",
    intro:
      "Um estágio Baxandall ativo de grave/agudo somado a um estágio de médio em gyrator, cada um com seu potenciômetro. " +
      "É a mesma família de circuito usada de consoles de mixagem a amplificadores de guitarra.",
    materiais: [
      { qty: "1", part: "Amp. operacional duplo, DIP-8", value: "TL072", role: "Estágio grave/agudo" },
      { qty: "1", part: "Amp. operacional simples, DIP-8", value: "TL071", role: "Estágio de médio (gyrator)" },
      { qty: "1", part: "Potenciômetro linear", value: "100kΩ", role: "Controle de grave" },
      { qty: "1", part: "Potenciômetro linear", value: "100kΩ", role: "Controle de agudo" },
      { qty: "1", part: "Potenciômetro linear", value: "100kΩ", role: "Controle de médio" },
      { qty: "vários", part: "Resistores", value: "10k–100kΩ", role: "Ajuste de ganho de cada estágio (definir no simulador)" },
      { qty: "1", part: "Capacitor de poliéster", value: "~100nF", role: "Timing do grave" },
      { qty: "1", part: "Capacitor de poliéster", value: "~6.8nF", role: "Timing do agudo" },
      { qty: "1", part: "Capacitor de poliéster", value: "~22nF", role: "Timing do médio (gyrator, ~1kHz)" },
      { qty: "2", part: "Capacitor eletrolítico", value: "1–10µF", role: "Acoplamento entrada/saída" },
      { qty: "2 + 1", part: "Resistores 100kΩ + capacitor 10µF", value: "—", role: "Trilho de referência de 4,5V (igual ao pré-amp)" },
    ],
    passos: [
      "Monte o trilho de referência de 4,5V (igual ao pré-amp) — todo estágio de op-amp aqui precisa dele.",
      "Monte primeiro só o estágio grave/agudo (Baxandall) na protoboard e confirme que os dois pots mudam o tom perceptivelmente.",
      "Simule os valores exatos no Falstad antes de definir os resistores/capacitores — o ponto de corte depende deles.",
      "Adicione o estágio de médio (gyrator) como caminho paralelo, somado à saída grave/agudo antes do buffer final.",
      "Faça o teste de varredura: toque uma música conhecida e gire cada pot de ponta a ponta ouvindo a mudança.",
      "Se girar o agudo também alterar o médio perceptivelmente, ajuste a frequência central do gyrator no simulador.",
      "Passe para a placa de ilhas, confira ~4,5V na saída de cada op-amp sem sinal, finalize a fiação na caixa.",
    ],
    problemas: [
      { symptom: "Um controle não faz nada", cause: "Confira se o potenciômetro está no caminho do sinal, não só na alimentação" },
      { symptom: "Controles interferem entre si", cause: "Frequência central do gyrator errada — ajuste os capacitores do estágio de médio" },
      { symptom: "Ruído/chiado constante", cause: "Confira o trilho de 4,5V chegando em todas as entradas não-inversoras" },
    ],
  },

  comp: {
    id: "comp",
    num: "03",
    title: "Compressor",
    difficulty: 3,
    difficultyLabel: "Mais difícil — monte por último",
    desc: "Célula de ganho OTA (CA3080) controlada por um envelope follower. A mesma topologia de pedais clássicos.",
    intro:
      "Uma célula OTA cujo ganho é controlado por uma tensão DC derivada de um envelope follower. " +
      "Quanto mais alto o sinal de entrada, mais o OTA reduz seu próprio ganho — resultado: dinâmica mais uniforme.",
    howItWorks: [
      "O sinal de entrada, já bufferizado, se divide em dois caminhos.",
      "Um caminho passa pela célula de ganho OTA (CI CA3080) — o caminho de áudio de verdade, com ganho controlado por uma corrente DC no pino de polarização.",
      "O outro caminho alimenta um envelope follower: um diodo retifica o sinal AC numa tensão DC que acompanha o volume, carregando um capacitor. A velocidade de carga define o ataque; a de descarga define o release.",
      "Esse envelope DC controla o pino de ganho do OTA — sinal mais alto = mais corrente de controle = menos ganho. Mais alto na entrada → saída mais uniforme.",
    ],
    materiais: [
      { qty: "1", part: "CI OTA, DIP-8", value: "CA3080", role: "Célula de redução de ganho" },
      { qty: "2", part: "Amp. operacional duplo, DIP-8", value: "TL072", role: "Buffers de entrada/saída" },
      { qty: "2", part: "Diodo", value: "1N4148", role: "Retificador do envelope" },
      { qty: "1", part: "Capacitor eletrolítico", value: "~0.1µF", role: "Tempo de ataque" },
      { qty: "1", part: "Capacitor eletrolítico", value: "~1–2µF", role: "Tempo de release" },
      { qty: "1", part: "Potenciômetro", value: "100kΩ", role: "Sensibilidade / quantidade de compressão" },
      { qty: "1", part: "Potenciômetro", value: "100kΩ", role: "Nível de saída (ganho de compensação)" },
      { qty: "vários", part: "Resistores", value: "mistos", role: "Rede de polarização e timing" },
      { qty: "2 + 1", part: "Resistores 100kΩ + capacitor 10µF", value: "—", role: "Trilho de 4,5V (igual aos outros dois projetos)" },
    ],
    passos: [
      "Monte o primeiro compressor a partir de um kit com placa pronta (ex.: Ross Compressor da General Guitar Gadgets, ou PedalPCB) — a rede de timing do envelope é sensível.",
      "Depois de entender como um compressor funcionando deve soar, montar uma versão do zero na protoboard fica bem mais produtivo — simule no Falstad antes.",
      "Teste com transientes, não com tom contínuo: toque uma corda dedilhada ou uma palma e ouça o pico sendo puxado para baixo.",
      "Com o multímetro no pino de corrente de controle do OTA, toque um sinal e observe a tensão DC se mover com o volume.",
    ],
    problemas: [
      { symptom: "Não comprime nada", cause: "Confira se o envelope follower está realmente ligado ao pino de controle do OTA" },
      { symptom: "Comprime demais / \"engasga\"", cause: "Tempos de ataque/release desproporcionais — ajuste os capacitores de timing" },
      { symptom: "Chiado constante", cause: "Comece a partir de um kit testado antes de depurar uma versão feita do zero" },
    ],
  },
};

const FUNDAMENTOS = {
  id: "fundamentos",
  title: "Fundamentos de Eletrônica",
  modules: [
    {
      id: "tensao-corrente",
      num: "1",
      title: "Tensão, corrente e resistência",
      summary: "A Lei de Ohm — a base de tudo o que vem depois.",
      content: [
        "Eletricidade é o movimento de elétrons por um material condutor, como um fio de cobre.",
        "<b>Tensão (V, em volts)</b> é a \"pressão\" elétrica — a diferença de potencial entre dois pontos que empurra os elétrons.",
        "<b>Corrente (I, em ampères)</b> é a quantidade de elétrons que passa por um ponto do circuito a cada segundo.",
        "<b>Resistência (R, em ohms Ω)</b> é o quanto um material dificulta essa passagem.",
        "A <b>Lei de Ohm</b> liga as três: <code>V = I × R</code>. Sabendo duas, você calcula a terceira.",
        "Analogia útil: numa mangueira de água, tensão é a pressão da água, corrente é o quanto de água passa, e resistência é o quão estreita é a mangueira.",
      ],
      exercises: [
        { type: "mcq", q: "Numa mangueira de água, a tensão elétrica é parecida com o quê?", options: ["A quantidade de água que passa", "A pressão da água", "O quão estreita é a mangueira", "A cor da mangueira"], correct: 1, explain: "Tensão é a \"pressão\" que empurra os elétrons — assim como a pressão empurra a água na mangueira." },
        { type: "calc", q: "Um resistor de 1kΩ (1000Ω) está ligado a uma pilha de 9V. Qual a corrente, em miliampères (mA)?", answer: 9, tolerance: 0.5, unit: "mA", explain: "I = V/R = 9V ÷ 1000Ω = 0,009A = 9mA." },
        { type: "mcq", q: "Se você aumenta a resistência de um circuito mantendo a mesma tensão, o que acontece com a corrente?", options: ["Aumenta", "Diminui", "Não muda", "Depende da cor do fio"], correct: 1, explain: "Como I = V/R, se V é fixo e R aumenta, I diminui." },
      ],
    },
    {
      id: "ca-cc",
      num: "2",
      title: "Corrente contínua × alternada",
      summary: "Por que o áudio é AC \"em cima\" de uma alimentação DC.",
      content: [
        "<b>DC (corrente contínua)</b> flui sempre na mesma direção, com tensão constante — é o que uma pilha ou bateria fornece.",
        "<b>AC (corrente alternada)</b> muda de direção periodicamente — é o que sai da tomada, e também é a forma de um sinal de áudio.",
        "Um sinal de áudio (voz, música, guitarra) é uma onda AC: sobe e desce muitas vezes por segundo — de 20 a 20.000 vezes, o que chamamos de frequência, em Hz.",
        "Nos três projetos deste app, a alimentação é DC (pilha de 9V), mas o sinal de áudio que passa por dentro é AC. É por isso que usamos capacitores entre estágios: eles deixam passar só a parte AC (o áudio) e bloqueiam a parte DC.",
      ],
      exercises: [
        { type: "mcq", q: "O sinal de áudio que sai de uma guitarra é...", options: ["DC constante", "AC, oscilando muitas vezes por segundo", "Só existe quando toca uma nota grave", "Sempre positivo"], correct: 1, explain: "Áudio é uma onda AC — é essa oscilação que o alto-falante converte em som." },
        { type: "mcq", q: "Por que os circuitos deste app usam capacitores entre um estágio e outro?", options: ["Para aumentar o volume", "Para bloquear a parte DC e deixar passar só o áudio (AC)", "Para guardar energia para quando a bateria acabar", "Para dar cor ao som"], correct: 1, explain: "Capacitor de acoplamento: passa o AC (áudio), bloqueia o DC de polarização de um estágio vazar pro outro." },
      ],
    },
    {
      id: "resistores",
      num: "3",
      title: "Resistores e código de cores",
      summary: "O componente mais comum de todos os três projetos.",
      content: [
        "Resistor limita a corrente elétrica — quanto maior o valor em ohms (Ω), mais ele \"segura\" a corrente.",
        "O valor vem escrito no corpo como faixas coloridas (código de cores), porque o componente é pequeno demais pra escrever números.",
        "As primeiras faixas indicam os dígitos, a próxima é o multiplicador, e a última é a tolerância — o quanto o valor real pode variar do nominal.",
        "Você não precisa decorar o código agora. No dia a dia, quase todo mundo usa um multímetro (ou um app no celular) pra conferir o valor real antes de soldar.",
      ],
      exercises: [
        { type: "mcq", q: "Para que serve o código de cores num resistor?", options: ["Decoração", "Indicar o valor em ohms do resistor", "Indicar a marca do fabricante", "Indicar a temperatura máxima"], correct: 1, explain: "As faixas coloridas codificam o valor em ohms e a tolerância." },
        { type: "mcq", q: "Qual é a forma mais prática de conferir o valor real de um resistor antes de soldar?", options: ["Provar com a língua", "Multímetro no modo resistência (Ω)", "Balança de cozinha", "Olhando o tamanho do componente"], correct: 1, explain: "O multímetro no modo Ω mede o valor real — muito mais confiável do que decorar cores." },
      ],
    },
    {
      id: "capacitores",
      num: "4",
      title: "Capacitores",
      summary: "Bloqueiam DC, deixam passar AC — a peça-chave do acoplamento entre estágios.",
      content: [
        "Capacitor guarda carga elétrica temporariamente entre duas placas condutoras separadas por um isolante.",
        "Comportamento-chave: um capacitor bloqueia corrente contínua (DC) em regime permanente, mas deixa passar corrente alternada (AC).",
        "É por isso que ele aparece tanto nos três projetos: um capacitor de acoplamento entre estágios deixa o áudio (AC) passar, mas impede que a tensão DC de polarização de um estágio \"vaze\" pro próximo.",
        "Valor medido em Farads — na prática usamos frações bem menores: microfarads (µF), nanofarads (nF) e picofarads (pF).",
        "Capacitores eletrolíticos têm polaridade (um lado + e um − marcado no corpo) — ligar ao contrário pode danificar o componente. Os de poliéster/cerâmica geralmente não têm polaridade.",
      ],
      exercises: [
        { type: "mcq", q: "O que um capacitor faz com um sinal de corrente contínua (DC), depois do momento inicial de carregar?", options: ["Deixa passar livremente", "Bloqueia", "Inverte a polaridade", "Transforma em som"], correct: 1, explain: "Em regime permanente, o capacitor bloqueia o DC — só deixa passar a parte que varia (AC)." },
        { type: "mcq", q: "Por que isso é útil entre dois estágios de um circuito de áudio?", options: ["Deixa passar o áudio (AC) e bloqueia o DC de polarização de vazar pro próximo estágio", "Aumenta o volume do sinal", "Protege contra curto-circuito", "Substitui o resistor"], correct: 0, explain: "É exatamente o papel de C2 e C4 no pré-amplificador, por exemplo." },
        { type: "mcq", q: "O que pode acontecer se você ligar um capacitor eletrolítico com a polaridade invertida?", options: ["Nada, funciona igual", "Pode danificar o componente", "Fica mais barato", "Aumenta a vida útil"], correct: 1, explain: "Eletrolíticos têm um lado + e um − — ao contrário, o componente pode aquecer, estufar ou falhar." },
      ],
    },
    {
      id: "diodos-transistores",
      num: "5",
      title: "Diodos, LEDs e transistores",
      summary: "Os componentes que dão \"direção\" e ganho ao circuito.",
      content: [
        "<b>Diodo</b>: deixa a corrente passar só numa direção. Usamos isso pra proteger contra bateria ligada ao contrário (D1, presente nos três projetos) e pra \"retificar\" sinal — transformar AC em algo parecido com DC, que é a base do envelope follower do compressor.",
        "<b>LED</b>: um tipo de diodo que emite luz quando a corrente passa na direção certa.",
        "<b>Transistor</b>: um componente que pode agir como amplificador ou como interruptor controlado eletricamente. No pré-amplificador deste app usamos um JFET como buffer — ele \"copia\" o sinal de entrada na saída, mas com impedância mais baixa, sem perder informação do sinal.",
      ],
      exercises: [
        { type: "mcq", q: "O que um diodo faz?", options: ["Amplifica o sinal", "Deixa a corrente passar só numa direção", "Guarda carga elétrica", "Gira um motor"], correct: 1, explain: "Essa é a propriedade fundamental do diodo — condução em um único sentido." },
        { type: "mcq", q: "Qual é o papel do JFET (Q1) no pré-amplificador deste app?", options: ["Aumentar o volume", "Funcionar como buffer: repetir o sinal com impedância mais baixa", "Filtrar o grave", "Acender um LED"], correct: 1, explain: "O buffer não amplifica — ele adapta a impedância, evitando perda de agudos do instrumento." },
      ],
    },
    {
      id: "opamps",
      num: "6",
      title: "Amplificadores operacionais",
      summary: "O componente central dos três projetos.",
      content: [
        "Um amplificador operacional (op-amp) é um CI que amplifica a diferença de tensão entre duas entradas: a não-inversora (+) e a inversora (−).",
        "Sozinho, ele amplifica demais (ganho quase infinito) — por isso sempre ligamos um resistor (ou potenciômetro) da saída de volta pra entrada inversora. Isso se chama <b>realimentação negativa</b>, e é o que permite controlar o ganho de forma previsível.",
        "É o coração dos três projetos: o estágio de ganho do pré-amplificador, os estágios do equalizador e os buffers do compressor são todos construídos em torno de um op-amp (TL072/TL071).",
        "Fórmula que você vai usar direto: numa configuração não-inversora simples, <code>Ganho = 1 + Rf/Rg</code>, onde Rf é o resistor (ou pot) de realimentação e Rg é o resistor ligado à entrada inversora e ao terra.",
      ],
      exercises: [
        { type: "mcq", q: "Por que ligamos um resistor (ou pot) da saída do op-amp de volta pra entrada inversora?", options: ["Para desligar o circuito", "Para controlar o ganho de forma previsível (realimentação negativa)", "Para aumentar o ruído", "É só estética"], correct: 1, explain: "Sem essa realimentação, o ganho \"livre\" do op-amp é alto demais e imprevisível para uso normal." },
        { type: "calc", q: "No estágio de ganho do pré-amp, Rg = 10kΩ e o potenciômetro Rf está em 40kΩ. Qual o ganho? (Ganho = 1 + Rf/Rg)", answer: 5, tolerance: 0.2, unit: "x", explain: "Ganho = 1 + 40k/10k = 1 + 4 = 5x." },
      ],
    },
    {
      id: "ferramentas",
      num: "7",
      title: "Multímetro e solda",
      summary: "As duas habilidades manuais que você vai usar o tempo todo.",
      content: [
        "<b>Multímetro</b>: mede tensão (modo V, geralmente DCV pros nossos circuitos), resistência (modo Ω) e continuidade (modo com símbolo de \"beep\", útil pra achar curtos ou fios rompidos).",
        "Para medir tensão, as pontas tocam dois pontos do circuito ligado, em paralelo — sem cortar nada. Para medir resistência, o componente precisa estar fora do circuito (ou pelo menos sem energia).",
        "<b>Solda</b>: uma liga metálica que derrete com o calor do ferro e, ao esfriar, cria uma conexão elétrica sólida. Técnica básica: aqueça a junção (fio + trilha) por 1–2 segundos, encoste a solda na junção — não na ponta do ferro — deixe derreter e espalhar, retire a solda e depois o ferro.",
        "Uma solda boa é brilhante e em formato de cone. Uma solda fosca ou arredondada como bolinha costuma indicar \"solda fria\" — uma conexão ruim que pode falhar depois.",
        "Vale a pena praticar as duas coisas em componentes velhos antes de montar o pré-amplificador de verdade.",
      ],
      exercises: [
        { type: "mcq", q: "Para medir a tensão num ponto do circuito ligado, como você usa o multímetro?", options: ["Corta o fio e liga o multímetro no meio", "Encosta as pontas em paralelo, sem cortar nada", "Só funciona com o circuito desligado", "Não dá pra medir tensão com multímetro"], correct: 1, explain: "Medição de tensão é sempre em paralelo, com o circuito ligado." },
        { type: "mcq", q: "Como é uma solda bem feita?", options: ["Fosca e arredondada como uma bolinha", "Brilhante e em formato de cone, cobrindo bem a junção", "Não importa a aparência, só o cheiro", "Deve ficar pingando"], correct: 1, explain: "Brilho e formato de cone indicam boa fusão e boa conexão elétrica." },
      ],
    },
    {
      id: "esquemas",
      num: "8",
      title: "Como ler um esquema elétrico",
      summary: "A ponte entre o desenho e a peça na sua mão.",
      content: [
        "Um esquema não é um desenho físico — é um mapa de conexões. Componentes com o mesmo símbolo de terra (GND) em pontos diferentes do desenho estão, eletricamente, todos ligados entre si.",
        "Convenção comum: o sinal flui da esquerda para a direita — entrada à esquerda, saída à direita. A alimentação positiva geralmente fica desenhada em cima, o terra embaixo.",
        "Cada componente tem um símbolo padrão (resistor em zigue-zague, capacitor em duas placas paralelas, op-amp em triângulo, etc.) e uma referência (R1, C2, Q1...) que aparece tanto no esquema quanto na lista de materiais — é assim que você conecta o desenho às peças na mão.",
        "Na aba \"Esquema\" de cada projeto deste app já tem essa legenda e uma explicação numerada de cada trecho do circuito.",
      ],
      exercises: [
        { type: "mcq", q: "Num esquema elétrico, dois pontos com o mesmo símbolo de terra (GND) desenhados em lugares diferentes da página...", options: ["São só uma coincidência visual", "Estão eletricamente ligados entre si, mesmo longe um do outro no desenho", "Nunca devem ser ligados", "Representam polaridades opostas"], correct: 1, explain: "Todo símbolo de GND representa o mesmo nó elétrico, não importa onde apareça no desenho." },
        { type: "mcq", q: "Qual é a convenção mais comum para a direção do sinal num esquema?", options: ["De baixo para cima", "Da direita para a esquerda", "Da esquerda para a direita", "Não tem convenção"], correct: 2, explain: "Entrada à esquerda, saída à direita — como usamos em todos os esquemas deste app." },
      ],
    },
  ],
};

const ORDER = ["preamp", "eq", "comp"];

// --------------------------------------------------------------- estado ---

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {};
}

let state = loadState();

function ensureProjectState(id) {
  const p = PROJECTS[id];
  if (!state[id]) state[id] = {};
  if (!Array.isArray(state[id].materiais) || state[id].materiais.length !== p.materiais.length) {
    state[id].materiais = new Array(p.materiais.length).fill(false);
  }
  if (!Array.isArray(state[id].passos) || state[id].passos.length !== p.passos.length) {
    state[id].passos = new Array(p.passos.length).fill(false);
  }
  return state[id];
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {}
}

function progressOf(id) {
  const s = ensureProjectState(id);
  const done = s.materiais.filter(Boolean).length + s.passos.filter(Boolean).length;
  const total = s.materiais.length + s.passos.length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

function ensureFundamentosState() {
  if (!state.fundamentos) state.fundamentos = {};
  FUNDAMENTOS.modules.forEach((m) => {
    if (!Array.isArray(state.fundamentos[m.id]) || state.fundamentos[m.id].length !== m.exercises.length) {
      state.fundamentos[m.id] = new Array(m.exercises.length).fill(false);
    }
  });
  return state.fundamentos;
}

function fundamentosModuleProgress(moduleId) {
  const s = ensureFundamentosState();
  const arr = s[moduleId] || [];
  const done = arr.filter(Boolean).length;
  const total = arr.length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

function fundamentosProgress() {
  const s = ensureFundamentosState();
  let done = 0, total = 0;
  FUNDAMENTOS.modules.forEach((m) => {
    const arr = s[m.id] || [];
    done += arr.filter(Boolean).length;
    total += arr.length;
  });
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

function overallProgress() {
  let done = 0, total = 0;
  ORDER.forEach((id) => {
    const p = progressOf(id);
    done += p.done;
    total += p.total;
  });
  const f = fundamentosProgress();
  done += f.done;
  total += f.total;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

// --------------------------------------------------------------- rotas ---

let route = { view: "home", project: null, tab: "esquema" };

function parseHash() {
  const h = location.hash.replace(/^#\/?/, "");
  if (!h) return { view: "home", project: null, tab: "esquema" };
  if (h === "fundamentos" || h.startsWith("fundamentos/")) {
    const modId = h.split("/")[1] || null;
    if (modId && FUNDAMENTOS.modules.some((m) => m.id === modId)) {
      return { view: "fundamentos-module", module: modId };
    }
    return { view: "fundamentos-home" };
  }
  const parts = h.split("/");
  const project = parts[0];
  const tab = parts[1] || "esquema";
  if (PROJECTS[project]) return { view: "project", project, tab };
  return { view: "home", project: null, tab: "esquema" };
}

window.addEventListener("hashchange", () => {
  route = parseHash();
  render();
  window.scrollTo(0, 0);
});

// -------------------------------------------------------- diagramas SVG ---

function svgLegend() {
  return `<div class="legend">
    <div class="legend-item"><svg width="30" height="18"><path d="M2,9 l4,0 l3,-6 l4,12 l4,-12 l4,12 l3,-6 l4,0" fill="none" stroke="var(--ink)" stroke-width="2"/></svg><span>Resistor</span></div>
    <div class="legend-item"><svg width="30" height="18"><line x1="11" y1="1" x2="11" y2="17" stroke="var(--ink)" stroke-width="3"/><line x1="19" y1="1" x2="19" y2="17" stroke="var(--ink)" stroke-width="3"/></svg><span>Capacitor</span></div>
    <div class="legend-item"><svg width="30" height="18"><line x1="9" y1="1" x2="9" y2="17" stroke="var(--ink)" stroke-width="3"/><path d="M18,1 A8,8 0 0 1 18,17" fill="none" stroke="var(--ink)" stroke-width="3"/></svg><span>Eletrolítico (+)</span></div>
    <div class="legend-item"><svg width="30" height="18"><circle cx="15" cy="9" r="8" fill="none" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="2 3"/></svg><span>Transistor JFET</span></div>
    <div class="legend-item"><svg width="30" height="18"><path d="M3,1 L3,17 L25,9 Z" fill="none" stroke="var(--ink)" stroke-width="2"/></svg><span>Amp. operacional</span></div>
    <div class="legend-item"><svg width="30" height="18"><polygon points="5,3 5,15 19,9" fill="var(--ink)"/><line x1="19" y1="3" x2="19" y2="15" stroke="var(--ink)" stroke-width="3"/></svg><span>Diodo</span></div>
  </div>`;
}

function preampSchematic() {
  return `<div class="schematic-frame"><svg viewBox="0 0 1000 620" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Esquema do pré-amplificador">
    <g fill="none" stroke="var(--ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="40" y1="60" x2="960" y2="60"/>
      <line x1="40" y1="560" x2="960" y2="560"/>
      <line x1="75" y1="390" x2="105" y2="390" stroke-width="3"/>
      <line x1="83" y1="410" x2="97" y2="410" stroke-width="1.5"/>
      <line x1="90" y1="360" x2="90" y2="390"/>
      <line x1="90" y1="410" x2="90" y2="560"/>
      <line x1="90" y1="200" x2="90" y2="360"/>
      <polygon points="80,175 100,175 90,200" fill="var(--ink)" stroke="none"/>
      <line x1="80" y1="175" x2="100" y2="175" stroke-width="3"/>
      <line x1="90" y1="60" x2="90" y2="175"/>
      <circle cx="160" cy="320" r="10"/>
      <line x1="170" y1="320" x2="215" y2="320"/>
      <line x1="222" y1="302" x2="222" y2="338" stroke-width="3"/>
      <line x1="232" y1="302" x2="232" y2="338" stroke-width="3"/>
      <line x1="212" y1="320" x2="222" y2="320"/>
      <line x1="232" y1="320" x2="280" y2="320"/>
      <circle cx="280" cy="320" r="3.5" fill="var(--ink)"/>
      <line x1="280" y1="320" x2="280" y2="360"/>
      <path d="M280,360 l0,10 l14,6 l-14,6 l14,6 l-14,6 l14,6 l-14,6 l0,10" stroke-width="2"/>
      <line x1="280" y1="416" x2="280" y2="560"/>
      <line x1="280" y1="320" x2="335" y2="320"/>
      <circle cx="390" cy="320" r="48" stroke-width="1.5" stroke-dasharray="3 4"/>
      <line x1="335" y1="320" x2="358" y2="320"/>
      <polygon points="358,314 358,326 370,320" fill="var(--ink)" stroke="none"/>
      <line x1="370" y1="292" x2="370" y2="348" stroke-width="3"/>
      <line x1="370" y1="300" x2="390" y2="300"/>
      <line x1="390" y1="300" x2="390" y2="242"/>
      <line x1="390" y1="242" x2="390" y2="60"/>
      <line x1="370" y1="340" x2="390" y2="340"/>
      <line x1="390" y1="340" x2="390" y2="400"/>
      <line x1="390" y1="400" x2="390" y2="410"/>
      <path d="M390,410 l0,10 l14,6 l-14,6 l14,6 l-14,6 l14,6 l-14,6 l0,10" stroke-width="2"/>
      <line x1="390" y1="466" x2="390" y2="560"/>
      <line x1="390" y1="400" x2="450" y2="400"/>
      <line x1="450" y1="400" x2="450" y2="320"/>
      <line x1="450" y1="320" x2="500" y2="320"/>
      <circle cx="450" cy="400" r="3.5" fill="var(--ink)"/>
      <line x1="500" y1="320" x2="510" y2="320"/>
      <line x1="510" y1="303" x2="510" y2="337" stroke-width="3"/>
      <path d="M522,303 A18,18 0 0 1 522,337" stroke-width="3"/>
      <line x1="522" y1="320" x2="595" y2="320"/>
      <line x1="560" y1="60" x2="560" y2="118"/>
      <path d="M560,118 l0,10 l14,6 l-14,6 l14,6 l-14,6 l14,6 l-14,6 l0,10" stroke-width="2"/>
      <line x1="560" y1="174" x2="560" y2="200"/>
      <circle cx="560" cy="200" r="3.5" fill="var(--ink)"/>
      <line x1="560" y1="200" x2="560" y2="230"/>
      <path d="M560,230 l0,10 l14,6 l-14,6 l14,6 l-14,6 l14,6 l-14,6 l0,10" stroke-width="2"/>
      <line x1="560" y1="286" x2="560" y2="560"/>
      <line x1="560" y1="200" x2="620" y2="200"/>
      <line x1="620" y1="200" x2="620" y2="230"/>
      <line x1="605" y1="238" x2="635" y2="238" stroke-width="3"/>
      <path d="M605,250 A18,6 0 0 0 635,250" stroke-width="3"/>
      <line x1="620" y1="230" x2="620" y2="238"/>
      <line x1="620" y1="256" x2="620" y2="290"/>
      <line x1="605" y1="290" x2="635" y2="290"/>
      <line x1="560" y1="200" x2="600" y2="200"/>
      <line x1="600" y1="200" x2="600" y2="300"/>
      <line x1="600" y1="300" x2="610" y2="300"/>
      <circle cx="610" cy="300" r="3.5" fill="var(--ink)"/>
      <line x1="595" y1="320" x2="595" y2="300"/>
      <line x1="595" y1="300" x2="610" y2="300"/>
      <line x1="610" y1="300" x2="628" y2="300"/>
      <path d="M628,265 L628,385 L742,325 Z" stroke-width="2"/>
      <line x1="628" y1="350" x2="600" y2="350"/>
      <circle cx="600" cy="350" r="3.5" fill="var(--ink)"/>
      <line x1="600" y1="350" x2="600" y2="400"/>
      <path d="M600,400 l0,10 l14,6 l-14,6 l14,6 l-14,6 l14,6 l-14,6 l0,10" stroke-width="2"/>
      <line x1="600" y1="456" x2="600" y2="560"/>
      <line x1="742" y1="325" x2="800" y2="325"/>
      <circle cx="800" cy="325" r="3.5" fill="var(--ink)"/>
      <line x1="800" y1="325" x2="800" y2="200"/>
      <line x1="800" y1="200" x2="770" y2="200"/>
      <rect x="670" y="190" width="100" height="20" rx="3" stroke-width="2"/>
      <line x1="670" y1="200" x2="600" y2="200"/>
      <line x1="600" y1="200" x2="600" y2="350"/>
      <polygon points="712,178 726,178 719,192" fill="var(--ink)" stroke="none"/>
      <line x1="719" y1="178" x2="719" y2="160"/>
      <line x1="680" y1="60" x2="680" y2="120"/>
      <line x1="665" y1="128" x2="695" y2="128" stroke-width="3"/>
      <path d="M665,140 A18,6 0 0 0 695,140" stroke-width="3"/>
      <line x1="680" y1="120" x2="680" y2="128"/>
      <line x1="680" y1="146" x2="680" y2="560"/>
      <line x1="800" y1="325" x2="830" y2="325"/>
      <line x1="838" y1="308" x2="838" y2="342" stroke-width="3"/>
      <path d="M850,308 A18,18 0 0 1 850,342" stroke-width="3"/>
      <line x1="830" y1="325" x2="838" y2="325"/>
      <line x1="850" y1="325" x2="900" y2="325"/>
      <circle cx="915" cy="325" r="10"/>
    </g>
    <text x="45" y="50" font-family="ui-monospace,monospace" font-size="13" fill="var(--copper)">+9V</text>
    <text x="45" y="580" font-family="ui-monospace,monospace" font-size="13" fill="var(--ink-soft)">GND</text>
    <g font-family="ui-monospace,monospace" font-size="12.5" fill="var(--ink)">
      <text x="20" y="380">BAT 9V</text>
      <text x="98" y="162">D1</text>
      <text x="122" y="345" text-anchor="middle">ENTRADA</text>
      <text x="227" y="290" text-anchor="middle">C1 100nF</text>
      <text x="300" y="395" text-anchor="middle">R1</text>
      <text x="300" y="408" text-anchor="middle">1MΩ</text>
      <text x="390" y="230" text-anchor="middle">Q1 — 2N5457</text>
      <text x="422" y="440" text-anchor="middle">R2 10kΩ</text>
      <text x="516" y="290" text-anchor="middle">C2 1–10µF</text>
      <text x="592" y="105" text-anchor="middle">R3 100kΩ</text>
      <text x="592" y="270" text-anchor="middle">R4 100kΩ</text>
      <text x="620" y="275" text-anchor="middle">C3 10µF</text>
      <text x="685" y="255" text-anchor="middle">TL072</text>
      <text x="632" y="435" text-anchor="middle">R5 10kΩ</text>
      <text x="720" y="150" text-anchor="middle">P1 100kΩ</text>
      <text x="720" y="163" text-anchor="middle">GANHO</text>
      <text x="844" y="360" text-anchor="middle">C4 1–10µF</text>
      <text x="915" y="357" text-anchor="middle">SAÍDA</text>
    </g>
  </svg><p class="sch-caption">Buffer JFET (Q1) + estágio de ganho TL072</p></div>${svgLegend()}`;
}

function box(x, y, w, h, label1, label2) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const l2 = label2 ? `<text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="11" fill="var(--ink-soft)" font-family="ui-monospace,monospace">${label2}</text>` : "";
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="var(--paper)" stroke="var(--ink)" stroke-width="2"/>
    <text x="${cx}" y="${cy - (label2 ? 2 : -4)}" text-anchor="middle" font-size="12.5" fill="var(--ink)" font-family="ui-monospace,monospace" font-weight="700">${label1}</text>${l2}`;
}

function arrow(x1, y1, x2, y2, dashed) {
  const dash = dashed ? ' stroke-dasharray="5 4"' : "";
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--ink)" stroke-width="2"${dash} marker-end="url(#arrowhead)"/>`;
}

const ARROWHEAD_DEF = `<defs><marker id="arrowhead" markerWidth="9" markerHeight="8" refX="8" refY="4" orient="auto"><polygon points="0,0 9,4 0,8" fill="var(--ink)"/></marker></defs>`;

function eqSchematic() {
  return `<div class="schematic-frame"><svg viewBox="0 0 780 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Diagrama de blocos do equalizador">
    ${ARROWHEAD_DEF}
    <circle cx="30" cy="150" r="9" fill="none" stroke="var(--ink)" stroke-width="2"/>
    ${arrow(39, 150, 78, 150)}
    ${box(80, 122, 100, 56, "Buffer", "entrada")}
    ${arrow(180, 150, 210, 90)}
    ${arrow(180, 150, 210, 210)}
    ${box(210, 60, 190, 60, "Grave / Agudo", "TL072 — Baxandall")}
    ${box(210, 180, 190, 60, "Médio", "TL071 — gyrator ~1kHz")}
    ${arrow(400, 90, 460, 140)}
    ${arrow(400, 210, 460, 160)}
    ${box(460, 120, 110, 60, "Soma", "+ buffer saída")}
    ${arrow(570, 150, 620, 150)}
    ${box(622, 122, 100, 56, "Saída", "para o amp/mesa")}
    ${arrow(722, 150, 750, 150)}
    <circle cx="758" cy="150" r="9" fill="none" stroke="var(--ink)" stroke-width="2"/>
    <text x="30" y="180" text-anchor="middle" font-size="11" font-family="ui-monospace,monospace" fill="var(--ink-soft)">ENTRADA</text>
    <text x="758" y="180" text-anchor="middle" font-size="11" font-family="ui-monospace,monospace" fill="var(--ink-soft)">SAÍDA</text>
    <text x="305" y="45" text-anchor="middle" font-size="11" font-family="ui-monospace,monospace" fill="var(--copper)">pot grave / pot agudo</text>
    <text x="305" y="255" text-anchor="middle" font-size="11" font-family="ui-monospace,monospace" fill="var(--copper)">pot médio</text>
  </svg><p class="sch-caption">Diagrama de blocos — grave/agudo (Baxandall) somado ao médio (gyrator)</p></div>`;
}

function compSchematic() {
  return `<div class="schematic-frame"><svg viewBox="0 0 780 340" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Diagrama de blocos do compressor">
    ${ARROWHEAD_DEF}
    <circle cx="30" cy="170" r="9" fill="none" stroke="var(--ink)" stroke-width="2"/>
    ${arrow(39, 170, 78, 170)}
    ${box(80, 142, 100, 56, "Buffer", "entrada")}
    ${arrow(180, 170, 210, 100)}
    ${arrow(180, 170, 210, 250)}
    ${box(210, 70, 220, 60, "Célula de ganho OTA", "CA3080 — caminho de áudio")}
    ${box(210, 220, 220, 60, "Envelope Follower", "retificador + RC (ataque/release)")}
    <line x1="320" y1="220" x2="320" y2="132" stroke="var(--copper)" stroke-width="2" stroke-dasharray="5 4" marker-end="url(#arrowhead-c)"/>
    <defs><marker id="arrowhead-c" markerWidth="9" markerHeight="8" refX="8" refY="4" orient="auto"><polygon points="0,0 9,4 0,8" fill="var(--copper)"/></marker></defs>
    <text x="335" y="178" font-size="10.5" font-family="ui-monospace,monospace" fill="var(--copper)">corrente de</text>
    <text x="335" y="190" font-size="10.5" font-family="ui-monospace,monospace" fill="var(--copper)">controle de ganho</text>
    ${arrow(430, 100, 470, 100)}
    ${box(472, 72, 110, 56, "Buffer", "de saída")}
    ${arrow(582, 100, 620, 100)}
    <line x1="620" y1="100" x2="620" y2="170" stroke="var(--ink)" stroke-width="2"/>
    ${arrow(620, 170, 660, 170)}
    <circle cx="670" cy="170" r="9" fill="none" stroke="var(--ink)" stroke-width="2"/>
    <text x="30" y="200" text-anchor="middle" font-size="11" font-family="ui-monospace,monospace" fill="var(--ink-soft)">ENTRADA</text>
    <text x="670" y="200" text-anchor="middle" font-size="11" font-family="ui-monospace,monospace" fill="var(--ink-soft)">SAÍDA</text>
  </svg><p class="sch-caption">Diagrama de blocos — célula OTA controlada pelo envelope follower</p></div>`;
}

const SCHEMATICS = { preamp: preampSchematic, eq: eqSchematic, comp: compSchematic };

// -------------------------------------------------------------- render ---

function progressBar(pct) {
  return `<div class="bar"><div style="width:${pct}%"></div></div>`;
}

function difficultyTag(p) {
  return `<span class="tag d${p.difficulty}">${p.difficultyLabel}</span>`;
}

function installBanner() {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isStandalone = window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
  if (!isIOS || isStandalone) return "";
  if (localStorage.getItem(BANNER_KEY)) return "";
  return `<div class="callout tip" style="margin:0 18px 18px;" id="install-banner">
    <span class="callout-label">Instalar como app</span>
    <p>Toque em <b>Compartilhar</b> (o ícone com a seta) na barra do Safari e depois em <b>"Adicionar à Tela de Início"</b> — o app abre em tela cheia e funciona offline.
    <button data-dismiss-banner style="display:block;margin-top:8px;color:var(--teal);font-size:13px;">Entendi, dispensar</button></p>
  </div>`;
}

function renderHome() {
  const overall = overallProgress();
  const fProg = fundamentosProgress();

  const fundCard = `<a class="card card-fund" href="#/fundamentos">
      <div class="card-top">
        <p class="card-title">00 — Fundamentos de Eletrônica</p>
        <span class="tag d0">Prepare-se primeiro</span>
      </div>
      <p class="card-desc">Tensão, corrente, resistores, capacitores, transistores, op-amps, multímetro e como ler um esquema — com exercícios, antes de colocar a mão na protoboard.</p>
      <div class="card-foot">
        ${progressBar(fProg.pct)}
        <span class="card-pct">${fProg.pct}%</span>
      </div>
    </a>`;

  const cards = ORDER.map((id) => {
    const p = PROJECTS[id];
    const prog = progressOf(id);
    return `<a class="card" href="#/${id}">
      <div class="card-top">
        <p class="card-title">${p.num} — ${p.title}</p>
        ${difficultyTag(p)}
      </div>
      <p class="card-desc">${p.desc}</p>
      <div class="card-foot">
        ${progressBar(prog.pct)}
        <span class="card-pct">${prog.pct}%</span>
      </div>
    </a>`;
  }).join("");

  return `
    <div class="topbar"><h1>Oficina de Áudio</h1></div>
    <div class="home-header">
      <p class="eyebrow">Guia de montagem — offline</p>
      <p class="home-dek">Aprenda o básico, depois monte um pré-amplificador, equalizador e compressor: esquema, lista de materiais e checklist de montagem para cada um.</p>
    </div>
    ${installBanner()}
    <div class="overall">
      <div class="overall-row">
        <span class="overall-label">Progresso geral</span>
        <span class="overall-pct">${overall.pct}%</span>
      </div>
      ${progressBar(overall.pct)}
    </div>
    <div class="section-label">Aprenda</div>
    <div class="cards">${fundCard}</div>
    <div class="section-label">Monte</div>
    <div class="cards">${cards}</div>
    <div class="bottom-space"></div>
  `;
}

// ---------------------------------------------------- fundamentos: views ---

function renderFundamentosHome() {
  const overall = fundamentosProgress();
  const cards = FUNDAMENTOS.modules.map((m) => {
    const prog = fundamentosModuleProgress(m.id);
    return `<a class="card" href="#/fundamentos/${m.id}">
      <div class="card-top">
        <p class="card-title">${m.num} — ${m.title}</p>
      </div>
      <p class="card-desc">${m.summary}</p>
      <div class="card-foot">
        ${progressBar(prog.pct)}
        <span class="card-pct">${prog.done}/${prog.total}</span>
      </div>
    </a>`;
  }).join("");

  return `
    <div class="topbar">
      <button class="back-btn" data-go-home aria-label="Voltar">&larr;</button>
      <h1>Fundamentos de Eletrônica</h1>
    </div>
    <div class="project-hero">
      <p class="card-pct" style="text-align:left;">${overall.done}/${overall.total} exercícios corretos — ${overall.pct}%</p>
      ${progressBar(overall.pct)}
      <p class="muted" style="margin-top:12px;">8 aulas curtas com exercícios. Não precisa decorar nada — a ideia é reconhecer o vocabulário antes de montar o pré-amplificador. Pode fazer em qualquer ordem.</p>
    </div>
    <div class="cards" style="padding-top:4px;">${cards}</div>
    <div class="bottom-space"></div>
  `;
}

function exerciseHTML(moduleId, ex, idx, doneState) {
  const done = !!doneState[idx];
  if (ex.type === "mcq") {
    const options = ex.options.map((opt, oi) =>
      `<button class="mcq-opt" data-ex="${idx}" data-opt="${oi}" data-module="${moduleId}">${opt}</button>`
    ).join("");
    return `<div class="exercise ${done ? "solved" : ""}" data-exercise="${idx}">
      <p class="ex-q"><span class="ex-badge">${done ? "✓" : idx + 1}</span>${ex.q}</p>
      <div class="mcq-options">${options}</div>
      <div class="ex-feedback" hidden></div>
    </div>`;
  }
  // calc
  return `<div class="exercise calc ${done ? "solved" : ""}" data-exercise="${idx}">
    <p class="ex-q"><span class="ex-badge">${done ? "✓" : idx + 1}</span>${ex.q}</p>
    <div class="calc-row">
      <input type="number" inputmode="decimal" class="calc-input" data-ex="${idx}" data-module="${moduleId}" placeholder="0" />
      <span class="calc-unit">${ex.unit}</span>
      <button class="calc-check" data-ex="${idx}" data-module="${moduleId}">Conferir</button>
    </div>
    <div class="ex-feedback" hidden></div>
  </div>`;
}

function renderFundamentosModule(moduleId) {
  const m = FUNDAMENTOS.modules.find((mm) => mm.id === moduleId);
  const s = ensureFundamentosState()[moduleId];
  const prog = fundamentosModuleProgress(moduleId);

  const idx = FUNDAMENTOS.modules.indexOf(m);
  const prevM = FUNDAMENTOS.modules[idx - 1];
  const nextM = FUNDAMENTOS.modules[idx + 1];
  let nav = `<div style="display:flex;gap:10px;padding:18px 18px 4px;">`;
  nav += prevM ? `<a href="#/fundamentos/${prevM.id}" style="flex:1;text-align:center;padding:12px;border:1px solid var(--rule);border-radius:8px;font-size:13px;color:var(--ink-soft);">&larr; ${prevM.title}</a>` : `<a href="#/fundamentos" style="flex:1;text-align:center;padding:12px;border:1px solid var(--rule);border-radius:8px;font-size:13px;color:var(--ink-soft);">&larr; Todas as aulas</a>`;
  nav += nextM ? `<a href="#/fundamentos/${nextM.id}" style="flex:1;text-align:center;padding:12px;border:1px solid var(--rule);border-radius:8px;font-size:13px;color:var(--teal);">${nextM.title} &rarr;</a>` : `<a href="#/" style="flex:1;text-align:center;padding:12px;border:1px solid var(--rule);border-radius:8px;font-size:13px;color:var(--copper);">Ir para os projetos &rarr;</a>`;
  nav += `</div>`;

  return `
    <div class="topbar">
      <button class="back-btn" data-go="fundamentos" aria-label="Voltar">&larr;</button>
      <h1>${m.title}</h1>
    </div>
    <div class="project-hero">
      <p class="card-pct" style="text-align:left;">${prog.done}/${prog.total} exercícios corretos — ${prog.pct}%</p>
      ${progressBar(prog.pct)}
    </div>
    <div class="panel">
      ${m.content.map((p) => `<p>${p}</p>`).join("")}
      <h2 style="margin-top:26px;">Exercícios</h2>
      ${m.exercises.map((ex, i) => exerciseHTML(moduleId, ex, i, s)).join("")}
    </div>
    ${nav}
    <div class="bottom-space"></div>
  `;
}

function renderMateriais(p, s) {
  const items = p.materiais.map((m, i) => {
    const done = !!s.materiais[i];
    return `<li class="${done ? "done" : ""}" data-kind="materiais" data-idx="${i}">
      <div class="check-box">${CHECK_ICON}</div>
      <div class="item-text">${m.qty}× ${m.part}
        <span class="item-meta"><span class="item-value">${m.value}</span> — ${m.role}</span>
      </div>
    </li>`;
  }).join("");
  return `<ul class="checklist">${items}</ul>`;
}

function renderPassos(p, s) {
  const items = p.passos.map((step, i) => {
    const done = !!s.passos[i];
    return `<li class="${done ? "done" : ""}" data-kind="passos" data-idx="${i}">
      <div class="check-box">${CHECK_ICON}</div>
      <div class="item-text">${step}</div>
    </li>`;
  }).join("");
  return `<ul class="checklist">${items}</ul>`;
}

function renderProblemas(p) {
  const rows = p.problemas.map((row) => `<tr><td>${row.symptom}</td><td>${row.cause}</td></tr>`).join("");
  return `<div class="table-wrap"><table>
    <thead><tr><th>Sintoma</th><th>Causa provável</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function renderEsquema(p) {
  const diagram = SCHEMATICS[p.id]();
  let extra = "";
  if (p.walkthrough) {
    extra = `<h2>Como ler o esquema</h2><ol class="checklist" style="list-style:decimal;padding-left:20px;">
      ${p.walkthrough.map((w) => `<li style="display:list-item;border:none;padding:6px 0;font-size:14.5px;">${w}</li>`).join("")}
    </ol>`;
  }
  if (p.howItWorks) {
    extra = `<h2>Como funciona</h2><ol class="checklist" style="list-style:decimal;padding-left:20px;">
      ${p.howItWorks.map((w) => `<li style="display:list-item;border:none;padding:6px 0;font-size:14.5px;">${w}</li>`).join("")}
    </ol>`;
  }
  return `<p>${p.intro}</p>${diagram}${extra}`;
}

function renderProject(id, tab) {
  const p = PROJECTS[id];
  const s = ensureProjectState(id);
  const prog = progressOf(id);

  const tabs = [
    ["esquema", "Esquema"],
    ["materiais", "Materiais"],
    ["passos", "Passo a Passo"],
    ["problemas", "Problemas"],
  ];
  const tabbar = tabs.map(([key, label]) =>
    `<button data-tab="${key}" class="${tab === key ? "active" : ""}">${label}</button>`
  ).join("");

  let content = "";
  if (tab === "esquema") content = renderEsquema(p);
  else if (tab === "materiais") content = renderMateriais(p, s);
  else if (tab === "passos") content = renderPassos(p, s);
  else if (tab === "problemas") content = renderProblemas(p);

  const idx = ORDER.indexOf(id);
  const prevId = ORDER[idx - 1];
  const nextId = ORDER[idx + 1];
  let nav = `<div style="display:flex;gap:10px;padding:8px 18px 4px;">`;
  nav += prevId ? `<a href="#/${prevId}" style="flex:1;text-align:center;padding:12px;border:1px solid var(--rule);border-radius:8px;font-size:13px;color:var(--ink-soft);">&larr; ${PROJECTS[prevId].title}</a>` : `<span style="flex:1;"></span>`;
  nav += nextId ? `<a href="#/${nextId}" style="flex:1;text-align:center;padding:12px;border:1px solid var(--rule);border-radius:8px;font-size:13px;color:var(--copper);">${PROJECTS[nextId].title} &rarr;</a>` : `<span style="flex:1;"></span>`;
  nav += `</div>`;

  return `
    <div class="topbar">
      <button class="back-btn" data-go-home aria-label="Voltar">&larr;</button>
      <h1>${p.title}</h1>
    </div>
    <div class="project-hero">
      <p class="card-pct" style="text-align:left;">${prog.done}/${prog.total} concluídos — ${prog.pct}%</p>
      ${progressBar(prog.pct)}
    </div>
    <div class="tabbar">${tabbar}</div>
    <div class="panel">${content}</div>
    ${tab === "passos" || tab === "esquema" ? nav : ""}
    <div class="bottom-space"></div>
  `;
}

function render() {
  const app = document.getElementById("app");
  if (route.view === "fundamentos-home") {
    app.innerHTML = renderFundamentosHome();
  } else if (route.view === "fundamentos-module") {
    app.innerHTML = renderFundamentosModule(route.module);
  } else if (route.view === "project") {
    app.innerHTML = renderProject(route.project, route.tab);
  } else {
    app.innerHTML = renderHome();
  }
}

// --------------------------------------------------------------- eventos ---

function markExerciseSolved(moduleId, exIdx) {
  const s = ensureFundamentosState();
  if (!s[moduleId][exIdx]) {
    s[moduleId][exIdx] = true;
    saveState();
  }
}

function showFeedback(exerciseEl, correct, explain) {
  const fb = exerciseEl.querySelector(".ex-feedback");
  fb.hidden = false;
  fb.className = "ex-feedback " + (correct ? "correct" : "wrong");
  fb.innerHTML = (correct ? "Certo. " : "Não é bem isso. ") + explain;
}

document.addEventListener("click", (e) => {
  const dismiss = e.target.closest("[data-dismiss-banner]");
  if (dismiss) {
    localStorage.setItem(BANNER_KEY, "1");
    document.getElementById("install-banner")?.remove();
    return;
  }

  const goHome = e.target.closest("[data-go-home]");
  if (goHome) {
    location.hash = "#/";
    return;
  }

  const goTo = e.target.closest("[data-go]");
  if (goTo) {
    location.hash = `#/${goTo.dataset.go}`;
    return;
  }

  const tabBtn = e.target.closest(".tabbar button");
  if (tabBtn) {
    route.tab = tabBtn.dataset.tab;
    location.hash = `#/${route.project}/${route.tab}`;
    return;
  }

  const li = e.target.closest(".checklist li[data-kind]");
  if (li) {
    const kind = li.dataset.kind;
    const idx = parseInt(li.dataset.idx, 10);
    const s = ensureProjectState(route.project);
    s[kind][idx] = !s[kind][idx];
    saveState();
    render();
    return;
  }

  const mcqOpt = e.target.closest(".mcq-opt");
  if (mcqOpt) {
    const moduleId = mcqOpt.dataset.module;
    const exIdx = parseInt(mcqOpt.dataset.ex, 10);
    const optIdx = parseInt(mcqOpt.dataset.opt, 10);
    const m = FUNDAMENTOS.modules.find((mm) => mm.id === moduleId);
    const ex = m.exercises[exIdx];
    const exerciseEl = mcqOpt.closest(".exercise");
    const correct = optIdx === ex.correct;

    exerciseEl.querySelectorAll(".mcq-opt").forEach((btn) => {
      btn.disabled = true;
      const bi = parseInt(btn.dataset.opt, 10);
      if (bi === ex.correct) btn.classList.add("correct");
      else if (bi === optIdx) btn.classList.add("wrong");
    });
    showFeedback(exerciseEl, correct, ex.explain);
    if (correct) {
      markExerciseSolved(moduleId, exIdx);
      exerciseEl.classList.add("solved");
      exerciseEl.querySelector(".ex-badge").textContent = "✓";
    }
    return;
  }

  const calcCheck = e.target.closest(".calc-check");
  if (calcCheck) {
    const moduleId = calcCheck.dataset.module;
    const exIdx = parseInt(calcCheck.dataset.ex, 10);
    const m = FUNDAMENTOS.modules.find((mm) => mm.id === moduleId);
    const ex = m.exercises[exIdx];
    const exerciseEl = calcCheck.closest(".exercise");
    const input = exerciseEl.querySelector(".calc-input");
    const val = parseFloat((input.value || "").replace(",", "."));
    const correct = !isNaN(val) && Math.abs(val - ex.answer) <= ex.tolerance;

    showFeedback(exerciseEl, correct, ex.explain);
    if (correct) {
      markExerciseSolved(moduleId, exIdx);
      exerciseEl.classList.add("solved");
      exerciseEl.querySelector(".ex-badge").textContent = "✓";
      input.disabled = true;
      calcCheck.disabled = true;
    }
    return;
  }
});

// --------------------------------------------------------- inicialização ---

route = parseHash();
render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw-oficina.js").catch(() => {});
  });
}
