/* Cycles Visual — a experiência 3D (WebGL com three.js r128, embutido em js/vendor).

   Uma história em atos, contada por uma escultura no centro da cena:
     0 Gênese     — no escuro, a forma pequena e quieta, quase sem estrelas
     1 Despertar  — ela cresce, as estrelas aparecem, a câmera começa a girar
     2 Terra      — o chão surge; câmera rasante, olhando de baixo
     3 Travessia  — túnel: cada kick é um círculo que vem na sua direção
     4 Tempestade — o clímax: câmera rápida, cor quente, estilhaços
     5 Dissolução — vista de cima, a forma se desfaz em lente, tudo esfria
   Cada ato tem cor, câmera e formas próprias; as trocas escorregam (~3 s).
   Os instrumentos têm papéis fixos, em qualquer ato:
     kick   → sempre um CÍRCULO de luz em volta da forma (no túnel, vindo até você)
     snare  → distorção da imagem: uma onda circular que atravessa a tela e separa as cores
     clap   → outra distorção: rasgos horizontais em 2–3 estalos rápidos (como o clap)
     baixo  → o chão ondula e a forma deforma por dentro
     hi-hat → as estrelas piscam · lead → fita de luz na altura da nota
     chord  → a cor do ato varia e entra um anel gigante · voz → halos que sobem
     acento → a imagem acende · drop → estilhaços e a câmera gira
   Interface: init(canvas) · setAct(i) · hit(ev) · frame(dt, mode, motion) · resize(w,h) · setTexture(canvas) · capture() · clear() */
(function () {
  "use strict";
  let T = null; // THREE
  let renderer, scene, camera, fadeScene, fadeCam, fadeMat;
  let blob, blobWire, blobMat, wireMat, floor, floorMat, stars, starMat;
  let shards, shardData = [], rings = [], tori = [], ribbon, ribbonPts, ribbonMat;
  let circles = [], glowSprite, postScene, postMat;
  let tex = null, ready = false, time = 0, rt = null, blitScene, blitMat, scale3 = 1;
  const env = { kickT: 0, kick: 0, bass: 0, hat: 0, voice: 0, roll: 0, rollV: 0, ripple: 99, rippleA: 0, acc: 0,
    snare: 0, snareR: 9, clap: 0, clapSeed: 0, clapTaps: [] };
  const lead = { y: 0, ty: 0, a: 0, ang: 0 };
  const col = { cur: null, target: null };
  let orbit = Math.PI / 2;

  // ---- forma: troca natural (5 s, curva suave), uma de cada vez ----
  const SHAPE_NAMES = ["esfera", "cubo", "toro", "flor", "rocha", "lente"];
  const shape = { a: 0, b: 0, m: 1, dur: 5 };
  let shapeBag = [];
  let pendingShape = null;
  function nextShape(id) {
    if (id == null && chapter.shapes) {
      // dentro do ato, alterna entre as formas dele
      const list = chapter.shapes;
      id = list[(list.indexOf(shape.b) + 1) % list.length];
    }
    if (shape.m < 1) { if (id != null) pendingShape = id; return; } // ainda transformando: a próxima espera
    let n = id;
    if (n == null) {
      if (!shapeBag.length) {
        shapeBag = SHAPE_NAMES.map((_, i) => i).filter((i) => i !== shape.b);
        for (let i = shapeBag.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [shapeBag[i], shapeBag[j]] = [shapeBag[j], shapeBag[i]]; }
      }
      n = shapeBag.shift();
    }
    if (n === shape.b) return;
    shape.a = shape.b; shape.b = n; shape.m = 0;
    return SHAPE_NAMES[n];
  }

  // ---- atos da história ----
  // h/dist/speed/lock: câmera · floor/stars: cenário · scale: tamanho da forma
  // hue/sat/lit: cor do ato · shapes: formas do ato (alternam) · tunnel/shards: extras
  const ACTS = [
    { name: "Gênese", h: 0.2, dist: 5.4, speed: 0, lock: Math.PI / 2, floor: 0, stars: 0.12, look: 0, scale: 0.55, hue: 0.62, sat: 0.55, lit: 0.42, shapes: [0, 5] },
    { name: "Despertar", h: 0.9, dist: 6.2, speed: 0.5, floor: 0, stars: 0.6, look: 0, scale: 0.8, hue: 0.77, sat: 0.65, lit: 0.5, shapes: [0, 3] },
    { name: "Terra", h: -1.3, dist: 5.8, speed: 0.6, floor: 1, stars: 0.8, look: 0.6, scale: 1, hue: 0.08, sat: 0.75, lit: 0.5, shapes: [1, 3] },
    { name: "Travessia", h: 0.1, dist: 6.8, speed: 0, lock: Math.PI / 2, floor: 0.2, stars: 0.7, look: 0, scale: 1, hue: 0.52, sat: 0.7, lit: 0.5, shapes: [2, 0], tunnel: true },
    { name: "Tempestade", h: 2.6, dist: 8.4, speed: 2.4, floor: 1, stars: 1, look: 0, scale: 1.12, hue: 0.98, sat: 0.85, lit: 0.52, shapes: [4, 1], shards: 1 },
    { name: "Dissolução", h: 7.0, dist: 4.6, speed: 0.4, floor: 0.5, stars: 0.35, look: 0, scale: 0.75, hue: 0.68, sat: 0.35, lit: 0.6, shapes: [5, 0] },
  ];
  let chapter = ACTS[0], actIdx = 0;
  const cam = { h: 0.2, dist: 5.4, speed: 0, floor: 0, stars: 0.12, look: 0, scale: 0.55 };
  function setAct(i) {
    actIdx = ((i % ACTS.length) + ACTS.length) % ACTS.length;
    chapter = ACTS[actIdx];
    if (col.target) col.target.setHSL(chapter.hue, chapter.sat, chapter.lit);
    nextShape(chapter.shapes[0]);
    return chapter.name;
  }

  const NOISE = `
  vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
    vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
    i=mod289(i);
    vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
    float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
    vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
    vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
    vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
    return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }`;

  // formas da escultura (a partir da direção de cada ponto da esfera); o shader
  // calcula a forma atual e a próxima e mistura as duas (uM) — a troca é contínua
  const SHAPES = `
  vec3 shapePos(float id, vec3 n){
    float th = atan(n.z, n.x); float ph = acos(clamp(n.y, -1.0, 1.0));
    if (id < 0.5) return n;                                                     // esfera
    if (id < 1.5) { vec3 a = abs(n); float d = pow(pow(a.x,6.0)+pow(a.y,6.0)+pow(a.z,6.0), 1.0/6.0); return n/d*0.8; } // cubo arredondado
    if (id < 2.5) { float t = 2.0*ph; return vec3((0.82 + 0.36*cos(t))*cos(th), 0.36*sin(t), (0.82 + 0.36*cos(t))*sin(th)); } // toro
    if (id < 3.5) return n*(0.92 + 0.3*sin(5.0*th)*sin(ph));                      // flor
    if (id < 4.5) { float s = snoise(n*2.3 + 7.0); return n*(0.82 + 0.5*pow(max(s, 0.0), 1.6)); } // rocha com espinhos
    return vec3(n.x*1.18, n.y*0.36, n.z*1.18);                                    // lente
  }`;
  const BLOB_VS = NOISE + SHAPES + `
  uniform float uTime, uKick, uBass, uScale, uA, uB, uM;
  varying vec3 vN; varying vec3 vObjN; varying vec3 vView; varying float vD;
  void main(){
    vec3 dir = normalize(position);
    vec3 p = mix(shapePos(uA, dir), shapePos(uB, dir), uM) * 1.55;
    float n = snoise(p*0.9 + vec3(0.0, uTime*0.35, 0.0));
    float n2 = snoise(p*2.6 - vec3(uTime*0.6));
    float d = n*(0.18 + uBass*0.7) + n2*0.07*(1.0 + uKick*3.0) + uKick*0.45;
    vec3 np = p*uScale + normal*d;
    vD = d; vObjN = normal; vN = normalize(normalMatrix*normal);
    vec4 mv = modelViewMatrix*vec4(np,1.0); vView = -mv.xyz;
    gl_Position = projectionMatrix*mv;
  }`;
  const BLOB_FS = `
  uniform sampler2D uTex; uniform float uHasTex, uKick, uTime; uniform vec3 uColor;
  varying vec3 vN; varying vec3 vObjN; varying vec3 vView; varying float vD;
  void main(){
    vec3 n = normalize(vObjN);
    vec2 uv = vec2(atan(n.z, n.x)/6.28318 + 0.5 + uTime*0.015, n.y*0.5 + 0.5);
    vec3 tex = texture2D(uTex, uv).rgb;
    vec3 base = mix(uColor*0.6, tex, uHasTex);
    float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 3.0);
    float shade = 0.45 + 0.75*smoothstep(-0.3, 0.45, vD);
    vec3 c = base*shade*1.15 + uColor*fres*0.9 + vec3(1.0)*uKick*0.18;
    gl_FragColor = vec4(c, 1.0);
  }`;
  const WIRE_FS = `
  uniform vec3 uColor; uniform float uKick;
  varying vec3 vN; varying vec3 vObjN; varying vec3 vView; varying float vD;
  void main(){
    float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 1.5);
    gl_FragColor = vec4(uColor*(0.05 + fres*0.6) * (0.35 + uKick*1.2), 1.0);
  }`;
  const FLOOR_VS = `
  uniform float uTime, uBass, uRip, uRipA;
  varying float vFade; varying float vH;
  void main(){
    vec3 p = position;
    float r = length(p.xy);
    float h = sin(r*1.3 - uTime*2.2)*uBass*0.55 + sin(p.x*0.6 + uTime*0.7)*0.08;
    h += exp(-pow((r - uRip)*1.6, 2.0))*uRipA*1.1;
    p.z += h; vH = h;
    vFade = 1.0 - smoothstep(6.0, 19.0, r);
    gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.0);
  }`;
  const FLOOR_FS = `
  uniform vec3 uColor;
  varying float vFade; varying float vH;
  uniform float uFloorA;
  void main(){ gl_FragColor = vec4(uColor*clamp(0.28 + vH*0.9, 0.0, 1.1)*vFade*uFloorA, 1.0); }`;

  const POST_FS = `
  uniform sampler2D uTex; uniform vec2 uRes;
  uniform float uSnare, uSnareR, uClap, uSeed, uAcc;
  varying vec2 vUv;
  float h1(float n){ return fract(sin(n*91.345)*47453.5453); }
  void main(){
    vec2 uv = vUv;
    float asp = uRes.x/uRes.y;
    vec2 c = uv - 0.5; c.x *= asp;
    float r = length(c);
    vec2 dir = c/(r + 1e-4); dir.x /= asp;
    // SNARE: anel de choque que corre do centro pra fora, empurrando a imagem
    float band = exp(-pow((r - uSnareR)*5.5, 2.0));
    uv += dir*band*0.11*uSnare;                       // a imagem é empurrada na passagem da onda
    uv += dir*0.018*uSnare*(1.0 - smoothstep(0.0, 0.9, r)); // e o miolo "estufa" um pouco
    float ca = (0.006 + 0.03*band)*uSnare;             // cores se separam na frente da onda
    // CLAP: faixas horizontais rasgadas pros lados (sorteadas a cada estalo)
    float rows = 14.0 + floor(h1(uSeed)*26.0);
    float row = floor(uv.y*rows);
    float pick = step(0.5, h1(row + uSeed*13.17));
    uv.x += (h1(row*7.31 + uSeed) - 0.5)*0.22*uClap*pick;
    vec3 col;
    col.r = texture2D(uTex, uv + dir*ca + vec2(0.012*uClap*pick, 0.0)).r;
    col.g = texture2D(uTex, uv).g;
    col.b = texture2D(uTex, uv - dir*ca - vec2(0.012*uClap*pick, 0.0)).b;
    // algumas faixas do clap invertem a cor
    float inv = uClap*pick*step(0.72, h1(row*3.7 + uSeed*5.1));
    col = mix(col, vec3(1.0) - col, inv*0.85);
    // a crista da onda do snare brilha de leve
    col += vec3(band*0.25*uSnare);
    // ACENTO: a imagem acende
    col *= 1.0 + uAcc*0.7;
    gl_FragColor = vec4(col, 1.0);
  }`;

  function hsl(c) { return new T.Color().setHSL(((c.h % 360) + 360) % 360 / 360, Math.min(1, c.s / 100), Math.min(0.8, Math.max(0.25, c.l / 100))); }

  function init(canvas) {
    T = window.THREE;
    if (!T) throw new Error("three.js não carregou");
    // sem preserveDrawingBuffer (caro no celular): o rastro usa uma textura que persiste
    renderer = new T.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: false, alpha: false, powerPreference: "high-performance" });
    renderer.setClearColor(0x000000, 1);
    renderer.autoClear = false;
    scene = new T.Scene();
    scene.fog = new T.FogExp2(0x000000, 0.045);
    camera = new T.PerspectiveCamera(58, 16 / 9, 0.1, 200);

    // véu preto pra rastro/pintura (em vez de limpar a tela toda)
    fadeScene = new T.Scene();
    fadeCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    fadeMat = new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 1, depthTest: false, depthWrite: false });
    fadeScene.add(new T.Mesh(new T.PlaneGeometry(2, 2), fadeMat));
    blitScene = new T.Scene();
    blitMat = new T.MeshBasicMaterial({ map: null, depthTest: false, depthWrite: false });
    blitScene.add(new T.Mesh(new T.PlaneGeometry(2, 2), blitMat));

    col.cur = new T.Color(0.55, 0.3, 1); col.target = col.cur.clone();
    const blank = new T.DataTexture(new Uint8Array([60, 30, 120, 255]), 1, 1, T.RGBAFormat); blank.needsUpdate = true;
    const uni = {
      uTime: { value: 0 }, uKick: { value: 0 }, uBass: { value: 0 }, uScale: { value: 1 },
      uA: { value: 0 }, uB: { value: 0 }, uM: { value: 0 },
      uTex: { value: blank }, uHasTex: { value: 0 }, uColor: { value: col.cur },
    };
    blobMat = new T.ShaderMaterial({ uniforms: uni, vertexShader: BLOB_VS, fragmentShader: BLOB_FS });
    const geo = new T.IcosahedronGeometry(1.55, 4); // 4 já é liso; 5 quadruplicava o custo
    blob = new T.Mesh(geo, blobMat);
    scene.add(blob);
    wireMat = new T.ShaderMaterial({ uniforms: { ...uni, uScale: { value: 1.12 } }, vertexShader: BLOB_VS, fragmentShader: WIRE_FS,
      wireframe: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false });
    blobWire = new T.Mesh(new T.IcosahedronGeometry(1.55, 2), wireMat);
    scene.add(blobWire);

    floorMat = new T.ShaderMaterial({
      uniforms: { uTime: uni.uTime, uBass: uni.uBass, uRip: { value: 99 }, uRipA: { value: 0 }, uColor: { value: col.cur }, uFloorA: { value: 1 } },
      vertexShader: FLOOR_VS, fragmentShader: FLOOR_FS, transparent: true, blending: T.AdditiveBlending, depthWrite: false,
    });
    // grade só de linhas retas (sem as diagonais da malha em arame): ~6× menos linhas e mais limpa
    const L = 36, NL = 37, SEG = 60, gp = [];
    for (let i = 0; i < NL; i++) {
      const c = -L / 2 + (i * L) / (NL - 1);
      for (let j = 0; j < SEG; j++) {
        const a0 = -L / 2 + (j * L) / SEG, a1 = -L / 2 + ((j + 1) * L) / SEG;
        gp.push(c, a0, 0, c, a1, 0, a0, c, 0, a1, c, 0);
      }
    }
    const fg = new T.BufferGeometry();
    fg.setAttribute("position", new T.Float32BufferAttribute(gp, 3));
    floor = new T.LineSegments(fg, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.3;
    scene.add(floor);

    const N = 1400, sp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 14 + Math.random() * 26, a = Math.random() * Math.PI * 2, e = Math.acos(2 * Math.random() - 1);
      sp[i * 3] = r * Math.sin(e) * Math.cos(a); sp[i * 3 + 1] = r * Math.cos(e) * 0.6 + 4; sp[i * 3 + 2] = r * Math.sin(e) * Math.sin(a);
    }
    const sg = new T.BufferGeometry(); sg.setAttribute("position", new T.BufferAttribute(sp, 3));
    starMat = new T.PointsMaterial({ size: 0.09, color: 0xffffff, transparent: true, opacity: 0.5, blending: T.AdditiveBlending, depthWrite: false });
    stars = new T.Points(sg, starMat);
    scene.add(stars);

    // estilhaços (snare): um InstancedMesh só, reaproveitado
    const SH = 260;
    shards = new T.InstancedMesh(new T.TetrahedronGeometry(0.16), new T.MeshBasicMaterial({ color: 0xffffff }), SH);
    shards.instanceMatrix.setUsage(T.DynamicDrawUsage);
    const dummy = new T.Object3D(); dummy.scale.set(0, 0, 0); dummy.updateMatrix();
    for (let i = 0; i < SH; i++) { shards.setMatrixAt(i, dummy.matrix); shards.setColorAt(i, new T.Color(1, 1, 1)); shardData.push({ life: 0 }); }
    scene.add(shards);

    // anéis (onda de choque do kick no chão, halos da voz)
    for (let i = 0; i < 18; i++) {
      const m = new T.Mesh(new T.RingGeometry(0.97, 1, 128), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }));
      m.visible = false; scene.add(m); rings.push({ m, life: 0, age: 0 });
    }
    // anéis gigantes dos acordes
    for (let i = 0; i < 4; i++) {
      const m = new T.Mesh(new T.TorusGeometry(3.4, 0.018, 6, 160), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
      m.visible = false; scene.add(m); tori.push({ m, life: 0, age: 0, sx: 0, sy: 0 });
    }
    // círculos do kick (anel + um halo macio atrás da forma)
    for (let i = 0; i < 8; i++) {
      const m = new T.Mesh(new T.RingGeometry(0.965, 1, 160), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false, fog: false }));
      m.visible = false; scene.add(m); circles.push({ m, life: 0, age: 0 });
    }
    const gc = document.createElement("canvas"); gc.width = gc.height = 128;
    const gx = gc.getContext("2d"), gg = gx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gg.addColorStop(0, "rgba(255,255,255,0.9)"); gg.addColorStop(0.35, "rgba(255,255,255,0.35)"); gg.addColorStop(1, "rgba(255,255,255,0)");
    gx.fillStyle = gg; gx.fillRect(0, 0, 128, 128);
    glowSprite = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(gc), transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, fog: false }));
    scene.add(glowSprite);

    // passe final: lê a cena pronta e aplica as distorções (snare, clap, acento)
    postMat = new T.ShaderMaterial({
      uniforms: { uTex: { value: null }, uRes: { value: new T.Vector2(16, 9) }, uSnare: { value: 0 }, uSnareR: { value: 9 },
        uClap: { value: 0 }, uSeed: { value: 0 }, uAcc: { value: 0 } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: POST_FS, depthTest: false, depthWrite: false,
    });
    postScene = new T.Scene();
    postScene.add(new T.Mesh(new T.PlaneGeometry(2, 2), postMat));

    // fita do lead
    ribbonPts = new Float32Array(180 * 3);
    const rg = new T.BufferGeometry(); rg.setAttribute("position", new T.BufferAttribute(ribbonPts, 3));
    ribbonMat = new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false });
    ribbon = new T.Line(rg, ribbonMat);
    scene.add(ribbon);
    // a esfera (escultura) saiu: no centro fica só o círculo 2D do kick
    blob.visible = false; blobWire.visible = false; glowSprite.visible = false;
    ready = true;
  }

  // resolução interna limitada (~1,2 milhão de pixels, ≈ 1460×820): no projetor
  // não se nota e o celular agradece; a tela estica com CSS
  function resize(w, h) {
    if (!ready) return;
    scale3 = Math.min(1, Math.sqrt(1.2e6 / (w * h)));
    const rw = Math.max(2, Math.round(w * scale3)), rh = Math.max(2, Math.round(h * scale3));
    renderer.setPixelRatio(1);
    renderer.setSize(rw, rh, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (rt) rt.dispose();
    rt = new T.WebGLRenderTarget(rw, rh, { depthBuffer: true });
    blitMat.map = rt.texture; blitMat.needsUpdate = true;
    postMat.uniforms.uTex.value = rt.texture;
    postMat.uniforms.uRes.value.set(rw, rh);
  }

  function setTexture(canvas) {
    if (!ready) return;
    if (tex) tex.dispose();
    if (!canvas) { blobMat.uniforms.uHasTex.value = 0; return; }
    tex = new T.CanvasTexture(canvas);
    tex.wrapS = T.RepeatWrapping;
    blobMat.uniforms.uTex.value = tex;
    blobMat.uniforms.uHasTex.value = 1;
  }

  function ring(pos, rot, size, speed, life, color, op, vel = null) {
    const r = rings.find((x) => x.life <= 0) || rings[0];
    r.vel = vel;
    r.m.position.copy(pos); r.m.rotation.set(rot.x, rot.y, rot.z);
    r.size = size; r.speed = speed; r.life = life; r.age = 0; r.op = op;
    r.m.material.color.copy(color); r.m.visible = true;
  }

  // círculo do kick: anel de luz virado pra câmera, que nasce na borda da forma e abre
  function kickCircle(v, c) {
    const k = circles.find((x) => x.life <= 0) || circles[0];
    const r0 = 1.75 * cam.scale;
    k.r0 = r0; k.r1 = r0 + (1.2 + 1.8 * v) * (0.6 + 0.4 * cam.scale); k.age = 0; k.life = k.max = 0.55 + 0.25 * v;
    k.op = 0.6 + 0.4 * v; k.m.material.color.copy(c).lerp(new T.Color(1, 1, 1), 0.35); k.m.visible = true;
  }
  function burstShards(n, c, v) {
    let made = 0;
    for (let i = 0; i < shardData.length && made < n; i++) {
      const d = shardData[i];
      if (d.life > 0) continue;
      made++;
      const dir = new T.Vector3(Math.random() - 0.5, Math.random() * 0.9 - 0.2, Math.random() - 0.5).normalize();
      d.pos = dir.clone().multiplyScalar(1.7 * cam.scale); d.vel = dir.multiplyScalar(3 + Math.random() * 5 * (0.5 + v));
      d.rot = new T.Euler(Math.random() * 6, Math.random() * 6, 0); d.spin = new T.Vector3(Math.random() * 8, Math.random() * 8, 0);
      d.life = 0.9 + Math.random() * 0.8; d.max = d.life; d.s = 0.6 + Math.random() * 1.4;
      shards.setColorAt(i, Math.random() < 0.5 ? c : new T.Color(1, 1, 1));
    }
    if (shards.instanceColor) shards.instanceColor.needsUpdate = true;
  }

  // ev: { m (máquina 0–8), v (0..1), y (0..1, altura da nota na tela), c {h,s,l}, life (s), kind }
  function hit(ev) {
    if (!ready) return;
    const v = ev.v, c = hsl(ev.c).lerp(col.cur, 0.5); // a cor do som puxa pra cor do ato
    switch (ev.m) {
      case 0: // KICK: o círculo 2D é desenhado por cima da cena (js/cycles.js); a cena 3D não reage
        break;
      case 8: env.bass = Math.max(env.bass, 0.4 + 0.6 * v); break; // BAIXO
      case 1: // SNARE: onda circular que distorce a imagem toda
        env.snare = Math.max(env.snare, 0.5 + 0.5 * v); env.snareR = 0;
        if (chapter.shards) burstShards(Math.round(10 + v * 20), c, v);
        break;
      case 3: { // CLAP: rasgos em 2–3 estalos rápidos (o "flam" do clap)
        const t0 = time;
        env.clapTaps = [t0, t0 + 0.035, t0 + 0.07].slice(0, 2 + (v > 0.6 ? 1 : 0));
        env.clap = Math.max(env.clap, 0.55 + 0.45 * v);
        break;
      }
      case 2: env.hat = Math.max(env.hat, 0.4 + 0.6 * v); break; // HI-HAT: estrelas
      case 4: lead.ty = (0.5 - ev.y) * 3.2; lead.a = Math.max(lead.a, 0.5 + 0.5 * v); ribbonMat.color.copy(c); break; // LEAD
      case 5: { // CHORD: a cor do ato varia um pouco + anel gigante
        col.target.setHSL((chapter.hue + (Math.random() - 0.5) * 0.12 + 1) % 1, chapter.sat, chapter.lit);
        const t = tori.find((x) => x.life <= 0) || tori[0];
        t.m.rotation.set(Math.random() * 3, Math.random() * 3, 0); t.sx = (Math.random() - 0.5) * 0.8; t.sy = 0.3 + Math.random() * 0.5;
        t.life = 2.5 + ev.life; t.age = 0; t.m.material.color.copy(c); t.m.visible = true;
        break;
      }
      case 6: // VOZ: halos que sobem
        env.voice = Math.max(env.voice, v);
        for (let i = 0; i < 2; i++) ring(new T.Vector3(0, -0.5 + i * 0.4, 0), new T.Euler(-Math.PI / 2, 0, 0), 2 * cam.scale, 0.9 + i * 0.3, 2.2 + ev.life, c, 0.55);
        break;
      case 7: // ACENTO / EFEITOS
        if (ev.kind === "acento") env.acc = Math.max(env.acc, 0.4 + 0.6 * v);
        else if (ev.kind === "impacto") { env.rollV += (Math.random() < 0.5 ? -1 : 1) * 4; env.acc = 1; burstShards(40, c, 1); }
        else env.bass = Math.max(env.bass, 0.5);
        break;
      default: break;
    }
  }

  // motion: 0..1 (Suave ≈ 0,4) escala tudo que mexe a câmera
  function frame(dt, mode, motion = 0.4) {
    if (!ready) return;
    time += dt;
    const kb = Math.exp(-dt * 3.5), kh = Math.exp(-dt * 12);
    // o kick sobe em ~30 ms (sem tranco seco) e desce devagar
    env.kick += (env.kickT - env.kick) * (1 - Math.exp(-dt * 30));
    env.kickT *= Math.exp(-dt * 7);
    env.bass *= kb; env.hat *= kh; env.voice *= kb;
    env.snare *= Math.exp(-dt * 4); env.snareR += dt * 2.6;          // a onda do snare atravessa em ~0,5 s
    env.acc *= Math.exp(-dt * 6);
    env.clap *= Math.exp(-dt * 9);
    // cada estalo do clap sorteia rasgos novos
    while (env.clapTaps.length && env.clapTaps[0] <= time) { env.clapTaps.shift(); env.clapSeed = Math.random() * 100; }
    env.ripple += dt * 10; env.rippleA *= Math.exp(-dt * 1.5);
    env.roll += env.rollV * dt; env.rollV *= Math.exp(-dt * 2.5); env.roll *= Math.exp(-dt * 1.2);
    col.cur.lerp(col.target, 1 - Math.exp(-dt * 2));

    const u = blobMat.uniforms;
    u.uTime.value = time; u.uKick.value = env.kick; u.uBass.value = env.bass;
    wireMat.uniforms.uTime.value = time; wireMat.uniforms.uKick.value = env.kick; wireMat.uniforms.uBass.value = env.bass;
    floorMat.uniforms.uRip.value = env.ripple; floorMat.uniforms.uRipA.value = env.rippleA;
    blob.rotation.y += dt * 0.15; blobWire.rotation.y = blob.rotation.y;
    blob.scale.setScalar(cam.scale * (1 + env.kick * 0.06)); blobWire.scale.copy(blob.scale);

    // câmera: órbita lenta; o kick dá um soco pra frente (FOV) — tudo escalado pelo "movimento"
    // forma: avança a transformação com curva suave
    if (shape.m < 1) shape.m = Math.min(1, shape.m + dt / shape.dur);
    const sm = shape.m * shape.m * (3 - 2 * shape.m);
    u.uA.value = shape.a; u.uB.value = shape.b; u.uM.value = sm;

    // capítulo: a câmera e o cenário escorregam pros valores novos (~2–3 s)
    const ease = 1 - Math.exp(-dt * 0.9);
    const easeAct = 1 - Math.exp(-dt * 0.7); // ~3 s pra trocar de ato
    for (const key of ["h", "dist", "speed", "floor", "stars", "look", "scale"]) cam[key] += (chapter[key] - cam[key]) * easeAct;
    if (shape.m >= 1 && pendingShape != null) { const n = pendingShape; pendingShape = null; nextShape(n); }
    floorMat.uniforms.uFloorA.value = cam.floor;
    if (chapter.lock != null) {
      let d = chapter.lock + Math.sin(time * 0.25) * 0.25 * motion - orbit;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      orbit += d * ease;
    } else orbit += dt * (0.03 + 0.07 * motion) * cam.speed;
    const R = cam.dist - env.kick * 0.5 * motion;
    camera.position.set(Math.cos(orbit) * R, cam.h + Math.sin(orbit * 0.7) * 0.4 * motion, Math.sin(orbit) * R);
    const roll = env.roll * 0.35 * motion;
    camera.up.set(Math.sin(roll), Math.cos(roll), 0);
    camera.lookAt(0, cam.look, 0);
    camera.fov = 58 - env.kick * 8 * motion;
    camera.updateProjectionMatrix();

    starMat.size = 0.09 + env.hat * 0.16; starMat.opacity = Math.min(1, (0.35 + env.hat * 0.65) * cam.stars + env.acc * 0.3);

    // círculos do kick: sempre de frente pra câmera, abrindo e sumindo
    for (const k of circles) {
      if (k.life <= 0) continue;
      k.age += dt; k.life -= dt;
      const p = Math.min(1, k.age / k.max), e = 1 - Math.pow(1 - p, 3);
      k.m.scale.setScalar(k.r0 + (k.r1 - k.r0) * e);
      k.m.quaternion.copy(camera.quaternion);
      k.m.material.opacity = k.op * (1 - p) * (1 - p);
      if (k.life <= 0) k.m.visible = false;
    }
    glowSprite.scale.setScalar(5.5 * cam.scale * (1 + env.kick * 0.25));
    glowSprite.material.color.copy(col.cur);
    glowSprite.material.opacity = 0.12 + env.kick * 0.45;
    stars.rotation.y += dt * 0.01;

    // estilhaços
    const dummy = new T.Object3D();
    for (let i = 0; i < shardData.length; i++) {
      const d = shardData[i];
      if (d.life <= 0) continue;
      d.life -= dt;
      d.vel.y -= 4 * dt; d.vel.multiplyScalar(Math.exp(-dt * 1.2));
      d.pos.addScaledVector(d.vel, dt);
      d.rot.x += d.spin.x * dt; d.rot.y += d.spin.y * dt;
      dummy.position.copy(d.pos); dummy.rotation.copy(d.rot);
      dummy.scale.setScalar(d.life > 0 ? d.s * Math.min(1, d.life / d.max * 2) : 0);
      dummy.updateMatrix(); shards.setMatrixAt(i, dummy.matrix);
    }
    shards.instanceMatrix.needsUpdate = true;

    for (const r of rings) {
      if (r.life <= 0) continue;
      r.age += dt; r.life -= dt;
      const s = r.size + r.age * r.speed;
      r.m.scale.setScalar(s);
      if (r.vel) r.m.position.addScaledVector(r.vel, dt);       // túnel: vem na direção da câmera
      else if (r.speed < 3) r.m.position.y += dt * 0.5;       // halos da voz sobem
      r.m.material.opacity = Math.max(0, r.op * (r.life / (r.life + r.age)));
      if (r.life <= 0) r.m.visible = false;
    }
    for (const t of tori) {
      if (t.life <= 0) continue;
      t.age += dt; t.life -= dt;
      t.m.rotation.x += t.sx * dt; t.m.rotation.y += t.sy * dt;
      t.m.scale.setScalar(1 + t.age * 0.08);
      t.m.material.opacity = Math.min(1, t.age * 3) * Math.max(0, Math.min(1, t.life)) * 0.8;
      if (t.life <= 0) t.m.visible = false;
    }
    // fita do lead: a cabeça orbita e sobe/desce pra altura da nota
    lead.y += (lead.ty - lead.y) * (1 - Math.exp(-dt * 10));
    lead.ang += dt * 1.6; lead.a *= Math.exp(-dt * 0.9);
    ribbonPts.copyWithin(3, 0, ribbonPts.length - 3);
    ribbonPts[0] = Math.cos(lead.ang) * 2.7; ribbonPts[1] = lead.y; ribbonPts[2] = Math.sin(lead.ang) * 2.7;
    ribbon.geometry.attributes.position.needsUpdate = true;
    ribbonMat.opacity = Math.min(1, lead.a * 1.4);

    render(mode);
  }
  function render(mode) {
    if (!rt) { renderer.setRenderTarget(null); renderer.clear(); renderer.render(scene, camera); return; }
    renderer.setRenderTarget(rt);
    if (mode === "vivo") renderer.clear();
    else { // rastro/pintura: véu preto fino numa textura que persiste
      fadeMat.opacity = mode === "rastro" ? 0.16 : 0.03;
      renderer.render(fadeScene, fadeCam);
      renderer.clearDepth();
    }
    renderer.render(scene, camera);
    // passe final com as distorções
    const u = postMat.uniforms;
    u.uSnare.value = env.snare; u.uSnareR.value = env.snareR;
    u.uClap.value = env.clap; u.uSeed.value = env.clapSeed; u.uAcc.value = env.acc;
    renderer.setRenderTarget(null);
    renderer.render(postScene, fadeCam);
  }
  function clear() {
    if (!ready || !rt) return;
    renderer.setRenderTarget(rt); renderer.clear(); renderer.setRenderTarget(null);
  }
  // foto: renderiza e copia na mesma hora (sem preserveDrawingBuffer o quadro some depois)
  function capture(ctx, w, h, mode) {
    if (!ready) return;
    render(mode);
    ctx.drawImage(renderer.domElement, 0, 0, w, h);
  }

  window.Cycles3D = { init, hit, frame, resize, setTexture, capture, clear, setAct, nextShape, get ready() { return ready; }, get act() { return chapter.name; } };
})();
