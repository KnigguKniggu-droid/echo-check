// Echo Check+ stage: the live scene (three.js 0.185.1, vendored). Loaded only when WebGL 2 is there and
// motion is allowed. Everything the caller needs comes back from createScene(); nothing here touches the DOM
// outside the canvas, and every failure is thrown to the caller, which keeps the poster.
import * as THREE from '../vendor/three/build/three.module.min.js';
import { L, H, W, C, RANGE_DB, imageSources, bounceDb, brightness } from './model.js';

const ACCENT = [0.949, 0.714, 0.196];   // #f2b632, written straight to the sRGB frame
const ORDER_SHARE = [6, 2.2, 1, 0.6, 0.45];   // grains per square metre of front, by reflection order: the first fronts are the ones to follow
const R_REF = 4;                         // metres: where a front has its full grain brightness

function rng(seed) {                     // mulberry32: the same grains on every visit
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---- the sound front: grains on the spheres that grow from each image source ----
// Each image gets grains only in the directions that cross the room, so nothing is wasted outside it.
function buildFronts(images, density) {
  const rand = rng(20261115);
  const cx = L / 2, cy = H / 2, cz = W / 2, rb = 0.5 * Math.hypot(L, H, W);
  const dirs = [], meta = [];
  images.forEach((im, idx) => {
    const ax = cx - im.x, ay = cy - im.y, az = cz - im.z;
    const D = Math.hypot(ax, ay, az);
    im.dist = Math.max(D, R_REF);
    const inside = im.order === 0;
    const cosMax = inside || D <= rb * 1.02 ? -1 : Math.sqrt(1 - (rb / D) * (rb / D));
    const omega = 2 * Math.PI * (1 - cosMax);
    const tries = Math.round(density * ORDER_SHARE[Math.min(im.order, 4)] * omega * (inside ? R_REF * R_REF : D * D));
    // a basis around the axis to the room centre
    const a = D > 1e-6 ? [ax / D, ay / D, az / D] : [0, 1, 0];
    const h = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let u = [a[1] * h[2] - a[2] * h[1], a[2] * h[0] - a[0] * h[2], a[0] * h[1] - a[1] * h[0]];
    const ul = Math.hypot(u[0], u[1], u[2]); u = [u[0] / ul, u[1] / ul, u[2] / ul];
    const v = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]];
    for (let n = 0; n < tries; n++) {
      const ct = cosMax + (1 - cosMax) * rand(), st = Math.sqrt(Math.max(0, 1 - ct * ct)), ph = 2 * Math.PI * rand();
      const cp = Math.cos(ph) * st, sp = Math.sin(ph) * st;
      const dx = a[0] * ct + u[0] * cp + v[0] * sp, dy = a[1] * ct + u[1] * cp + v[1] * sp, dz = a[2] * ct + u[2] * cp + v[2] * sp;
      if (!inside) {                    // slab test: does this ray cross the room?
        let t0 = 0, t1 = 1e9;
        if (Math.abs(dx) > 1e-9) { const p = -im.x / dx, q = (L - im.x) / dx; t0 = Math.max(t0, Math.min(p, q)); t1 = Math.min(t1, Math.max(p, q)); } else if (im.x < 0 || im.x > L) continue;
        if (Math.abs(dy) > 1e-9) { const p = -im.y / dy, q = (H - im.y) / dy; t0 = Math.max(t0, Math.min(p, q)); t1 = Math.min(t1, Math.max(p, q)); } else if (im.y < 0 || im.y > H) continue;
        if (Math.abs(dz) > 1e-9) { const p = -im.z / dz, q = (W - im.z) / dz; t0 = Math.max(t0, Math.min(p, q)); t1 = Math.min(t1, Math.max(p, q)); } else if (im.z < 0 || im.z > W) continue;
        if (t1 <= t0) continue;
      }
      dirs.push(dx, dy, dz); meta.push(idx, rand());
    }
  });
  // shuffle, so any prefix of the buffer is an even subset (the quality step-down just draws fewer)
  const count = meta.length / 2;
  const order = new Uint32Array(count);
  for (let i = 0; i < count; i++) order[i] = i;
  for (let i = count - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
  const P = new Float32Array(count * 3), M = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) { const s = order[i]; P[i * 3] = dirs[s * 3]; P[i * 3 + 1] = dirs[s * 3 + 1]; P[i * 3 + 2] = dirs[s * 3 + 2]; M[i * 2] = meta[s * 2]; M[i * 2 + 1] = meta[s * 2 + 1]; }
  return { P, M, count };
}

const FRONT_VERT = (nImg) => `
precision highp float;
#define NIMG ${nImg}
uniform vec4 uImg[NIMG];     // xyz: the image source; w: its level in dB after its wall bounces
uniform float uR;            // radius of every sphere: c * t
uniform vec3 uRoom;
uniform float uTail, uSize, uPx, uMinPx, uMaxPx, uGain, uRef, uNear, uRange, uAir, uWallBand;
in vec2 aMeta;               // image index, a random number
out float vK;
void main(){
  vec4 im = uImg[int(aMeta.x + .5)];
  float rnd = aMeta.y;
  float r = uR - rnd * rnd * uTail;                 // a crisp leading edge and a short trailing tail
  vec3 p = im.xyz + position * r;
  if (r < .03 || any(lessThan(p, vec3(0.))) || any(greaterThan(p, uRoom))) { gl_Position = vec4(2., 2., 2., 1.); gl_PointSize = 0.; vK = 0.; return; }
  vec4 mv = viewMatrix * vec4(p, 1.);
  gl_Position = projectionMatrix * mv;
  // where a front meets a wall, the floor or the ceiling it draws a bright line; in the air it stays faint
  float ds = min(min(min(p.x, uRoom.x - p.x), min(p.y, uRoom.y - p.y)), min(p.z, uRoom.z - p.z));
  float wall = 1. - smoothstep(.02, uWallBand, ds);
  float sz = uSize * mix(1., 1.4, wall) * uPx / max(.2, -mv.z);
  float fade = clamp(sz / uMinPx, 0., 1.);          // small grains fade instead of shrinking
  gl_PointSize = clamp(sz, uMinPx, uMaxPx);
  // level: every bounce costs im.w dB, and the front weakens as it spreads; brightness is linear in dB
  float db = im.w - 6.0206 * log2(max(r, uRef) / uRef);
  float k = db > -uRange ? 1. + db / uRange * .86 : .14 * max(0., 1. - (-db - uRange) / (60. - uRange));
  float near = aMeta.x < .5 ? clamp(r * r / (uNear * uNear), .03, 1.) : 1.;   // the direct sound is dense near the clap
  vK = k * near * mix(uAir, 1., wall) * (1. - .7 * rnd) * fade * fade * uGain;
}`;

const FIELD_VERT = `
precision highp float;
uniform float uSize, uPx, uMinPx, uMaxPx, uLevel, uPhase;
in float aRnd;
out float vK;
void main(){
  vec4 mv = viewMatrix * vec4(position, 1.);
  gl_Position = projectionMatrix * mv;
  float sz = uSize * uPx / max(.2, -mv.z);
  float fade = clamp(sz / uMinPx, 0., 1.);
  gl_PointSize = clamp(sz, uMinPx, uMaxPx);
  // what is left of the sound still travels: three slow plane waves cross the field
  float w = sin(dot(position, vec3(2.1, .4, .9)) - uPhase) + sin(dot(position, vec3(-.8, 1.6, 1.7)) - uPhase * 1.07) + sin(dot(position, vec3(.5, -1.1, -2.2)) - uPhase * .93);
  vK = uLevel * (.62 + .38 * (w / 3.)) * (.55 + .45 * aRnd) * fade * fade;
  if (uLevel <= 0.) { gl_Position = vec4(2., 2., 2., 1.); gl_PointSize = 0.; }
}`;

const GRAIN_FRAG = `
precision highp float;
uniform vec3 uColor;
in float vK;
out vec4 outColor;
void main(){
  vec2 q = gl_PointCoord * 2. - 1.;
  float a = 1. - smoothstep(.3, 1., length(q));
  float k = clamp(vK * a, 0., 1.);
  if (k < .004) discard;
  outColor = vec4(uColor * k, k);      // premultiplied; blended as screen, so grains never bloom to a halo
}`;

function grainMaterial(vert, uniforms) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: vert, fragmentShader: GRAIN_FRAG, uniforms,
    transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcColorFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
}

// ---- the stand-in room: a plain box of the right size, used until (or instead of) the modelled classroom ----
function boxRoom() {
  const g = new THREE.Group();
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, metalness: 0, ...o });
  const shell = new THREE.Mesh(new THREE.BoxGeometry(L, H, W), [
    mat(0xcfc9bb, { side: THREE.BackSide }), mat(0xd6d1c4, { side: THREE.BackSide }),      // back wall, front wall
    mat(0xe4e1d8, { side: THREE.BackSide }), mat(0x8d8474, { side: THREE.BackSide }),      // ceiling, floor
    mat(0xcbc5b7, { side: THREE.BackSide }), mat(0xc4c0b6, { side: THREE.BackSide }),      // door wall, window wall
  ]);
  shell.position.set(L / 2, H / 2, W / 2); g.add(shell);
  const add = (w, h, d, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
  add(0.04, 1.2, 4.8, 0.02, 1.5, W / 2, mat(0x1e2f42, { roughness: 0.6 }));              // slate board
  add(0.7, 0.76, 1.4, 1.6, 0.38, 1.6, mat(0x9b7a52));                                      // teacher's desk
  const top = mat(0xc9a36b), leg = mat(0x4a4f57);
  for (const x of [3.4, 4.6, 5.8, 7.0]) for (let i = 0; i < 5; i++) {
    const z = 0.9 + i * 1.25;
    add(0.6, 0.04, 0.46, x, 0.74, z, top); add(0.5, 0.72, 0.04, x, 0.36, z - 0.2, leg); add(0.5, 0.72, 0.04, x, 0.36, z + 0.2, leg);
  }
  const glass = new THREE.MeshBasicMaterial({ color: 0x8fa9c9 });
  for (const x of [2.0, 4.6, 7.2]) add(1.6, 1.7, 0.02, x, 1.75, 0.012, glass);            // three tall windows at dusk
  return g;
}

export async function createScene({ canvas, phone = false, order = 4, quality = 1 }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !phone, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
  if (!renderer.capabilities.isWebGL2) { renderer.dispose(); throw new Error('no WebGL 2'); }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const dusk = new THREE.Color(0x1e2f42);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 40);

  // light for the stand-in room and for a model that is not baked: cool sky, a warm low sun from the windows
  const lights = new THREE.Group();
  lights.add(new THREE.HemisphereLight(0xa9bfdc, 0x4b4238, 1.5));
  const sun = new THREE.DirectionalLight(0xffc48a, 1.6); sun.position.set(5.5, 2.6, -6); sun.target.position.set(4.6, 0, 5); lights.add(sun, sun.target);
  scene.add(lights);

  let room = boxRoom(); scene.add(room);
  let hasModel = false, mode = 'room';

  // sound front
  const images = imageSources(order);
  const fronts = buildFronts(images, (phone ? 60 : 105) * quality);
  const imgUniform = images.map((im) => new THREE.Vector4(im.x, im.y, im.z, 0));
  const frontGeo = new THREE.BufferGeometry();
  frontGeo.setAttribute('position', new THREE.BufferAttribute(fronts.P, 3));
  frontGeo.setAttribute('aMeta', new THREE.BufferAttribute(fronts.M, 2));
  const U = {
    uImg: { value: imgUniform }, uR: { value: 0 }, uRoom: { value: new THREE.Vector3(L, H, W) }, uRef: { value: 1.5 },
    // tuned against the baked classroom: a thin front that draws a clear line where it meets a surface, faint in the air
    uNear: { value: R_REF }, uRange: { value: RANGE_DB }, uAir: { value: 0.12 }, uWallBand: { value: 0.17 },
    uTail: { value: 0.06 }, uSize: { value: 0.02 }, uPx: { value: 900 }, uMinPx: { value: 1.2 }, uMaxPx: { value: 6 }, uGain: { value: 1.3 },
    uColor: { value: new THREE.Vector3(...ACCENT) },
  };
  if (phone) { U.uGain.value = 1.9; U.uSize.value = 0.027; U.uAir.value = 0.16; }   // fewer, larger grains on a small screen
  const frontPts = new THREE.Points(frontGeo, grainMaterial(FRONT_VERT(images.length), U));
  frontPts.frustumCulled = false; frontPts.renderOrder = 10; scene.add(frontPts);

  // the later echoes: a faint even field in the whole room
  const fieldN = Math.round((phone ? 9000 : 22000) * quality);
  const fr = rng(7), FP = new Float32Array(fieldN * 3), FR = new Float32Array(fieldN);
  for (let i = 0; i < fieldN; i++) { FP[i * 3] = fr() * L; FP[i * 3 + 1] = fr() * H; FP[i * 3 + 2] = fr() * W; FR[i] = fr(); }
  const fieldGeo = new THREE.BufferGeometry();
  fieldGeo.setAttribute('position', new THREE.BufferAttribute(FP, 3));
  fieldGeo.setAttribute('aRnd', new THREE.BufferAttribute(FR, 1));
  const FU = { uSize: { value: 0.02 }, uPx: U.uPx, uMinPx: { value: 1.3 }, uMaxPx: { value: 4.5 }, uLevel: { value: 0 }, uPhase: { value: 0 }, uColor: U.uColor };
  const fieldPts = new THREE.Points(fieldGeo, grainMaterial(FIELD_VERT, FU));
  fieldPts.frustumCulled = false; fieldPts.renderOrder = 9; scene.add(fieldPts);

  // how long the drawn orders last: after that the even field carries the level alone
  const tDrawn = Math.max(...images.map((im) => Math.hypot(im.x - L / 2, im.y - H / 2, im.z - W / 2))) / C;
  let roomT = -1, fieldGain = 1.5;   // the later echoes must stay readable for as long as the chart shows sound
  function setEchoTime(T) {
    if (T === roomT) return; roomT = T;
    const perBounce = bounceDb(T);
    images.forEach((im, i) => { imgUniform[i].w = perBounce * im.order; });
  }

  function applyMode() {
    const overlay = mode === 'overlay';
    scene.background = overlay ? null : dusk;
    renderer.setClearColor(0x000000, overlay ? 0 : 1);
    room.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) { m.colorWrite = !overlay; } });
  }
  applyMode();

  let pxH = 1, look = new THREE.Vector3();
  const api = {
    renderer, mode: () => mode, hasModel: () => hasModel,
    info: { images: images.length, order, grains: fronts.count, field: fieldN, tDrawn },
    setSize(w, h, dpr) { renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); camera.aspect = w / h; pxH = h * dpr; },
    setMode(m) { mode = m; applyMode(); },
    setQuality(q) { frontGeo.setDrawRange(0, Math.max(1000, Math.floor(fronts.count * q))); fieldGeo.setDrawRange(0, Math.max(500, Math.floor(fieldN * q))); },
    tune(o) { for (const k in o) { if (k === 'fieldGain') fieldGain = o[k]; else if (U[k]) U[k].value = o[k]; else if (FU[k]) FU[k].value = o[k]; } },
    /** cam: { pos, fwd, tanHalf }; t and T in real room seconds. */
    render(cam, t, T) {
      setEchoTime(T);
      camera.fov = (Math.atan(cam.tanHalf) * 360) / Math.PI; camera.updateProjectionMatrix();
      camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]);
      look.set(cam.pos[0] + cam.fwd[0], cam.pos[1] + cam.fwd[1], cam.pos[2] + cam.fwd[2]); camera.lookAt(look);
      U.uPx.value = pxH / (2 * cam.tanHalf);
      U.uR.value = C * t;
      // the even field comes up as the drawn reflections thin out, then follows the level
      const u = Math.min(1, Math.max(0, (t - 0.012) / Math.max(0.02, tDrawn * 0.6 - 0.012)));
      FU.uLevel.value = t >= T ? 0 : fieldGain * u * u * (3 - 2 * u) * brightness((-60 * t) / T);
      FU.uPhase.value = (C * t * 2 * Math.PI) / 2.6;
      renderer.render(scene, camera);
    },
    async compile() { if (renderer.compileAsync) await renderer.compileAsync(scene, camera); },
    /** Swap the stand-in for the modelled classroom. Resolves false (and keeps the box) on any failure. */
    async loadRoom(url, ms = 12000) {
      try {
        const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
          import('../vendor/three/addons/loaders/GLTFLoader.js'), import('../vendor/three/addons/libs/meshopt_decoder.module.js'),
        ]);
        const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
        const gltf = await Promise.race([loader.loadAsync(url), new Promise((_, no) => setTimeout(() => no(new Error('model timeout')), ms))]);
        let meshes = 0, lit = 0, modelLights = 0;
        const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());   // floor and ceiling stay sharp at flat angles
        gltf.scene.traverse((o) => {
          if (o.isLight) modelLights++;
          if (o.isMesh) { meshes++; o.frustumCulled = true; for (const m of [].concat(o.material)) { if (!m.isMeshBasicMaterial) lit++; if (m.map) { m.map.anisotropy = aniso; m.map.needsUpdate = true; } } }
          if (o.isCamera) o.visible = false;
        });
        if (!meshes) throw new Error('empty model');
        scene.remove(room); room.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); } });
        room = gltf.scene; scene.add(room); hasModel = true;
        api.info.model = { meshes, lit, lights: modelLights };
        lights.visible = lit > 0 && modelLights === 0;      // a baked or self-lit model needs none of ours
        applyMode();
        return true;
      } catch (e) { api.info.modelError = String(e && e.message || e); return false; }
    },
    lights, scene, camera,
    dispose() { try { renderer.dispose(); frontGeo.dispose(); fieldGeo.dispose(); } catch (e) { /* nothing to do */ } },
  };
  return api;
}
