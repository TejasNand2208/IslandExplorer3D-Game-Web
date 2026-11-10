import * as THREE from 'three';
import { PLACES, CITY, SPAWN_UV } from './config.js';
import { T, makeRng } from './terrain.js';

const srgb = (r, g, b) => new THREE.Color().setRGB(Math.min(1, r), Math.min(1, g), Math.min(1, b), THREE.SRGBColorSpace);
const hash3 = (x, y, z, s) => { const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + s * 4.1414) * 43758.5453; return n - Math.floor(n); };

// ---------- low-poly mesh builder (vertex colours, counter-clockwise faces) ----------
class MB {
  constructor() { this.p = []; this.c = []; }
  tri(a, b, c, ca, cb = ca, cc = ca) {
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.c.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
  }
  quad(a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); }
  box(x0, y0, z0, x1, y1, z1, rgb, top = true) {
    const c = srgb(...rgb);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], c);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], c);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], c);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], c);
    if (top) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], c);
  }
  // faceted cylinder / cone (r1 = 0 -> cone), colour gradient bottom->top
  cyl(sides, y0, y1, r0, r1, rgb0, rgb1 = rgb0, ox = 0, oz = 0) {
    const c0 = srgb(...rgb0), c1 = srgb(...rgb1);
    for (let k = 0; k < sides; k++) {
      const a0 = 2 * Math.PI * k / sides, a1 = 2 * Math.PI * (k + 1) / sides;
      const b0 = [ox + Math.cos(a0) * r0, y0, oz + Math.sin(a0) * r0], b1 = [ox + Math.cos(a1) * r0, y0, oz + Math.sin(a1) * r0];
      const t0 = [ox + Math.cos(a0) * r1, y1, oz + Math.sin(a0) * r1], t1 = [ox + Math.cos(a1) * r1, y1, oz + Math.sin(a1) * r1];
      if (r1 <= 0.001) this.tri(b1, b0, t0, c0, c0, c1);
      else { this.tri(b1, b0, t0, c0, c0, c1); this.tri(b1, t0, t1, c0, c1, c1); this.tri([ox, y1, oz], t1, t0, c1); }
    }
  }
  // curved tube along points (for palm trunks)
  tube(pts, radii, sides, rgbA, rgbB) {
    const rings = pts.map((p, k) => {
      const nx = pts[Math.min(k + 1, pts.length - 1)], pv = pts[Math.max(k - 1, 0)];
      const dir = new THREE.Vector3(nx[0] - pv[0], nx[1] - pv[1], nx[2] - pv[2]).normalize();
      const u = new THREE.Vector3(0, 0, 1).cross(dir).normalize();
      const v = dir.clone().cross(u).normalize();
      const ring = [];
      for (let s = 0; s < sides; s++) {
        const a = 2 * Math.PI * s / sides;
        ring.push([p[0] + (u.x * Math.cos(a) + v.x * Math.sin(a)) * radii[k], p[1] + (u.y * Math.cos(a) + v.y * Math.sin(a)) * radii[k], p[2] + (u.z * Math.cos(a) + v.z * Math.sin(a)) * radii[k]]);
      }
      return { ring, p, col: srgb(...(k % 2 ? rgbA : rgbB)) };
    });
    for (let k = 0; k < rings.length - 1; k++) {
      const A = rings[k], B = rings[k + 1];
      for (let s = 0; s < sides; s++) {
        const s2 = (s + 1) % sides;
        this.triOut(A.ring[s], A.ring[s2], B.ring[s], A.p, A.col);
        this.triOut(A.ring[s2], B.ring[s2], B.ring[s], A.p, A.col);
      }
    }
  }
  // triangle whose normal points away from `center`
  triOut(a, b, c, center, col) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const o = [a[0] - center[0], a[1] - center[1], a[2] - center[2]];
    if (n[0] * o[0] + n[1] * o[1] + n[2] * o[2] >= 0) this.tri(a, b, c, col); else this.tri(a, c, b, col);
  }
  // jittered low-poly blob (tree crowns, bushes, rocks)
  blob(cx, cy, cz, r, sx, sy, sz, rgb, detail = 1, jit = 0.15, seed = 0) {
    const g = new THREE.IcosahedronGeometry(1, detail).toNonIndexed();
    const pa = g.attributes.position;
    const P = (i) => {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
      const j = 1 + (hash3(x, y, z, seed) - 0.5) * 2 * jit;
      return [cx + x * r * sx * j, cy + y * r * sy * j, cz + z * r * sz * j];
    };
    for (let i = 0; i < pa.count; i += 3) {
      const f = 0.88 + hash3(pa.getX(i), pa.getY(i), pa.getZ(i), seed + 7) * 0.24;
      const col = srgb(rgb[0] * f, rgb[1] * f, rgb[2] * f);
      this.tri(P(i), P(i + 1), P(i + 2), col);
    }
    g.dispose();
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

// ---------- house with gabled roof, chimney, door and windows ----------
function houseGeo(w, d, wh, rh, wall, roof) {
  const b = new MB(), hw = w / 2, hd = d / 2, o = 0.3;
  b.box(-hw, 0, -hd, hw, wh, hd, wall, false);
  const rc = srgb(...roof), top = wh + rh;
  b.quad([hw + o, wh, hd + o], [hw + o, wh, -hd - o], [0, top, -hd - o], [0, top, hd + o], rc);
  b.quad([-hw - o, wh, -hd - o], [-hw - o, wh, hd + o], [0, top, hd + o], [0, top, -hd - o], rc);
  const wc = srgb(...wall);
  b.tri([-hw, wh, hd], [hw, wh, hd], [0, top, hd], wc);
  b.tri([hw, wh, -hd], [-hw, wh, -hd], [0, top, -hd], wc);
  b.box(hw * 0.35, wh + rh * 0.3, -hd * 0.3, hw * 0.35 + 0.6, top + 0.9, -hd * 0.3 + 0.6, [0.45, 0.4, 0.38]); // chimney
  b.box(-0.35, 0, hd, 0.35, 1.5, hd + 0.08, [0.28, 0.17, 0.09]);                                              // door
  const win = [0.2, 0.28, 0.36];
  for (const sx of [-hw * 0.55, hw * 0.55]) { b.box(sx - 0.3, wh * 0.45, hd, sx + 0.3, wh * 0.45 + 0.6, hd + 0.06, win); b.box(sx - 0.3, wh * 0.45, -hd - 0.06, sx + 0.3, wh * 0.45 + 0.6, -hd, win); }
  b.box(hw, wh * 0.45, -0.3, hw + 0.06, wh * 0.45 + 0.6, 0.3, win);
  b.box(-hw - 0.06, wh * 0.45, -0.3, -hw, wh * 0.45 + 0.6, 0.3, win);
  return b.geometry();
}

// ---------- circle colliders with a spatial hash ----------
export class Colliders {
  constructor(cell = 12) { this.cell = cell; this.map = new Map(); }
  add(x, z, r) {
    const key = Math.floor(x / this.cell) + ',' + Math.floor(z / this.cell);
    if (!this.map.has(key)) this.map.set(key, []);
    this.map.get(key).push({ x, z, r });
  }
  flat() { const out = []; for (const l of this.map.values()) for (const c of l) out.push(Math.round(c.x * 1000) / 1000, Math.round(c.z * 1000) / 1000, Math.round(c.r * 1000) / 1000); return out; }
  resolve(pos, radius) {
    const cx = Math.floor(pos.x / this.cell), cz = Math.floor(pos.z / this.cell);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const list = this.map.get((cx + a) + ',' + (cz + b));
      if (!list) continue;
      for (const c of list) {
        const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), min = c.r + radius;
        if (d < min && d > 1e-4) { const k = (min - d) / d; pos.x += dx * k; pos.z += dz * k; }
      }
    }
  }
}

function makeLabel(text, w, h) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.font = 'bold 54px Arial, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 10; x.strokeStyle = 'rgba(0,0,0,0.85)'; x.strokeText(text, 256, 64);
  x.fillStyle = '#ffffff'; x.fillText(text, 256, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  s.scale.set(w, h, 1);
  return s;
}

export function buildWorld(scene, terrain) {
  const rng = makeRng(20240601);
  const colliders = new Colliders();
  const solid = new THREE.MeshLambertMaterial({ vertexColors: true });
  const leafy = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });

  // ===== geometries =====
  let b = new MB();                                                     // pine
  b.cyl(6, 0, 1.6, 0.26, 0.2, [0.3, 0.2, 0.1], [0.36, 0.24, 0.12]);
  [[1.0, 3.3, 1.65, [0.07, 0.25, 0.12]], [2.3, 4.7, 1.35, [0.09, 0.3, 0.14]], [3.6, 5.9, 1.0, [0.11, 0.34, 0.16]], [4.8, 7.2, 0.68, [0.14, 0.38, 0.18]]]
    .forEach(([y0, y1, r, c]) => b.cyl(9, y0, y1, r, 0, c, [c[0] * 1.25, c[1] * 1.25, c[2] * 1.2]));
  const pineGeo = b.geometry();

  b = new MB();                                                         // broadleaf (oak)
  b.cyl(6, 0, 2.6, 0.32, 0.2, [0.3, 0.21, 0.12], [0.38, 0.28, 0.17]);
  b.blob(0, 3.5, 0, 1.9, 1.15, 0.95, 1.15, [0.2, 0.5, 0.15], 1, 0.16, 1);
  b.blob(1.0, 2.9, 0.5, 1.3, 1, 0.9, 1, [0.24, 0.55, 0.17], 1, 0.16, 2);
  b.blob(-0.9, 3.1, -0.6, 1.4, 1, 0.9, 1, [0.17, 0.46, 0.14], 1, 0.16, 3);
  b.blob(0.1, 4.4, 0.1, 1.1, 1, 0.9, 1, [0.28, 0.58, 0.2], 1, 0.16, 4);
  const oakGeo = b.geometry();

  b = new MB();                                                         // palm
  const trunk = [], radii = [];
  for (let k = 0; k <= 7; k++) { const t = k / 7; trunk.push([1.5 * t * t, 6.5 * t, 0]); radii.push(0.3 - 0.13 * t); }
  b.tube(trunk, radii, 6, [0.5, 0.42, 0.3], [0.42, 0.34, 0.24]);
  const crown = trunk[7];
  for (let f = 0; f < 9; f++) {
    const ang = f * Math.PI * 2 / 9 + 0.3, dx = Math.cos(ang), dz = Math.sin(ang), px = -dz, pz = dx;
    let prev = null;
    for (let s = 0; s <= 5; s++) {
      const t = s / 5, out = 3.2 * t, y = crown[1] + 1.1 * t - 2.0 * t * t, hwid = 0.5 * Math.sin(Math.PI * (0.12 + 0.88 * t)) + 0.02;
      const cx = crown[0] + dx * out, cz = dz * out;
      const L = [cx + px * hwid, y, cz + pz * hwid], R = [cx - px * hwid, y, cz - pz * hwid];
      const colA = srgb(0.12, 0.38, 0.12), colB = srgb(0.3, 0.55, 0.18);
      if (prev) { b.tri(prev.L, prev.R, R, colA, colA, colB); b.tri(prev.L, R, L, colA, colB, colB); }
      prev = { L, R };
    }
  }
  const palmGeo = b.geometry();

  b = new MB();                                                         // bush
  b.blob(0, 0.45, 0, 0.7, 1.1, 0.8, 1.1, [0.16, 0.42, 0.13], 1, 0.2, 5);
  b.blob(0.5, 0.35, 0.2, 0.5, 1, 0.8, 1, [0.2, 0.48, 0.15], 1, 0.2, 6);
  const bushGeo = b.geometry();

  b = new MB();                                                         // grass tuft
  const gBase = srgb(0.16, 0.34, 0.1), gTip = srgb(0.5, 0.68, 0.24);
  for (let k = 0; k < 5; k++) {
    const a = k * 1.256 + 0.4, lean = 0.12 + (k % 3) * 0.06, h = 0.45 + (k % 2) * 0.25;
    const cx = Math.cos(a) * 0.12, cz = Math.sin(a) * 0.12, px = -Math.sin(a) * 0.06, pz = Math.cos(a) * 0.06;
    b.tri([cx - px, 0, cz - pz], [cx + px, 0, cz + pz], [cx + Math.cos(a) * lean, h, cz + Math.sin(a) * lean], gBase, gBase, gTip);
  }
  const tuftGeo = b.geometry();

  b = new MB();                                                         // rock
  b.blob(0, 0.45, 0, 0.95, 1.1, 0.75, 1, [0.5, 0.49, 0.47], 0, 0.22, 9);
  b.blob(0.7, 0.2, 0.3, 0.45, 1, 0.7, 1, [0.55, 0.53, 0.5], 0, 0.22, 10);
  const rockGeo = b.geometry();

  b = new MB();                                                         // sign post
  b.cyl(5, 0, 2.4, 0.12, 0.12, [0.32, 0.2, 0.1]);
  b.box(-0.7, 1.7, -0.06, 0.7, 2.4, 0.06, [0.62, 0.47, 0.26]);
  const postGeo = b.geometry();

  const houseVariants = [
    houseGeo(4.4, 5.4, 2.6, 1.7, [0.93, 0.87, 0.73], [0.7, 0.28, 0.2]),
    houseGeo(4.2, 5.0, 2.6, 1.6, [0.62, 0.6, 0.56], [0.36, 0.29, 0.26]),
    houseGeo(4.0, 5.2, 2.5, 1.6, [0.55, 0.4, 0.25], [0.72, 0.6, 0.3]),
  ];
  const cityVariants = [
    houseGeo(5.4, 6.4, 5.2, 2.0, [0.9, 0.84, 0.7], [0.62, 0.24, 0.18]),
    houseGeo(5.0, 6.0, 4.6, 1.8, [0.7, 0.66, 0.6], [0.3, 0.3, 0.34]),
  ];

  // ===== helpers =====
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const mat4 = (x, y, z, yaw, sx, sy, sz) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, yaw), new THREE.Vector3(sx, sy, sz));
  const instanced = (geo, mat, list, tint = 0.12, cast = true) => {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    const col = new THREE.Color();
    list.forEach((mx, i) => {
      m.setMatrixAt(i, mx);
      const v = 1 - tint + rng() * tint * 2;
      m.setColorAt(i, col.setRGB(v * (0.95 + rng() * 0.1), v, v * (0.95 + rng() * 0.1)));
    });
    m.count = list.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.frustumCulled = false;
    m.castShadow = cast; m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  const randomSpot = (ok, outsideCity = true) => {
    for (let n = 0; n < 600; n++) {
      const i = 4 + Math.floor(rng() * (terrain.cols - 8)), j = 4 + Math.floor(rng() * (terrain.rows - 8));
      if (!ok(terrain.tile(i, j), terrain.height(i, j))) continue;
      let [x, z] = terrain.xz(i, j);
      x += (rng() - 0.5) * terrain.cell * 1.6; z += (rng() - 0.5) * terrain.cell * 1.6;
      if (outsideCity && terrain.cityE(x, z) < 1.08) continue;
      return { x, z, y: terrain.heightAt(x, z) };
    }
    return null;
  };
  const snapToLand = (u, v) => {
    const x = (u - 0.5) * terrain.W, z = (0.5 - v) * terrain.H;
    if (terrain.heightAt(x, z) > 1) return { x, z, y: terrain.heightAt(x, z) };
    for (let r = 1; r < 40; r++) for (let a = 0; a < 16; a++) {
      const xx = x + Math.cos(a * Math.PI / 8) * r * 2, zz = z + Math.sin(a * Math.PI / 8) * r * 2;
      const hh = terrain.heightAt(xx, zz);
      if (hh > 1) return { x: xx, z: zz, y: hh };
    }
    return { x, z, y: terrain.heightAt(x, z) };
  };

  // ===== vegetation =====
  const pines = [], oaks = [], palms = [], bushes = [], tufts = [], rocks = [];
  for (let tries = 0; tries < 40000 && pines.length < 300; tries++) {
    const p = randomSpot((t, h) => h > 1.0 && t === T.FOREST && rng() < 0.85);
    if (!p) continue;
    const s = 0.8 + rng() * 0.8;
    pines.push(mat4(p.x, p.y - 0.15, p.z, rng() * 6.28, s, s * (0.9 + rng() * 0.3), s));
    colliders.add(p.x, p.z, 0.5 * s);
  }
  for (let tries = 0; tries < 40000 && oaks.length < 150; tries++) {
    const p = randomSpot((t, h) => h > 1.1 && (t === T.FOREST || t === T.GRASS));
    if (!p) continue;
    const cluster = terrain.fbm(p.x * 0.035, p.z * 0.035, 2);
    if (terrain.tileAt(p.x, p.z) === T.FOREST ? rng() > 0.2 : cluster < 0.55 || rng() > 0.5) continue;
    const s = 0.8 + rng() * 0.7;
    oaks.push(mat4(p.x, p.y - 0.15, p.z, rng() * 6.28, s, s, s));
    colliders.add(p.x, p.z, 0.5 * s);
  }
  for (let tries = 0; tries < 40000 && palms.length < 80; tries++) {
    const p = randomSpot((t, h) => h > 0.5 && h < 1.5 && t !== T.CITY && t !== T.ROAD && t !== T.SNOW, false);
    if (!p || terrain.cityE(p.x, p.z) < 1.2) continue;
    const s = 0.85 + rng() * 0.5, yaw = rng() * 6.28;
    palms.push(mat4(p.x, p.y - 0.1, p.z, yaw, s, s, s));
    colliders.add(p.x, p.z, 0.4 * s);
  }
  for (let tries = 0; tries < 30000 && bushes.length < 180; tries++) {
    const p = randomSpot((t, h) => h > 1.1 && (t === T.GRASS || t === T.FOREST));
    if (!p) continue;
    const s = 0.7 + rng() * 0.8;
    bushes.push(mat4(p.x, p.y - 0.05, p.z, rng() * 6.28, s, s, s));
  }
  for (let tries = 0; tries < 60000 && tufts.length < 3500; tries++) {
    const p = randomSpot((t, h) => h > 1.0 && (t === T.GRASS || t === T.FOREST));
    if (!p) continue;
    const s = 0.8 + rng() * 1.1;
    tufts.push(mat4(p.x, p.y - 0.02, p.z, rng() * 6.28, s, s, s));
  }
  for (let k = 0; k < 60; k++) {
    const p = randomSpot((t, h) => h > 0.8 && t !== T.ROAD);
    if (!p) continue;
    const s = 0.7 + rng() * 1.7;
    rocks.push(mat4(p.x, p.y - 0.12, p.z, rng() * 6.28, s, s * (0.7 + rng() * 0.5), s));
    colliders.add(p.x, p.z, 0.8 * s);
  }
  instanced(pineGeo, solid, pines, 0.14);
  instanced(oakGeo, solid, oaks, 0.14);
  instanced(palmGeo, leafy, palms, 0.1);
  instanced(bushGeo, solid, bushes, 0.15, false);
  instanced(tuftGeo, leafy, tufts, 0.18, false);
  instanced(rockGeo, solid, rocks, 0.12);

  // ===== places: villages, signs, labels =====
  const houseLists = [[], [], []], cityLists = [[], []], signs = [], places = [], posts = [];
  const labelGroup = new THREE.Group(); scene.add(labelGroup);
  const castleX = (CITY.castleU - 0.5) * terrain.W, castleZ = (0.5 - CITY.castleV) * terrain.H;
  for (const pl of PLACES) {
    const kind = pl.kind || 'town';
    const c = kind === 'castle' ? { x: castleX, z: castleZ, y: terrain.heightAt(castleX, castleZ) } : snapToLand(pl.u, pl.v);
    places.push({ id: pl.id, x: c.x, y: c.y, z: c.z, radius: pl.radius });

    const dims = { city: [26, 6.5, 24], castle: [20, 5, 38], mountain: [24, 6, 12], river: [15, 3.75, 0], town: [13, 3.25, 10] }[kind];
    const lab = makeLabel(pl.id, dims[0], dims[1]);
    if (kind === 'river') {                                   // float the river name above the water itself
      const rx = (pl.u - 0.5) * terrain.W, rz = (0.5 - pl.v) * terrain.H;
      lab.position.set(rx, 5, rz);
    } else lab.position.set(c.x, c.y + dims[2], c.z);
    labelGroup.add(lab);

    if (kind !== 'mountain') {
      let sx = c.x + 3.5, sz = c.z + 3.5;
      if (kind === 'city') { sx = c.x + 6; sz = c.z - 28; }
      if (kind === 'castle') { sx = c.x + 5; sz = c.z - 22; }
      const sy = terrain.heightAt(sx, sz);
      posts.push(mat4(sx, sy, sz, 0, 1, 1, 1));
      colliders.add(sx, sz, 0.4);
      signs.push({ x: sx, y: sy, z: sz, title: pl.id + ' sign', msg: pl.msg });
    }

    for (let h = 0; h < pl.houses; h++) {
      const ang = (h + 0.3) * Math.PI * 2 / pl.houses, rad = 8 + rng() * 6;
      const hx = c.x + Math.cos(ang) * rad, hz = c.z + Math.sin(ang) * rad, hy = terrain.heightAt(hx, hz);
      if (hy < 0.9) continue;
      const s = 1 + rng() * 0.25, v = Math.floor(rng() * 3);
      houseLists[v].push(mat4(hx, hy - 0.15, hz, Math.round(rng() * 4) * Math.PI / 2 + (rng() - 0.5) * 0.15, s, s, s));
      colliders.add(hx, hz, 2.9 * s);
    }
  }
  instanced(postGeo, solid, posts, 0.05);

  // ===== Vismritnagar: wall, towers, buildings, castle =====
  const CW = CITY.a * terrain.W * 0.98, CH = CITY.b * terrain.H * 0.98;
  const ccx = (CITY.u - 0.5) * terrain.W, ccz = (0.5 - CITY.v) * terrain.H;
  const wallB = new MB();
  wallB.box(-3.1, 0, -1.1, 3.1, 5.2, 1.1, [0.68, 0.66, 0.62]);
  for (let m = 0; m < 4; m++) wallB.box(-3.0 + m * 1.6, 5.2, -1.1, -2.2 + m * 1.6, 6.0, 1.1, [0.7, 0.68, 0.64]);
  const wallGeo = wallB.geometry();
  const towerB = new MB();
  towerB.cyl(10, 0, 8, 2.8, 2.6, [0.62, 0.6, 0.57]);
  towerB.cyl(10, 8, 11, 3.2, 0, [0.6, 0.2, 0.17]);
  const towerGeo = towerB.geometry();

  const walls = [], towers = [];
  const gates = [0, Math.PI / 2, Math.PI, Math.PI * 1.5], gap = 0.16;
  const inGate = th => gates.some(g => Math.abs(((th - g + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < gap);
  let th = 0;
  while (th < Math.PI * 2) {
    const x = ccx + CW * Math.cos(th), z = ccz + CH * Math.sin(th);
    const dx = -CW * Math.sin(th), dz = CH * Math.cos(th), len = Math.hypot(dx, dz);
    const y = terrain.heightAt(x, z);
    if (!inGate(th) && y > 1.2 && terrain.tileAt(x, z) !== T.WATER) {
      walls.push(mat4(x, y - 0.4, z, Math.atan2(-dz, dx), 1, 1, 1));
      colliders.add(x, z, 2.3);
    }
    th += 6.0 / len;
  }
  for (const g of gates) for (const s of [-1, 1]) {
    const t2 = g + s * gap, x = ccx + CW * Math.cos(t2), z = ccz + CH * Math.sin(t2), y = terrain.heightAt(x, z);
    if (y > 1.2) { towers.push(mat4(x, y - 0.5, z, 0, 1, 1, 1)); colliders.add(x, z, 2.9); }
  }
  for (const t2 of [Math.PI / 4, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) {
    const x = ccx + CW * Math.cos(t2), z = ccz + CH * Math.sin(t2), y = terrain.heightAt(x, z);
    if (y > 1.2) { towers.push(mat4(x, y - 0.5, z, 0, 1.2, 1.2, 1.2)); colliders.add(x, z, 3.4); }
  }
  instanced(wallGeo, solid, walls, 0.06);
  instanced(towerGeo, solid, towers, 0.05);

  // castle
  const cb = new MB(), stone = [0.66, 0.64, 0.6], roofC = [0.6, 0.2, 0.17];
  cb.box(-8, 0, -8, 8, 13, 8, stone);
  for (let m = 0; m < 6; m++) for (const [mx, mz, sx2, sz2] of [[-8 + m * 3.2, -8, 1.6, 0.8], [-8 + m * 3.2, 7.2, 1.6, 0.8], [-8, -8 + m * 3.2, 0.8, 1.6], [7.2, -8 + m * 3.2, 0.8, 1.6]])
    cb.box(mx, 13, mz, mx + sx2, 14.2, mz + sz2, [0.7, 0.68, 0.64]);
  cb.cyl(8, 13, 22, 3.6, 3.4, stone); cb.cyl(8, 22, 27, 4.4, 0, roofC);
  cb.cyl(5, 27, 31, 0.1, 0.1, [0.3, 0.3, 0.3]);
  cb.box(0.1, 29.5, -0.05, 2.6, 30.9, 0.05, [0.75, 0.15, 0.15]);
  for (const [ox, oz] of [[-15, -15], [15, -15], [-15, 15], [15, 15]]) { cb.cyl(10, 0, 11, 3.0, 2.8, stone, stone, ox, oz); cb.cyl(10, 11, 15.5, 3.6, 0, roofC, roofC, ox, oz); }
  cb.box(-15, 0, -15.8, 15, 7, -14.2, stone);  cb.box(-15, 0, 14.2, 15, 7, 15.8, stone);
  cb.box(-15.8, 0, -15, -14.2, 7, 15, stone);  cb.box(14.2, 0, -15, 15.8, 7, 15, stone);
  const castle = new THREE.Mesh(cb.geometry(), solid);
  castle.position.set(castleX, terrain.heightAt(castleX, castleZ) - 0.3, castleZ);
  castle.castShadow = true; castle.receiveShadow = true;
  scene.add(castle);
  colliders.add(castleX, castleZ, 9.5);
  for (const [ox, oz] of [[-15, -15], [15, -15], [-15, 15], [15, 15]]) colliders.add(castleX + ox, castleZ + oz, 3.3);
  for (let k = -14; k <= 14; k += 2.4) for (const [ox, oz] of [[k, -15], [k, 15], [-15, k], [15, k]]) colliders.add(castleX + ox, castleZ + oz, 1.4);

  // city houses
  let placed = 0;
  for (let tries = 0; tries < 6000 && placed < 90; tries++) {
    const x = ((CITY.u - 0.5) + (rng() * 2 - 1) * 0.12) * terrain.W;
    const z = (0.5 - CITY.v - (rng() * 2 - 1) * 0.17) * terrain.H;
    if (terrain.cityE(x, z) > 0.88) continue;
    if (Math.hypot(x - castleX, z - castleZ) < 26) continue;
    const y = terrain.heightAt(x, z);
    if (y < 1.5 || terrain.tileAt(x, z) === T.ROAD) continue;
    const s = 0.95 + rng() * 0.3;
    cityLists[Math.floor(rng() * 2)].push(mat4(x, y - 0.15, z, Math.round(rng() * 4) * Math.PI / 2 + (rng() - 0.5) * 0.12, s, s, s));
    colliders.add(x, z, 3.8 * s);
    placed++;
  }
  houseVariants.forEach((g, i) => { if (houseLists[i].length) instanced(g, solid, houseLists[i], 0.08); });
  cityVariants.forEach((g, i) => { if (cityLists[i].length) instanced(g, solid, cityLists[i], 0.08); });

  // ===== harbor: pier + boats =====
  const boats = [];
  {
    let hx = (0.74 - 0.5) * terrain.W; const hz = (0.5 - 0.458) * terrain.H;
    for (let k = 0; k < 120 && terrain.heightAt(hx, hz) > -0.1; k++) hx += 1;
    const pb = new MB();
    pb.box(-1.6, 0.55, 0, 1.6, 0.75, 16, [0.5, 0.36, 0.2]);
    for (let k = 0; k <= 16; k += 4) for (const sx of [-1.4, 1.4]) pb.box(sx - 0.15, -2.5, k, sx + 0.15, 0.55, k + 0.3, [0.32, 0.22, 0.12]);
    const pier = new THREE.Mesh(pb.geometry(), solid);
    pier.position.set(hx - 4, 0, hz); pier.rotation.y = -Math.PI / 2; pier.castShadow = true;
    scene.add(pier);
    const bb = new MB();
    bb.box(-1.1, 0, -3, 1.1, 0.9, 2, [0.45, 0.28, 0.14]);
    bb.tri([-1.1, 0, 2], [1.1, 0, 2], [0, 0, 4.2], srgb(0.4, 0.25, 0.12));
    bb.tri([-1.1, 0.9, 2], [1.1, 0.9, 2], [0, 0.9, 4.2], srgb(0.5, 0.32, 0.17));
    bb.tri([-1.1, 0, 2], [0, 0.9, 4.2], [-1.1, 0.9, 2], srgb(0.42, 0.26, 0.13));
    bb.tri([1.1, 0, 2], [1.1, 0.9, 2], [0, 0.9, 4.2], srgb(0.42, 0.26, 0.13));
    bb.cyl(5, 0.9, 6.5, 0.1, 0.08, [0.3, 0.2, 0.1]);
    bb.quad([0, 1.6, -0.05], [0, 1.6, 0.05], [0, 6.2, 0.05], [0, 6.2, -0.05], srgb(0.95, 0.93, 0.85));
    bb.tri([0.02, 1.6, 0], [0.02, 6.2, 0], [2.4, 1.6, 0], srgb(0.96, 0.94, 0.88));
    const bgeo = bb.geometry();
    [[hx + 6, hz - 9, 0.4], [hx + 12, hz + 6, 2.2]].forEach(([x, z, yaw]) => {
      const boat = new THREE.Mesh(bgeo, leafy);
      boat.position.set(x, 0.1, z); boat.rotation.y = yaw; boat.castShadow = true;
      scene.add(boat); boats.push(boat);
    });
  }

  // ===== collectibles =====
  const items = [];
  const matWood = new THREE.MeshLambertMaterial({ color: srgb(0.5, 0.32, 0.15) });
  const matStone = new THREE.MeshLambertMaterial({ color: srgb(0.58, 0.6, 0.63), flatShading: true });
  const matFruit = new THREE.MeshLambertMaterial({ color: srgb(0.85, 0.15, 0.12) });
  const geoWood = new THREE.CylinderGeometry(0.12, 0.12, 0.9, 7).rotateZ(Math.PI / 2), geoStone = new THREE.DodecahedronGeometry(0.28), geoFruit = new THREE.SphereGeometry(0.18, 8, 6);
  const scatter = (type, count, geo, mat, ok) => {
    for (let k = 0; k < count; k++) {
      const p = randomSpot((t, h) => h > 1 && ok(t));
      if (!p) continue;
      const root = new THREE.Group();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      root.add(mesh);
      root.position.set(p.x, p.y + 0.55, p.z);
      scene.add(root);
      items.push({ id: 'Item_' + items.length, type, x: p.x, y: p.y, z: p.z, root, mesh, collected: false });
    }
  };
  scatter('Wood', 40, geoWood, matWood, t => t === T.FOREST || t === T.GRASS);
  scatter('Stone', 28, geoStone, matStone, t => t === T.GRASS || t === T.ROCK || t === T.FOREST);
  scatter('Fruit', 28, geoFruit, matFruit, t => t === T.GRASS || t === T.FOREST);

  // ===== spawn =====
  const sp = { x: (SPAWN_UV.u - 0.5) * terrain.W, z: (0.5 - SPAWN_UV.v) * terrain.H };
  sp.y = terrain.heightAt(sp.x, sp.z);

  const animate = (t) => boats.forEach((bt, i) => { bt.position.y = 0.1 + Math.sin(t * 1.3 + i * 2) * 0.07; bt.rotation.z = Math.sin(t * 1.1 + i) * 0.03; });
  return { colliders, items, signs, places, spawn: sp, animate };
}
