import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { PLAYER_H, ANIM_FILES } from './config.js';

const WALK = 5.0, RUN = 8.0, JUMP_V = 7.5, GRAVITY = 20, RADIUS = 0.35;
const BLANK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const wrapAngle = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export class Player {
  constructor(terrain, colliders) {
    this.terrain = terrain;
    this.colliders = colliders;
    this.pos = new THREE.Vector3();
    this.vy = 0;
    this.grounded = true;
    this.airTime = 0;
    this.heading = 0;
    this.turning = 0;           // +1 turning left, -1 turning right, 0 none
    this.mode = 0;              // camera mode: 0 third-person, 1 first-person, 2 cinematic
    this.turnRate = 1.8;
    this.group = new THREE.Group();
    this.model = null;
    this.mixer = null;
    this.actions = {};
    this.currentAnim = null;
    this.stepTimer = 0;
    this.bob = 0;
    this.moving = false;
    this.onStep = () => {};
    this.onJump = () => {};
  }

  async load(scene, report = () => {}) {
    scene.add(this.group);
    try {
      report('Loading character (Aj.fbx)...');
      const model = await new FBXLoader().loadAsync('assets/Aj.fbx');
      const box = new THREE.Box3().setFromObject(model, true);
      const size = box.getSize(new THREE.Vector3());
      if (size.y > 0.001) model.scale.multiplyScalar(PLAYER_H / size.y);
      const box2 = new THREE.Box3().setFromObject(model, true);
      model.position.y -= box2.min.y;               // feet on the ground
      model.traverse(o => { if (o.isMesh || o.isSkinnedMesh) { o.frustumCulled = false; o.castShadow = true; } });
      this.model = new THREE.Group();
      this.model.add(model);
      this.group.add(this.model);
      this.mixer = new THREE.AnimationMixer(model);
      await this.loadAnimations(report);
    } catch (e) {
      console.warn('Character failed to load, using placeholder.', e);
      const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.1, 4, 8), new THREE.MeshLambertMaterial({ color: 0xe8a33d }));
      cap.position.y = PLAYER_H / 2;
      this.model = new THREE.Group();
      this.model.add(cap);
      this.group.add(this.model);
    }
  }

  async loadAnimations(report) {
    // The animation files contain the skin + textures too; skip decoding their embedded textures (saves RAM/time).
    const mgr = new THREE.LoadingManager();
    mgr.setURLModifier(url => (url.startsWith('blob:') || url.startsWith('data:')) ? BLANK : url);
    const loader = new FBXLoader(mgr);
    const clips = {};
    for (const [name, candidates] of Object.entries(ANIM_FILES)) {
      for (const file of candidates) {
        try {
          report('Loading animation: ' + name + '...');
          const fbx = await loader.loadAsync('assets/anims/' + encodeURIComponent(file) + '.fbx');
          const clip = fbx.animations && fbx.animations[0];
          fbx.traverse(o => { if (o.geometry) o.geometry.dispose(); });
          if (!clip) continue;
          // no root motion: the game moves the character, not the animation
          const stripRot = name === 'turnLeft' || name === 'turnRight';
          clip.tracks = clip.tracks.filter(t => !/Hips\.position/.test(t.name) && !(stripRot && /Hips\.quaternion/.test(t.name)));
          clip.name = name;
          clips[name] = clip;
          break;
        } catch (e) { /* file not present - try next name */ }
      }
    }
    const make = (name, clip) => { const a = this.mixer.clipAction(clip); this.actions[name] = a; return a; };
    if (clips.idle) make('idle', clips.idle);
    if (clips.run) make('run', clips.run);
    if (clips.jump) {
      const a = make('jump', clips.jump);
      a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true;
      a.timeScale = Math.max(1, clips.jump.duration / 0.85);   // squeeze the whole jump into the air time
    }
    if (clips.turnLeft) make('turnLeft', clips.turnLeft);
    if (clips.turnRight) make('turnRight', clips.turnRight);
    const turnClip = clips.turnLeft || clips.turnRight;
    if (turnClip) this.turnRate = Math.min(3.5, Math.max(1.2, (Math.PI / 2) / Math.max(0.2, turnClip.duration)));
    this.play('idle');
  }

  play(name) {
    const next = this.actions[name];
    if (!next || this.currentAnim === name) return;
    const prev = this.actions[this.currentAnim];
    next.reset().fadeIn(0.18).play();
    if (prev) prev.fadeOut(0.18);
    this.currentAnim = name;
  }

  teleport(x, y, z, heading = 0) {
    this.pos.set(x, y, z);
    this.vy = 0;
    this.heading = heading;
    this.turning = 0;
    this.group.position.copy(this.pos);
  }

  canStand(nx, nz, len) {
    const t = this.terrain;
    const h = t.heightAt(nx, nz);
    if (h < -0.6) return false;                                     // deep water
    if (h - this.pos.y > 0.9) return false;                         // too high to step up
    if (this.grounded && (h - t.heightAt(this.pos.x, this.pos.z)) / len > 1.2) return false; // too steep
    return true;
  }

  move(mx, mz) {
    const len = Math.hypot(mx, mz);
    if (len < 1e-6) return;
    const p = this.pos;
    if (this.canStand(p.x + mx, p.z + mz, len)) { p.x += mx; p.z += mz; }
    else if (this.canStand(p.x + mx, p.z, Math.abs(mx) + 1e-6)) p.x += mx;
    else if (this.canStand(p.x, p.z + mz, Math.abs(mz) + 1e-6)) p.z += mz;
    const hw = this.terrain.W / 2 - 4, hh = this.terrain.H / 2 - 4;
    p.x = Math.max(-hw, Math.min(hw, p.x));
    p.z = Math.max(-hh, Math.min(hh, p.z));
    this.colliders.resolve(p, RADIUS);
  }

  update(dt, input, camYaw) {
    const speed = input.run ? RUN : WALK;
    this.moving = false;
    if (input.f || input.r) {
      const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
      let dx = fx * input.f + rx * input.r, dz = fz * input.f + rz * input.r;
      const l = Math.hypot(dx, dz);
      dx /= l; dz /= l;
      this.move(dx * speed * dt, dz * speed * dt);
      this.heading += wrapAngle(Math.atan2(dx, dz) - this.heading) * Math.min(1, dt * 14);
      this.moving = true;
      this.turning = 0;
    } else if (this.mode === 0 && this.grounded && this.actions.turnLeft && this.actions.turnRight) {
      // turn in place (with the turn animations) when the camera has swung far away from where Aj faces
      const faceTarget = Math.atan2(-Math.sin(camYaw), -Math.cos(camYaw));
      const diff = wrapAngle(faceTarget - this.heading);
      if (!this.turning && Math.abs(diff) > 0.9) this.turning = Math.sign(diff);
      if (this.turning) {
        if (Math.abs(diff) < 0.12) this.turning = 0;
        else this.heading += Math.sign(diff) * Math.min(Math.abs(diff), this.turnRate * dt);
      }
    } else this.turning = 0;

    if (this.mode === 1) this.heading = Math.atan2(-Math.sin(camYaw), -Math.cos(camYaw));   // first person: body follows the view

    // jump + gravity
    if (input.jump && this.grounded) { this.vy = JUMP_V; this.grounded = false; this.onJump(); }
    this.vy -= GRAVITY * dt;
    this.pos.y += this.vy * dt;
    const g = this.terrain.heightAt(this.pos.x, this.pos.z);
    if (this.pos.y <= g + 0.02 && this.vy <= 0) { this.pos.y = g; this.vy = 0; this.grounded = true; }
    else if (this.pos.y > g + 0.08) this.grounded = false;
    this.airTime = this.grounded ? 0 : this.airTime + dt;

    // footsteps
    if (this.moving && this.grounded) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) { this.onStep(); this.stepTimer = input.run ? 0.3 : 0.5; }
    }

    // visuals
    this.group.position.copy(this.pos);
    this.model.rotation.y = this.heading;
    if (this.mixer && Object.keys(this.actions).length) {
      let state = 'idle';
      if (!this.grounded && this.airTime > 0.04 && this.actions.jump) state = 'jump';
      else if (this.moving && this.actions.run) { state = 'run'; this.actions.run.timeScale = Math.max(0.75, speed / RUN); }
      else if (this.turning) state = this.turning > 0 ? 'turnLeft' : 'turnRight';
      this.play(state);
      this.mixer.update(dt);
    } else {                                                        // no clips: simple procedural bounce
      this.bob += dt * (this.moving ? (input.run ? 14 : 9) : 0);
      this.model.position.y = this.moving ? Math.abs(Math.sin(this.bob)) * 0.08 : 0;
    }
  }
}
