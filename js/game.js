import * as THREE from 'three';
import { Terrain } from './terrain.js';
import { buildWorld } from './world.js';
import { Player } from './player.js';
import { GameAudio } from './audio.js';
import { OBJECTIVES } from './config.js';

const $ = id => document.getElementById(id);
const SAVE_KEY = 'islandExplorer3D_save_v1', SET_KEY = 'islandExplorer3D_settings_v1';
const MAX_ITEM = 99;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const col = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

const settings = Object.assign({ music: 0.5, sfx: 0.8, quality: 0.75, shadows: false },
  JSON.parse(localStorage.getItem(SET_KEY) || '{}'));

// ------------------------------------------------------------------ renderer / scene
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: false, powerPreference: 'low-power' });
} catch (e) {
  $('loadText').innerHTML = 'WebGL is not available.<br>Use Chrome or Edge and enable "Use hardware acceleration" in browser settings.';
  throw e;
}
renderer.shadowMap.type = THREE.PCFShadowMap;

const HORIZON = col(0.80, 0.90, 0.97);
const scene = new THREE.Scene();
scene.background = HORIZON.clone();
scene.fog = new THREE.Fog(HORIZON.clone(), 170, 470);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 700);

// fixed daytime lighting
const hemi = new THREE.HemisphereLight(col(0.75, 0.88, 1.0), col(0.45, 0.42, 0.30), 1.05);
scene.add(hemi);
const SUN_DIR = new THREE.Vector3(0.55, 0.75, 0.35).normalize();
const sun = new THREE.DirectionalLight(col(1, 0.95, 0.85), 2.6);
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 320 });
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);

// sky dome (gradient) + sun + drifting clouds
const skyGeo = new THREE.SphereGeometry(600, 24, 14);
{
  const pos = skyGeo.attributes.position, cols = [];
  const cH = col(0.80, 0.90, 0.97), cM = col(0.50, 0.72, 0.93), cZ = col(0.22, 0.46, 0.82), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = clamp(pos.getY(i) / 600, 0, 1);
    if (t < 0.35) c.copy(cH).lerp(cM, t / 0.35); else c.copy(cM).lerp(cZ, (t - 0.35) / 0.65);
    cols.push(c.r, c.g, c.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
}
const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
sky.renderOrder = -10;
scene.add(sky);
const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(16, 14, 10), new THREE.MeshBasicMaterial({ color: 0xfff6c8, fog: false }));
scene.add(sunDisc);

const clouds = [];
{
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const g = cv.getContext('2d');
  for (const [x, y, r] of [[70, 74, 40], [118, 60, 50], [166, 70, 42], [100, 84, 36], [150, 86, 34], [200, 82, 28]]) {
    const gr = g.createRadialGradient(x, y, 2, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.9 });
  for (let i = 0; i < 26; i++) {
    const s = new THREE.Sprite(mat);
    const a = Math.random() * Math.PI * 2, r = 120 + Math.random() * 420;
    s.position.set(Math.cos(a) * r, 130 + Math.random() * 110, Math.sin(a) * r);
    const w = 130 + Math.random() * 160; s.scale.set(w, w * 0.4, 1);
    scene.add(s); clouds.push(s);
  }
}

function applyQuality() {
  renderer.setPixelRatio(settings.quality);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.shadowMap.enabled = settings.shadows;
  sun.castShadow = settings.shadows;
  scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); });
  localStorage.setItem(SET_KEY, JSON.stringify(settings));
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false); });

// ------------------------------------------------------------------ game state
const audio = new GameAudio();
audio.setVolumes(settings.music, settings.sfx);
let terrain, world, player, mapImg, mapCanvas, waterTex;
let state = 'loading';              // loading | menu | playing | paused
let invOpen = false, showMap = true;
let camYaw = 0, camPitch = 0.35, camDist = 5.5, camCurrent = 5.5;
// camera views: 0 third-person, 1 first-person, 2 cinematic (auto-controlled)
let camMode = 0, cineShot = 0, cineShotT = 0, cineT = 0, cineYaw = 0, cineInit = false;
const CAM_NAMES = ['Third-person camera', 'First-person camera', 'Cinematic camera'];
const SHOT_LEN = [9, 7, 7, 7, 8, 7];
const cinePos = new THREE.Vector3(), cineLook = new THREE.Vector3();
let menuAngle = 0, mapTimer = 0, toastUntil = 0;
const inv = { Wood: 0, Stone: 0, Fruit: 0 };
const quest = { index: 0, totals: { Wood: 0, Stone: 0, Fruit: 0 }, visited: new Set() };
const inside = new Set();
const keys = {};
let target = null;

// ------------------------------------------------------------------ HUD helpers
function toast(msg, sec = 3) { $('toast').textContent = msg; toastUntil = performance.now() + sec * 1000; }
function refreshItems() {
  $('items').textContent = `Wood ${inv.Wood}    Stone ${inv.Stone}    Fruit ${inv.Fruit}`;
  $('invList').innerHTML = `Wood: ${inv.Wood}<br>Stone: ${inv.Stone}<br>Fruit: ${inv.Fruit}`;
}
function refreshQuest() {
  if (quest.index >= OBJECTIVES.length) { $('quest').textContent = 'All objectives complete!\nKeep exploring the island.'; return; }
  const o = OBJECTIVES[quest.index];
  let s = `Objective ${quest.index + 1}/${OBJECTIVES.length}\n${o.text}`;
  if (o.kind === 'collect') s += ` (${Math.min(quest.totals[o.item], o.amount)}/${o.amount})`;
  $('quest').textContent = s;
}
function questDone(o) { return o.kind === 'collect' ? quest.totals[o.item] >= o.amount : quest.visited.has(o.place); }
function questCheck() {
  while (quest.index < OBJECTIVES.length && questDone(OBJECTIVES[quest.index])) {
    toast('Objective complete: ' + OBJECTIVES[quest.index].text, 3.5);
    audio.quest();
    quest.index++;
  }
  refreshQuest();
}

// ------------------------------------------------------------------ environment follow (sun, sky, clouds, water)
function updateEnvironment(dt, now) {
  const p = player ? player.pos : new THREE.Vector3();
  sun.position.copy(p).addScaledVector(SUN_DIR, 150);
  sun.target.position.copy(p);
  sky.position.copy(camera.position);
  sunDisc.position.copy(camera.position).addScaledVector(SUN_DIR, 430);
  for (const c of clouds) {
    c.position.x += dt * 2.2;
    if (c.position.x - camera.position.x > 560) c.position.x -= 1120;
  }
  if (waterTex) { waterTex.offset.x += dt * 0.004; waterTex.offset.y += dt * 0.0025; }
  if (world) world.animate(now / 1000);
}

// ------------------------------------------------------------------ interaction
function updateInteraction() {
  const p = player.pos;
  let best = 2.6; target = null;
  for (const it of world.items) {
    if (it.collected) continue;
    const d = Math.hypot(it.x - p.x, it.z - p.z);
    if (d < best && Math.abs(it.y - p.y) < 2.5) { best = d; target = { kind: 'item', it }; }
  }
  for (const s of world.signs) {
    const d = Math.hypot(s.x - p.x, s.z - p.z);
    if (d < best && Math.abs(s.y - p.y) < 2.5) { best = d; target = { kind: 'sign', s }; }
  }
  $('prompt').textContent = target ? (target.kind === 'item' ? `Press E to collect ${target.it.type}` : `Press E to read ${target.s.title}`) : '';
}
function interact() {
  if (!target || state !== 'playing' || invOpen) return;
  if (target.kind === 'sign') { toast(target.s.msg, 6); audio.click(); return; }
  const it = target.it;
  if (inv[it.type] >= MAX_ITEM) { toast('Inventory full for ' + it.type); return; }
  inv[it.type]++;
  quest.totals[it.type]++;
  it.collected = true; it.root.visible = false;
  audio.collect();
  toast('+1 ' + it.type, 1.5);
  refreshItems();
  questCheck();
}
function updatePlaces() {
  const p = player.pos;
  for (const pl of world.places) {
    const d = Math.hypot(pl.x - p.x, pl.z - p.z);
    if (d < pl.radius) {
      if (!inside.has(pl.id)) {
        inside.add(pl.id);
        toast('Arrived: ' + pl.id);
        if (!quest.visited.has(pl.id)) { quest.visited.add(pl.id); questCheck(); }
      }
    } else inside.delete(pl.id);
  }
}

// ------------------------------------------------------------------ camera
function setCamMode(m, announce = false) {
  camMode = m; cineInit = false; cineShot = 0; cineShotT = 0;
  if (player) { player.mode = m; player.group.visible = m !== 1; }
  camera.fov = m === 1 ? 72 : 60; camera.updateProjectionMatrix();
  $('letterbox').classList.toggle('hidden', m !== 2);
  if (announce) toast(CAM_NAMES[m] + '  (V to change)', 2);
}

function thirdPersonCamera(dt) {
  const p = player.pos;
  const pivot = new THREE.Vector3(p.x, p.y + 1.6, p.z);
  const dir = new THREE.Vector3(Math.sin(camYaw) * Math.cos(camPitch), Math.sin(camPitch), Math.cos(camYaw) * Math.cos(camPitch));
  let allowed = camDist;
  for (let s = 1; s <= 10; s++) {                                   // terrain collision: shorten the boom
    const d = camDist * s / 10, x = pivot.x + dir.x * d, y = pivot.y + dir.y * d, z = pivot.z + dir.z * d;
    if (terrain.heightAt(x, z) > y - 0.4) { allowed = Math.max(1.2, d - 0.4); break; }
  }
  camCurrent = allowed < camCurrent ? allowed : lerp(camCurrent, allowed, Math.min(1, dt * 8));
  camera.position.copy(pivot).addScaledVector(dir, camCurrent);
  const minY = terrain.heightAt(camera.position.x, camera.position.z) + 0.6;
  if (camera.position.y < minY) camera.position.y = minY;
  camera.lookAt(pivot);
}

function firstPersonCamera(now) {
  const p = player.pos;
  const bob = player.moving && player.grounded ? Math.sin(now / 95) * 0.035 : 0;
  const head = new THREE.Vector3(p.x, p.y + 1.65 + bob, p.z);
  const dir = new THREE.Vector3(Math.sin(camYaw) * Math.cos(camPitch), Math.sin(camPitch), Math.cos(camYaw) * Math.cos(camPitch));
  camera.position.copy(head);
  camera.lookAt(head.x - dir.x, head.y - dir.y, head.z - dir.z);   // look the opposite way of the orbit offset
}

// Cinematic camera: cuts between glide shots (orbit, low front, side tracking, crane, aerial, chase) by itself.
function cinematicCamera(dt) {
  cineT += dt; cineShotT += dt;
  if (cineShotT > SHOT_LEN[cineShot]) { cineShotT = 0; cineShot = (cineShot + 1) % SHOT_LEN.length; }
  const p = player.pos, h = player.heading;
  const F = new THREE.Vector3(Math.sin(h), 0, Math.cos(h)), L = new THREE.Vector3(Math.cos(h), 0, -Math.sin(h));
  const pos = new THREE.Vector3(), look = new THREE.Vector3(p.x, p.y + 1.3, p.z);
  let fov = 55;
  switch (cineShot) {
    case 0: { const a = cineT * 0.22; pos.set(p.x + Math.cos(a) * 10, p.y + 3.2, p.z + Math.sin(a) * 10); fov = 55; break; }
    case 1: pos.copy(p).addScaledVector(F, 7).addScaledVector(L, 1.2); pos.y += 1.1; look.y = p.y + 1.5; fov = 46; break;
    case 2: pos.copy(p).addScaledVector(L, 8); pos.y += 2.2; fov = 50; break;
    case 3: pos.copy(p).addScaledVector(F, -6); pos.y += 13; look.set(p.x, p.y, p.z); fov = 60; break;
    case 4: pos.set(p.x + 14, p.y + 36, p.z + 14); look.set(p.x, p.y, p.z); fov = 64; break;
    default: pos.copy(p).addScaledVector(F, -5); pos.y += 1.2; look.copy(p).addScaledVector(F, 3); look.y = p.y + 1.5; fov = 58;
  }
  const clear = terrain.heightAt(pos.x, pos.z) + 1.3;
  if (pos.y < clear) pos.y = clear;
  if (!cineInit) { cinePos.copy(camera.position); cineLook.copy(look); cineInit = true; }
  const k = 1 - Math.exp(-dt * 2.2);
  cinePos.lerp(pos, k); cineLook.lerp(look, k);
  camera.position.copy(cinePos); camera.lookAt(cineLook);
  camera.fov += (fov - camera.fov) * k; camera.updateProjectionMatrix();
  // WASD stay relative to the view the player had when they started moving (so the moving camera never bends the path)
  if (!player.moving) cineYaw = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
}

function updateCamera(dt, now) {
  if (camMode === 1) firstPersonCamera(now);
  else if (camMode === 2) cinematicCamera(dt);
  else thirdPersonCamera(dt);
}

// ------------------------------------------------------------------ minimap
function drawMap() {
  const c = $('mapcanvas'), g = c.getContext('2d');
  g.drawImage(mapCanvas, 0, 0, c.width, c.height);
  const [u, v] = terrain.uv(player.pos.x, player.pos.z);
  g.save(); g.translate(u * c.width, v * c.height); g.rotate(player.heading);
  g.fillStyle = '#ff3030'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(-5, 5); g.closePath(); g.fill(); g.stroke();
  g.restore();
}

// ------------------------------------------------------------------ save / load
function save() {
  const d = {
    px: player.pos.x, py: player.pos.y, pz: player.pos.z, heading: player.heading, camYaw,
    inv: { ...inv }, qIndex: quest.index, totals: { ...quest.totals }, visited: [...quest.visited],
    collected: world.items.filter(i => i.collected).map(i => i.id),
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(d));
  toast('Game saved', 2);
}
function hasSave() { return !!localStorage.getItem(SAVE_KEY); }
function load() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) { toast('No save found', 2); return false; }
  const d = JSON.parse(raw);
  player.teleport(d.px, d.py, d.pz, d.heading);
  camYaw = d.camYaw ?? 0;
  Object.assign(inv, d.inv);
  quest.index = d.qIndex; quest.totals = { Wood: 0, Stone: 0, Fruit: 0, ...d.totals }; quest.visited = new Set(d.visited);
  const got = new Set(d.collected);
  for (const it of world.items) { it.collected = got.has(it.id); it.root.visible = !it.collected; }
  refreshItems(); refreshQuest();
  toast('Game loaded', 2);
  return true;
}
function newGame() {
  const s = world.spawn;
  player.teleport(s.x, s.y + 0.2, s.z, 0);
  camYaw = 0; camPitch = 0.35;
  inv.Wood = inv.Stone = inv.Fruit = 0;
  quest.index = 0; quest.totals = { Wood: 0, Stone: 0, Fruit: 0 }; quest.visited = new Set();
  inside.clear();
  for (const it of world.items) { it.collected = false; it.root.visible = true; }
  refreshItems(); questCheck();
}

// ------------------------------------------------------------------ state changes
function lockMouse() { try { const r = $('game').requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* ignored */ } }
function checkHint() {
  setTimeout(() => { if (state === 'playing') $('clickhint').classList.toggle('hidden', document.pointerLockElement === $('game')); }, 700);
}
function startPlaying() {
  audio.start();
  $('menu').classList.add('hidden'); $('pause').classList.add('hidden');
  $('hud').classList.remove('hidden');
  state = 'playing'; invOpen = false; $('inventory').classList.add('hidden');
  setCamMode(0);
  toast('Welcome to Samudragrah', 3.5);
  lockMouse(); checkHint();
}
function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused'; invOpen = false;
  $('inventory').classList.add('hidden'); $('pause').classList.remove('hidden');
  $('prompt').textContent = '';
}
function resumeGame() { $('pause').classList.add('hidden'); state = 'playing'; lockMouse(); checkHint(); }
function toMenu() {
  state = 'menu'; invOpen = false;
  document.exitPointerLock();
  $('pause').classList.add('hidden'); $('inventory').classList.add('hidden'); $('hud').classList.add('hidden');
  $('bContinue').disabled = !hasSave();
  $('menu').classList.remove('hidden');
}
function toggleInventory() {
  if (state !== 'playing') return;
  invOpen = !invOpen;
  $('inventory').classList.toggle('hidden', !invOpen);
  refreshItems();
}

// ------------------------------------------------------------------ input
addEventListener('keydown', e => {
  if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  if (state === 'playing') {
    if (e.code === 'KeyE') interact();
    else if (e.code === 'Tab') toggleInventory();
    else if (e.code === 'KeyM') { showMap = !showMap; $('minimap').classList.toggle('hidden', !showMap); }
    else if (e.code === 'KeyV') setCamMode((camMode + 1) % 3, true);
    else if (e.code === 'Escape') pauseGame();
  }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
addEventListener('mousemove', e => {
  if (state !== 'playing' || document.pointerLockElement !== $('game') || invOpen || camMode === 2) return;
  camYaw -= e.movementX * 0.0025;
  camPitch = clamp(camPitch + e.movementY * 0.0025, camMode === 1 ? -1.3 : -0.3, camMode === 1 ? 1.3 : 1.15);
});
$('game').addEventListener('click', () => { if (state === 'playing' && document.pointerLockElement !== $('game')) lockMouse(); });
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === $('game');
  $('clickhint').classList.toggle('hidden', locked || state !== 'playing');
  if (!locked && state === 'playing') pauseGame();
});

$('bNew').onclick = () => { audio.start(); audio.click(); newGame(); startPlaying(); };
$('bContinue').onclick = () => { audio.start(); audio.click(); newGame(); load(); startPlaying(); };
$('bResume').onclick = () => { audio.click(); resumeGame(); };
$('bSave').onclick = () => { audio.click(); save(); };
$('bLoad').onclick = () => { audio.click(); if (load()) resumeGame(); };
$('bMenu').onclick = () => { audio.click(); toMenu(); };
$('sMusic').value = settings.music; $('sSfx').value = settings.sfx; $('sQuality').value = String(settings.quality); $('sShadows').checked = settings.shadows;
$('sMusic').oninput = e => { settings.music = +e.target.value; audio.setVolumes(settings.music, settings.sfx); localStorage.setItem(SET_KEY, JSON.stringify(settings)); };
$('sSfx').oninput = e => { settings.sfx = +e.target.value; audio.setVolumes(settings.music, settings.sfx); localStorage.setItem(SET_KEY, JSON.stringify(settings)); };
$('sQuality').onchange = e => { settings.quality = +e.target.value; applyQuality(); };
$('sShadows').onchange = e => { settings.shadows = e.target.checked; applyQuality(); };

// ------------------------------------------------------------------ main loop
let last = performance.now();
function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!world) return;

  if (state === 'playing') {
    const input = {
      f: (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0),
      r: (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0),
      run: !!(keys.ShiftLeft || keys.ShiftRight), jump: !!keys.Space,
    };
    if (invOpen) { input.f = input.r = 0; input.jump = false; }
    player.update(dt, input, camMode === 2 ? cineYaw : camYaw);
    updateCamera(dt, now);
    updateInteraction();
    updatePlaces();
    for (const it of world.items) {                              // spin + bob nearby items
      if (it.collected || Math.abs(it.x - player.pos.x) > 60 || Math.abs(it.z - player.pos.z) > 60) continue;
      it.root.rotation.y += dt * 1.1;
      it.mesh.position.y = Math.sin(now / 500 + it.x) * 0.12;
    }
    mapTimer += dt;
    if (showMap && mapTimer > 0.1) { mapTimer = 0; drawMap(); }
    if (toastUntil && now > toastUntil) { $('toast').textContent = ''; toastUntil = 0; }
  } else if (state === 'menu') {                                 // slow fly-around behind the main menu
    if (camMode !== 0 || player.group.visible === false) setCamMode(0);
    menuAngle += dt * 0.06;
    camera.position.set(Math.cos(menuAngle) * 230, 70, Math.sin(menuAngle) * 150);
    camera.lookAt(0, 0, 0);
  }
  if (state === 'playing' || state === 'menu') updateEnvironment(dt, now);
  renderer.render(scene, camera);
}

// ------------------------------------------------------------------ boot
function makeWaterTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d'), img = g.createImageData(256, 256);
  const h = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
  const mod = (a, P) => ((a % P) + P) % P;
  const vnoise = (x, y, P) => {                                   // periodic value noise -> tiles seamlessly
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = h(mod(xi, P), mod(yi, P)), b = h(mod(xi + 1, P), mod(yi, P)), c = h(mod(xi, P), mod(yi + 1, P)), d = h(mod(xi + 1, P), mod(yi + 1, P));
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  };
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const fx = x / 256, fy = y / 256;
    const n = (vnoise(fx * 8, fy * 8, 8) + vnoise(fx * 16, fy * 16, 16) * 0.5) / 1.5;
    const v = Math.round(n * 255), o = (y * 256 + x) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = v; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(70, 40);
  return t;
}

async function boot() {
  const say = t => { $('loadText').textContent = t; };
  const pause = () => new Promise(r => setTimeout(r, 30));
  try {
    say('Loading island map...');
    // IslandMap.png (with the new place names) is shown as the minimap; IslandMapClean.png (no text) builds the terrain
    const shown = new Image(); shown.src = 'assets/IslandMap.png'; await shown.decode();
    mapImg = new Image(); mapImg.src = 'assets/IslandMapClean.png'; await mapImg.decode();
    mapCanvas = document.createElement('canvas');
    mapCanvas.width = 240; mapCanvas.height = 131;
    mapCanvas.getContext('2d').drawImage(shown, 0, 0, 240, 131);

    say('Sculpting the island from the map...');
    await pause();
    terrain = new Terrain(mapImg);
    const island = new THREE.Mesh(terrain.buildMesh(), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    island.receiveShadow = true;
    scene.add(island);

    say('Painting the ground (grass, sand, rock, roads)...');
    await pause();
    island.material.map = terrain.buildGroundTexture(1024);

    // ocean: transparent so the sandy sea floor and surf foam show through the shallows
    waterTex = makeWaterTexture();
    const water = new THREE.Mesh(new THREE.PlaneGeometry(terrain.W * 4, terrain.H * 4),
      new THREE.MeshPhongMaterial({ color: col(0.10, 0.60, 0.74), transparent: true, opacity: 0.80, shininess: 90, specular: col(0.6, 0.75, 0.8), bumpMap: waterTex, bumpScale: 0.35, depthWrite: false }));
    water.rotation.x = -Math.PI / 2;
    water.renderOrder = 2;
    scene.add(water);

    say('Planting trees, building villages and the city...');
    await pause();
    world = buildWorld(scene, terrain);

    player = new Player(terrain, world.colliders);
    player.onStep = () => audio.step();
    player.onJump = () => audio.jump();
    await player.load(scene, say);
    player.teleport(world.spawn.x, world.spawn.y + 0.2, world.spawn.z, 0);

    applyQuality();
    refreshItems(); refreshQuest();
    $('loading').classList.add('hidden');
    toMenu();
  } catch (e) {
    console.error(e);
    $('loadText').innerHTML = 'Error: ' + (e.message || e) + '<br><small>Open the browser console (F12) for details. Are you running via start-game.bat (not by double-clicking index.html)?</small>';
  }
}
boot();
requestAnimationFrame(tick);
