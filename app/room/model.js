// Echo Check+ stage: the shared numbers and the sound model (DESIGN.md section 4). Pure JS, no imports.
// Units are metres and seconds. glTF axes, +Y up, the room's floor corner at the origin.

export const L = 9.144;   // length, x: front wall at 0, back wall at L
export const H = 3.048;   // height, y
export const W = 7.62;    // width, z: window wall at 0, door wall at W
export const VOLUME = 212.4;
export const SURFACE = 2 * (L * W + L * H + W * H);
export const SRC = [1.2, 1.5, 3.81];      // the clap
export const MIC = [5.2, 0.78, 3.4];      // the laptop microphone
export const C = 343;                     // speed of sound
export const ROOMS = { treated: { T: 0.45 }, echoey: { T: 1.1 } };
export const SLOW = 60;                   // one real second takes SLOW seconds on screen
export const HOLD = 1.2;                  // screen seconds held at the end of a cycle
export const RANGE_DB = 40;               // visible brightness range

export const CAMS = {
  hero: { pos: [8.75, 2.35, 6.95], look: [2.4, 1.15, 3.0], fov: 50 },
  s2: { pos: [1.0, 1.65, 6.4], look: [5.2, 0.9, 3.4], fov: 50 },
  s3: { pos: [6.6, 1.2, 2.7], look: [1.2, 1.45, 3.81], fov: 50 },
};

// One absorption value for every surface so that the Eyring echo time equals T.
export const absorption = (T) => 1 - Math.exp(-0.161 * VOLUME / (SURFACE * T));
export const bounceDb = (T) => 10 * Math.log10(1 - absorption(T));
// The diffuse level: 60 dB down in T seconds.
export const levelDb = (t, T) => -60 * Math.min(Math.max(t, 0), T) / T;
// Brightness from level in dB: the visible 40 dB carry most of the range, and the last 20 dB keep a
// small remainder, so nothing reads as finished while the chart says sound is left.
export function brightness(db) {
  if (db >= 0) return 1;
  if (db <= -60) return 0;
  const floor = 0.14;
  return db > -RANGE_DB ? 1 + (db / RANGE_DB) * (1 - floor) : floor * (1 - (-db - RANGE_DB) / (60 - RANGE_DB));
}

// Image-source method for a box room. Along one axis the images sit at 2·D·i ± s;
// index n counts the wall bounces that image stands for.
const mirror = (n, D, s) => (n % 2 === 0 ? n * D + s : (n + 1) * D - s);
export function imageSources(maxOrder) {
  const out = [];
  for (let i = -maxOrder; i <= maxOrder; i++) {
    for (let j = -maxOrder; j <= maxOrder; j++) {
      for (let k = -maxOrder; k <= maxOrder; k++) {
        const order = Math.abs(i) + Math.abs(j) + Math.abs(k);
        if (order > maxOrder) continue;
        out.push({ x: mirror(i, L, SRC[0]), y: mirror(j, H, SRC[1]), z: mirror(k, W, SRC[2]), order });
      }
    }
  }
  return out.sort((a, b) => a.order - b.order);
}

// ---- a small camera, so labels and the poster fallback need no 3D library ----
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp3 = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
export const smooth = (u) => { const x = Math.min(1, Math.max(0, u)); return x * x * (3 - 2 * x); };

/** Forward vector from pos to look, turned by yaw (about +Y) and pitch (radians). */
export function forward(pos, look, yaw = 0, pitch = 0) {
  const f = norm(sub(look, pos));
  if (!yaw && !pitch) return f;
  const y0 = Math.atan2(f[0], f[2]) + yaw;
  const p0 = Math.max(-1.4, Math.min(1.4, Math.asin(f[1]) + pitch));
  return [Math.sin(y0) * Math.cos(p0), Math.sin(p0), Math.cos(y0) * Math.cos(p0)];
}

/** Half the vertical field of view (as a tangent) that makes a live camera match an object-fit: cover picture. */
export function coverTan(fovDeg, viewAspect, pictureAspect) {
  const t = Math.tan((fovDeg * Math.PI) / 360);
  return viewAspect > pictureAspect ? (t * pictureAspect) / viewAspect : t;
}

/** Project a room point to box pixels. Returns null when it is behind the camera. */
export function project(p, pos, fwd, tanHalf, w, h) {
  const r = norm(cross(fwd, [0, 1, 0]));
  const u = cross(r, fwd);
  const d = sub(p, pos);
  const z = dot(d, fwd);
  if (z < 0.2) return null;
  const aspect = w / h;
  return { x: (0.5 + (dot(d, r) / (z * tanHalf * aspect)) * 0.5) * w, y: (0.5 - (dot(d, u) / (z * tanHalf)) * 0.5) * h, z };
}
