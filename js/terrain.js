import * as THREE from 'three';
import { WORLD_W, COLS, FOREST_GREEN_MAX, CITY } from './config.js';

export const T = { WATER: 0, SAND: 1, GRASS: 2, FOREST: 3, ROAD: 4, CITY: 5, ROCK: 6, SNOW: 7 };

export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const inRect = (u, v, u0, v0, u1, v1) => u >= u0 && u <= u1 && v >= v0 && v <= v1;

// distance (in cells) from every cell to the nearest cell where src != 0  (chamfer)
function distance(src, w, h) {
  const d = new Float32Array(w * h);
  for (let k = 0; k < d.length; k++) d[k] = src[k] ? 0 : 1e6;
  const at = (i, j) => j * w + i;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let v = d[at(i, j)];
    if (i > 0) v = Math.min(v, d[at(i - 1, j)] + 1);
    if (j > 0) {
      v = Math.min(v, d[at(i, j - 1)] + 1);
      if (i > 0) v = Math.min(v, d[at(i - 1, j - 1)] + 1.414);
      if (i < w - 1) v = Math.min(v, d[at(i + 1, j - 1)] + 1.414);
    }
    d[at(i, j)] = v;
  }
  for (let j = h - 1; j >= 0; j--) for (let i = w - 1; i >= 0; i--) {
    let v = d[at(i, j)];
    if (i < w - 1) v = Math.min(v, d[at(i + 1, j)] + 1);
    if (j < h - 1) {
      v = Math.min(v, d[at(i, j + 1)] + 1);
      if (i < w - 1) v = Math.min(v, d[at(i + 1, j + 1)] + 1.414);
      if (i > 0) v = Math.min(v, d[at(i - 1, j + 1)] + 1.414);
    }
    d[at(i, j)] = v;
  }
  return d;
}

function blur(arr, w, h, passes) {
  for (let p = 0; p < passes; p++) {
    const copy = arr.slice();
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let s = 0, c = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        s += copy[clamp(j + b, 0, h - 1) * w + clamp(i + a, 0, w - 1)]; c++;
      }
      arr[j * w + i] = s / c;
    }
  }
}

export class Terrain {
  constructor(img) {
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    this.mapPx = cx.getImageData(0, 0, W, H).data;
    this.mapW = W; this.mapH = H;

    this.cols = COLS;
    this.rows = Math.round(COLS * H / W);
    this.W = WORLD_W;
    this.H = WORLD_W * H / W;
    this.cell = this.W / this.cols;
    this.w = this.cols + 1;
    this.h = this.rows + 1;
    this.tiles = new Uint8Array(this.w * this.h);
    this.land = new Uint8Array(this.w * this.h);

    this.classifyMap();
    this.makeHeights();
    this.makeWeights();
  }

  idx(i, j) { return j * this.w + i; }
  xz(i, j) { return [(i / this.cols - 0.5) * this.W, (0.5 - j / this.rows) * this.H]; }
  tile(i, j) { return this.tiles[j * this.w + i]; }
  height(i, j) { return this.heights[j * this.w + i]; }
  cityE(x, z) {
    const u = x / this.W + 0.5, v = 0.5 - z / this.H;
    return Math.hypot((u - CITY.u) / CITY.a, (v - CITY.v) / CITY.b);
  }
  uv(x, z) { return [x / this.W + 0.5, 0.5 - z / this.H]; }

  // ---------------- noise
  hash(ix, iy) {
    let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = this.hash(xi, yi), b = this.hash(xi + 1, yi), c = this.hash(xi, yi + 1), d = this.hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  fbm(x, y, oct = 4) {
    let s = 0, amp = 0.5, f = 1, n = 0;
    for (let o = 0; o < oct; o++) { s += amp * this.noise(x * f, y * f); n += amp; amp *= 0.5; f *= 2.03; }
    return s / n;
  }

  // ---------------- map -> tiles
  isUI(u, v) {
    if (u < 0.02 || u > 0.98 || v < 0.025 || v > 0.975) return true;
    if (inRect(u, v, 0.893, 0.02, 1, 0.35)) return true;
    if (inRect(u, v, 0.893, 0.51, 1, 0.775)) return true;
    if (inRect(u, v, 0.883, 0.79, 1, 1)) return true;
    if (inRect(u, v, 0, 0.02, 0.115, 0.26)) return true;
    return false;
  }

  classify(r, g, b, u, v) {
    if (b > r + 22 && b >= g - 12) return T.WATER;
    const bright = (r + g + b) / 3;
    if (inRect(u, v, 0.36, 0.04, 0.64, 0.20) && bright > 150 && Math.abs(r - b) < 35) return T.SNOW;
    const inCity = this.cityE((u - 0.5) * this.W, (0.5 - v) * this.H) < 1;
    if (Math.max(r, g, b) - Math.min(r, g, b) < 22) return inCity ? T.CITY : T.ROAD;
    if (r > 150 && g > 130 && b < 150 && r >= g - 5) return T.SAND;
    if (r > g + 12 && r > b + 12) return inCity ? T.CITY : T.ROCK;
    if (g < FOREST_GREEN_MAX) return T.FOREST;
    return T.GRASS;
  }

  classifyMap() {
    const px = this.mapPx, W = this.mapW, H = this.mapH;
    const halfX = W / this.cols * 0.5, halfY = H / this.rows * 0.5;
    for (let j = 0; j <= this.rows; j++) for (let i = 0; i <= this.cols; i++) {
      const u = i / this.cols, v = j / this.rows, k = j * this.w + i;
      if (this.isUI(u, v)) { this.tiles[k] = T.WATER; continue; }
      const cx = Math.round(u * (W - 1)), cy = Math.round(v * (H - 1));
      const x0 = clamp(Math.round(cx - halfX), 0, W - 1), x1 = clamp(Math.round(cx + halfX), 0, W - 1);
      const y0 = clamp(Math.round(cy - halfY), 0, H - 1), y1 = clamp(Math.round(cy + halfY), 0, H - 1);
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = y0; y <= y1; y += 2) for (let x = x0; x <= x1; x += 2) {
        const p = (y * W + x) * 4; r += px[p]; g += px[p + 1]; b += px[p + 2]; n++;
      }
      if (!n) n = 1;
      const t = this.classify(r / n, g / n, b / n, u, v);
      this.tiles[k] = t;
      this.land[k] = t !== T.WATER ? 1 : 0;
    }
  }

  // ---------------- heights (fractal hills, ridged mountain, flat city, gentle beaches)
  makeHeights() {
    const { w, h, cell } = this;
    const water = new Uint8Array(w * h);
    for (let k = 0; k < water.length; k++) water[k] = this.land[k] ? 0 : 1;
    const dW = distance(water, w, h), dL = distance(this.land, w, h);
    this.heights = new Float32Array(w * h);
    const mx = 0, mz = (0.5 - 0.11) * this.H;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i, [x, z] = this.xz(i, j);
      if (this.land[k]) {
        const dm = dW[k] * cell;
        let hh = 0.15 + 2.7 * smooth(0, 26, dm - 1.5);
        hh += (this.fbm(x * 0.018 + 11, z * 0.018 + 7, 4) - 0.5) * 2 * 3.2 * smooth(6, 40, dm);
        hh += (this.fbm(x * 0.08, z * 0.08, 3) - 0.5) * 0.9 * smooth(3, 12, dm);
        const md2 = (x - mx) ** 2 + (z - mz) ** 2;
        const ridge = 1 - Math.abs(2 * this.fbm(x * 0.05 + 3, z * 0.05 + 9, 4) - 1);
        hh += 18 * Math.exp(-md2 / (2 * 24 * 24)) * (0.65 + 0.7 * ridge);
        const e = this.cityE(x, z);
        if (e < 1.15) hh += (2.5 - hh) * (1 - smooth(0.85, 1.15, e));
        this.heights[k] = hh;
      } else {
        this.heights[k] = -0.45 - Math.min(dL[k] * cell, 20) * 0.36;
      }
    }
    blur(this.heights, w, h, 2);
  }

  makeWeights() {
    const n = this.w * this.h;
    this.wForest = new Float32Array(n); this.wRock = new Float32Array(n); this.wCity = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const t = this.tiles[k];
      this.wForest[k] = t === T.FOREST ? 1 : 0;
      this.wRock[k] = t === T.ROCK ? 1 : 0;
      this.wCity[k] = t === T.CITY ? 1 : 0;
    }
    blur(this.wForest, this.w, this.h, 2); blur(this.wRock, this.w, this.h, 1); blur(this.wCity, this.w, this.h, 2);
  }

  // ---------------- queries
  // exact height of the rendered triangles (same split as the mesh)
  heightAt(x, z) {
    const fi = clamp((x / this.W + 0.5) * this.cols, 0, this.cols - 0.0001);
    const fj = clamp((0.5 - z / this.H) * this.rows, 0, this.rows - 0.0001);
    const i = Math.floor(fi), j = Math.floor(fj), tx = fi - i, tj = fj - j;
    const ha = this.height(i, j), hb = this.height(i + 1, j), hc = this.height(i, j + 1), hd = this.height(i + 1, j + 1);
    if (tx + tj <= 1) return ha + tx * (hb - ha) + tj * (hc - ha);
    return hd + (1 - tx) * (hc - hd) + (1 - tj) * (hb - hd);
  }

  tileAt(x, z) {
    const i = clamp(Math.round((x / this.W + 0.5) * this.cols), 0, this.cols);
    const j = clamp(Math.round((0.5 - z / this.H) * this.rows), 0, this.rows);
    return this.tile(i, j);
  }

  // ---------------- smooth indexed mesh with UVs (ground texture is draped over it)
  buildMesh() {
    const { w, h, cols, rows } = this;
    const pos = new Float32Array(w * h * 3), uv = new Float32Array(w * h * 2);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i, [x, z] = this.xz(i, j);
      pos[k * 3] = x; pos[k * 3 + 1] = this.heights[k]; pos[k * 3 + 2] = z;
      uv[k * 2] = i / cols; uv[k * 2 + 1] = 1 - j / rows;
    }
    const idx = new Uint32Array(cols * rows * 6);
    let p = 0;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
      idx[p++] = a; idx[p++] = b; idx[p++] = c;
      idx[p++] = b; idx[p++] = d; idx[p++] = c;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }

  // roads drawn on the original map (gray pixels) -> soft mask
  makeRoadMask() {
    const px = this.mapPx, W = this.mapW, H = this.mapH;
    const m = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H;
      if (this.isUI(u, v) || inRect(u, v, 0.36, 0.04, 0.64, 0.20)) continue;
      const p = (y * W + x) * 4, r = px[p], g = px[p + 1], b = px[p + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), br = (r + g + b) / 3;
      if (mx - mn < 18 && br > 80 && br < 200) m[y * W + x] = 1;
    }
    blur(m, W, H, 1);
    return m;
  }

  // Procedural ground texture: grass/forest floor/rock/snow/sand/seabed/foam + roads from the map
  buildGroundTexture(TW = 1024) {
    const TH = Math.round(TW * this.H / this.W);
    const cv = document.createElement('canvas');
    cv.width = TW; cv.height = TH;
    const g = cv.getContext('2d');
    const img = g.createImageData(TW, TH), d = img.data;
    const road = this.makeRoadMask();
    const { w, cols, rows, W, H } = this;
    const bil = (arr, fi, fj) => {
      fi = clamp(fi, 0, cols - 0.0001); fj = clamp(fj, 0, rows - 0.0001);
      const i = Math.floor(fi), j = Math.floor(fj), tx = fi - i, ty = fj - j, k = j * w + i;
      const a = arr[k], b = arr[k + 1], c = arr[k + w], dd = arr[k + w + 1];
      return (a + (b - a) * tx) * (1 - ty) + (c + (dd - c) * tx) * ty;
    };
    const mapW = this.mapW, mapH = this.mapH;
    for (let py = 0; py < TH; py++) for (let px = 0; px < TW; px++) {
      const x = ((px + 0.5) / TW - 0.5) * W, z = (0.5 - (py + 0.5) / TH) * H;
      const fi = (px + 0.5) / TW * cols, fj = (py + 0.5) / TH * rows;
      const h = bil(this.heights, fi, fj);
      const gx = bil(this.heights, fi + 0.6, fj) - bil(this.heights, fi - 0.6, fj);
      const gz = bil(this.heights, fi, fj + 0.6) - bil(this.heights, fi, fj - 0.6);
      const slope = Math.hypot(gx, gz) / (1.2 * this.cell);

      const n1 = this.fbm(x * 0.03, z * 0.03, 3), n2 = this.noise(x * 0.35, z * 0.35), n3 = this.noise(x * 1.9, z * 1.9);
      // grass
      let r = lerp(0.27, 0.5, n1), gg = lerp(0.52, 0.62, n1), b = lerp(0.15, 0.24, n1);
      // forest floor
      const wf = bil(this.wForest, fi, fj);
      r = lerp(r, lerp(0.11, 0.2, n2), wf); gg = lerp(gg, lerp(0.27, 0.38, n2), wf); b = lerp(b, lerp(0.09, 0.15, n2), wf);
      // city ground
      const wc = bil(this.wCity, fi, fj);
      const cob = lerp(0.5, 0.62, n3);
      r = lerp(r, cob, wc); gg = lerp(gg, cob * 0.97, wc); b = lerp(b, cob * 0.92, wc);
      // rock (steep slopes + rock tiles)
      const rock = Math.max(smooth(0.5, 0.95, slope + (n2 - 0.5) * 0.25), bil(this.wRock, fi, fj));
      const rk = 0.42 + 0.14 * n3;
      r = lerp(r, rk + 0.04, rock); gg = lerp(gg, rk, rock); b = lerp(b, rk - 0.04, rock);
      // snow on the summit
      const snow = smooth(10.5, 13, h + (n1 - 0.5) * 3) * (1 - 0.5 * rock);
      r = lerp(r, 0.95, snow); gg = lerp(gg, 0.97, snow); b = lerp(b, 1, snow);
      // roads from the map
      const mx = clamp(Math.round((px + 0.5) / TW * (mapW - 1)), 0, mapW - 1), my = clamp(Math.round((py + 0.5) / TH * (mapH - 1)), 0, mapH - 1);
      const rm = road[my * mapW + mx] * smooth(0.2, 0.6, h);
      if (rm > 0.01) {
        const rc = lerp(0.52, 0.64, n3);
        const k = rm * 0.85;
        r = lerp(r, wc > 0.5 ? rc : rc + 0.06, k); gg = lerp(gg, wc > 0.5 ? rc : rc - 0.02, k); b = lerp(b, wc > 0.5 ? rc * 0.95 : rc - 0.16, k);
      }
      // beach sand + wet sand
      const lim = 0.95 + (n2 - 0.5) * 0.5;
      const sand = 1 - smooth(lim - 0.45, lim, h);
      const sr = lerp(0.9, 0.82, n3), sg = lerp(0.82, 0.74, n3), sb = lerp(0.58, 0.5, n3);
      const wet = 1 - smooth(0.0, 0.5, h);
      r = lerp(r, sr * (1 - 0.18 * wet), sand * (1 - rm * 0.5)); gg = lerp(gg, sg * (1 - 0.18 * wet), sand * (1 - rm * 0.5)); b = lerp(b, sb * (1 - 0.15 * wet), sand * (1 - rm * 0.5));
      // sea floor: sand -> deep teal, then surf foam
      const under = smooth(0.08, -0.12, h);
      if (under > 0) {
        const dt = clamp(-h / 5, 0, 1);
        r = lerp(r, lerp(0.8, 0.07, dt), under); gg = lerp(gg, lerp(0.74, 0.3, dt), under); b = lerp(b, lerp(0.52, 0.4, dt), under);
      }
      const foam = smooth(-0.9, -0.25, h) * (1 - smooth(-0.1, 0.12, h)) * (0.4 + 0.6 * n3);
      r = lerp(r, 1, foam * 0.85); gg = lerp(gg, 1, foam * 0.85); b = lerp(b, 1, foam * 0.85);

      const mul = 0.9 + 0.2 * n3;
      const o = (py * TW + px) * 4;
      d[o] = clamp(r * mul, 0, 1) * 255; d[o + 1] = clamp(gg * mul, 0, 1) * 255; d[o + 2] = clamp(b * mul, 0, 1) * 255; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.mapPx = null; // free memory
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }
}
