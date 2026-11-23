/* Cycles Visual — estilo 3D (WebGL com three.js r128, embutido em js/vendor).

   Uma cena fixa, pensada, em vez de efeitos soltos:
   - no centro, uma escultura orgânica (esfera deformada por ruído no shader)
     vestida com a obra do banco como textura e uma borda de luz;
   - um chão de malha que ondula; um campo de estrelas ao fundo;
   - a câmera orbita devagar.
   Cada instrumento tem um papel:
     kick   → soco: a câmera avança (FOV), a escultura incha, onda de choque no chão
     baixo  → o chão ondula e a escultura deforma por dentro
     snare  → estilhaços 3D girando pra fora
     hi-hat → as estrelas piscam
     lead   → fita de luz orbitando na altura da nota
     chord  → a cor da cena muda e entra um anel gigante girando
     voz    → halos que sobem em volta da escultura
     efeitos→ no drop a câmera gira e a cena relampeia
   Interface: Cycles3D.init(canvas) · hit(ev) · frame(dt, mode) · resize(w,h) · setTexture(canvas) */
(function () {
  "use strict";
  let T = null; // THREE
  let renderer, scene, camera, fadeScene, fadeCam, fadeMat;
  let blob, blobWire, blobMat, wireMat, floor, floorMat, stars, starMat;
  let shards, shardData = [], rings = [], tori = [], ribbon, ribbonPts, ribbonMat;
  let tex = null, ready = false, time = 0;
  const env = { kick: 0, bass: 0, hat: 0, snare: 0, voice: 0, roll: 0, rollV: 0, ripple: 99, rippleA: 0 };
  const lead = { y: 0, ty: 0, a: 0, ang: 0 };
  const col = { cur: null, target: null };
  let orbit = 0;

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

  const BLOB_VS = NOISE + `
  uniform float uTime, uKick, uBass, uScale;
  varying vec3 vN; varying vec3 vObjN; varying vec3 vView; varying float vD;
  void main(){
    vec3 p = position;
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
  void main(){ gl_FragColor = vec4(uColor*clamp(0.28 + vH*0.9, 0.0, 1.1)*vFade, 1.0); }`;

  function hsl(c) { return new T.Color().setHSL(((c.h % 360) + 360) % 360 / 360, Math.min(1, c.s / 100), Math.min(0.8, Math.max(0.25, c.l / 100))); }

  function init(canvas) {
    T = window.THREE;
    if (!T) throw new Error("three.js não carregou");
    renderer = new T.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
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

    col.cur = new T.Color(0.55, 0.3, 1); col.target = col.cur.clone();
    const blank = new T.DataTexture(new Uint8Array([60, 30, 120, 255]), 1, 1, T.RGBAFormat); blank.needsUpdate = true;
    const uni = {
      uTime: { value: 0 }, uKick: { value: 0 }, uBass: { value: 0 }, uScale: { value: 1 },
      uTex: { value: blank }, uHasTex: { value: 0 }, uColor: { value: col.cur },
    };
    blobMat = new T.ShaderMaterial({ uniforms: uni, vertexShader: BLOB_VS, fragmentShader: BLOB_FS });
    const geo = new T.IcosahedronGeometry(1.55, 5);
    blob = new T.Mesh(geo, blobMat);
    scene.add(blob);
    wireMat = new T.ShaderMaterial({ uniforms: { ...uni, uScale: { value: 1.12 } }, vertexShader: BLOB_VS, fragmentShader: WIRE_FS,
      wireframe: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false });
    blobWire = new T.Mesh(new T.IcosahedronGeometry(1.55, 2), wireMat);
    scene.add(blobWire);

    floorMat = new T.ShaderMaterial({
      uniforms: { uTime: uni.uTime, uBass: uni.uBass, uRip: { value: 99 }, uRipA: { value: 0 }, uColor: { value: col.cur } },
      vertexShader: FLOOR_VS, fragmentShader: FLOOR_FS, wireframe: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false,
    });
    floor = new T.Mesh(new T.PlaneGeometry(44, 44, 70, 70), floorMat);
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
    // fita do lead
    ribbonPts = new Float32Array(180 * 3);
    const rg = new T.BufferGeometry(); rg.setAttribute("position", new T.BufferAttribute(ribbonPts, 3));
    ribbonMat = new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false });
    ribbon = new T.Line(rg, ribbonMat);
    scene.add(ribbon);
    ready = true;
  }

  function resize(w, h) {
    if (!ready) return;
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
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

  function ring(pos, rot, size, speed, life, color, op) {
    const r = rings.find((x) => x.life <= 0) || rings[0];
    r.m.position.copy(pos); r.m.rotation.set(rot.x, rot.y, rot.z);
    r.size = size; r.speed = speed; r.life = life; r.age = 0; r.op = op;
    r.m.material.color.copy(color); r.m.visible = true;
  }

  // ev: { m (máquina 0–8), v (0..1), y (0..1, altura da nota na tela), c {h,s,l}, life (s), kind }
  function hit(ev) {
    if (!ready) return;
    const v = ev.v, c = hsl(ev.c);
    switch (ev.m) {
      case 0: // KICK
        env.kick = Math.max(env.kick, 0.5 + 0.5 * v);
        env.ripple = 2.2; env.rippleA = 0.5 + 0.5 * v; // a onda nasce em volta da escultura, não no meio
        ring(new T.Vector3(0, -2.25, 0), new T.Euler(-Math.PI / 2, 0, 0), 1.6, 9 + 6 * v, 1.1, c, 0.9);
        break;
      case 8: env.bass = Math.max(env.bass, 0.4 + 0.6 * v); break; // BAIXO
      case 1: { // SNARE: estilhaços
        env.snare = 1;
        const n = 14 + Math.round(v * 30);
        let made = 0;
        for (let i = 0; i < shardData.length && made < n; i++) {
          const d = shardData[i];
          if (d.life > 0) continue;
          made++;
          const dir = new T.Vector3(Math.random() - 0.5, Math.random() * 0.9 - 0.2, Math.random() - 0.5).normalize();
          d.pos = dir.clone().multiplyScalar(1.7); d.vel = dir.multiplyScalar(3 + Math.random() * 5 * (0.5 + v));
          d.rot = new T.Euler(Math.random() * 6, Math.random() * 6, 0); d.spin = new T.Vector3(Math.random() * 8, Math.random() * 8, 0);
          d.life = 0.9 + Math.random() * 0.8; d.max = d.life; d.s = 0.6 + Math.random() * 1.4;
          shards.setColorAt(i, Math.random() < 0.5 ? c : new T.Color(1, 1, 1));
        }
        if (shards.instanceColor) shards.instanceColor.needsUpdate = true;
        break;
      }
      case 2: case 3: env.hat = Math.max(env.hat, 0.4 + 0.6 * v); break; // HI-HAT / PERC: estrelas
      case 4: lead.ty = (0.5 - ev.y) * 3.2; lead.a = Math.max(lead.a, 0.5 + 0.5 * v); ribbonMat.color.copy(c); break; // LEAD
      case 5: { // CHORD
        col.target = c.clone();
        const t = tori.find((x) => x.life <= 0) || tori[0];
        t.m.rotation.set(Math.random() * 3, Math.random() * 3, 0); t.sx = (Math.random() - 0.5) * 0.8; t.sy = 0.3 + Math.random() * 0.5;
        t.life = 2.5 + ev.life; t.age = 0; t.m.material.color.copy(c); t.m.visible = true;
        break;
      }
      case 6: // VOZ: halos que sobem
        env.voice = Math.max(env.voice, v);
        for (let i = 0; i < 2; i++) ring(new T.Vector3(0, -0.5 + i * 0.4, 0), new T.Euler(-Math.PI / 2, 0, 0), 2, 0.9 + i * 0.3, 2.2 + ev.life, c, 0.55);
        break;
      case 7: // EFEITOS
        if (ev.kind === "impacto") { env.rollV += (Math.random() < 0.5 ? -1 : 1) * 4; env.kick = 1; env.ripple = 2.2; env.rippleA = 1.2; }
        else env.bass = Math.max(env.bass, 0.5);
        break;
      default: break;
    }
  }

  function frame(dt, mode) {
    if (!ready) return;
    time += dt;
    const k = Math.exp(-dt * 9), kb = Math.exp(-dt * 3.5), kh = Math.exp(-dt * 12);
    env.kick *= k; env.bass *= kb; env.hat *= kh; env.snare *= kh; env.voice *= kb;
    env.ripple += dt * 10; env.rippleA *= Math.exp(-dt * 1.5);
    env.roll += env.rollV * dt; env.rollV *= Math.exp(-dt * 2.5); env.roll *= Math.exp(-dt * 1.2);
    col.cur.lerp(col.target, 1 - Math.exp(-dt * 2));

    const u = blobMat.uniforms;
    u.uTime.value = time; u.uKick.value = env.kick; u.uBass.value = env.bass;
    wireMat.uniforms.uTime.value = time; wireMat.uniforms.uKick.value = env.kick; wireMat.uniforms.uBass.value = env.bass;
    floorMat.uniforms.uRip.value = env.ripple; floorMat.uniforms.uRipA.value = env.rippleA;
    blob.rotation.y += dt * 0.15; blobWire.rotation.y = blob.rotation.y;
    blob.scale.setScalar(1 + env.kick * 0.12); blobWire.scale.copy(blob.scale);

    // câmera: órbita lenta; o kick dá um soco pra frente (FOV)
    orbit += dt * 0.13;
    const R = 7.2 - env.kick * 0.6;
    camera.position.set(Math.cos(orbit) * R, 1.4 + Math.sin(orbit * 0.7) * 0.5, Math.sin(orbit) * R);
    camera.up.set(Math.sin(env.roll * 0.35), Math.cos(env.roll * 0.35), 0);
    camera.lookAt(0, 0, 0);
    camera.fov = 58 - env.kick * 9;
    camera.updateProjectionMatrix();

    starMat.size = 0.09 + env.hat * 0.16; starMat.opacity = 0.35 + env.hat * 0.65;
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
      if (r.speed < 3) r.m.position.y += dt * 0.5; // halos da voz sobem
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

    // vivo: limpa; rastro/pintura: véu preto fino (o que passou fica)
    fadeMat.opacity = mode === "vivo" ? 1 : mode === "rastro" ? 0.16 : 0.03;
    renderer.render(fadeScene, fadeCam);
    renderer.clearDepth();
    renderer.render(scene, camera);
  }

  window.Cycles3D = { init, hit, frame, resize, setTexture, get ready() { return ready; } };
})();
