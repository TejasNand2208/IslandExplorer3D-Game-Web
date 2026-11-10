// Procedural audio (WebAudio): no sound files needed. Starts after the first click.
export class GameAudio {
  constructor() { this.ctx = null; this.musicVol = 0.5; this.sfxVol = 0.8; }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    this.ctx = new C();
    this.music = this.ctx.createGain(); this.sfx = this.ctx.createGain();
    this.music.connect(this.ctx.destination); this.sfx.connect(this.ctx.destination);
    this.setVolumes(this.musicVol, this.sfxVol);

    // soft drone
    for (const [f, v] of [[110, 0.05], [165, 0.03]]) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.value = f; g.gain.value = v;
      o.connect(g); g.connect(this.music); o.start();
    }
    // pentatonic arpeggio scheduler
    const scale = [220, 261.6, 293.7, 329.6, 392, 440];
    const pattern = [0, 2, 4, 5, 4, 2, 1, 3, 0, 2, 4, 3, 2, 1, 0, 1, 2, 4, 5, 4, 3, 2, 3, 1, 0, 2, 3, 4, 2, 1, 0, 1];
    let step = 0, next = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => {
      while (next < this.ctx.currentTime + 1.0) {
        this.note(scale[pattern[step % pattern.length]], 1.4, 'sine', 0.16, next, this.music);
        next += 0.5; step++;
      }
    }, 250);
  }

  setVolumes(m, s) {
    this.musicVol = m; this.sfxVol = s;
    if (this.ctx) { this.music.gain.value = m; this.sfx.gain.value = s; }
  }

  note(freq, dur, type, vol, when, dest) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(vol, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(dest);
    o.start(when); o.stop(when + dur + 0.05);
  }

  tone(freq, dur = 0.12, vol = 0.3, delay = 0, type = 'sine') {
    if (!this.ctx) return;
    this.note(freq, dur, type, vol, this.ctx.currentTime + delay, this.sfx);
  }

  collect() { [660, 880, 1320].forEach((f, i) => this.tone(f, 0.15, 0.3, i * 0.07)); }
  jump() { this.tone(300, 0.1, 0.25); this.tone(420, 0.12, 0.25, 0.06); }
  step() { this.tone(70 + Math.random() * 25, 0.07, 0.18, 0, 'triangle'); }
  quest() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 0.3, i * 0.12)); }
  click() { this.tone(800, 0.05, 0.2); }
}
