/**
 * Ton für den Beamer: CC0-Effekte (Kenney), Meeresrauschen und Vögel als Synthese,
 * dazu optional eine leise, endlose Marimba-Musik im Inselstil (generativ).
 */

const SAMPLES = [
  'dice-shake', 'dice-throw-1', 'dice-throw-2', 'step-grass-000', 'step-grass-001', 'step-grass-002', 'step-grass-003', 'step-grass-004',
  'step-wood-000', 'step-wood-001', 'step-wood-002', 'land', 'thud', 'bell', 'rumble', 'confirm', 'select', 'bong', 'question', 'wrong',
  'tick', 'whoosh-up', 'whoosh-down', 'sparkle', 'pop', 'jingle-win', 'jingle-results', 'jingle-start', 'jingle-good', 'jingle-swap',
  'jingle-fanfare', 'jingle-bad', 'jingle-alarm',
] as const;
export type SampleName = (typeof SAMPLES)[number];

export class BoardAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private ambience!: GainNode;
  private music!: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private musicTimer: number | null = null;
  private birdTimer: number | null = null;
  enabled = { sound: true, music: false, ambience: true };

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Muss aus einer Nutzeraktion heraus aufgerufen werden (Autoplay-Regeln). */
  async unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.sfx = this.gain(0.8);
      this.ambience = this.gain(0);
      this.music = this.gain(0);
      void this.loadAll();
      this.startOcean();
      this.scheduleBirds();
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
    this.apply();
  }

  private gain(v: number) {
    const g = this.ctx!.createGain();
    g.gain.value = v;
    g.connect(this.master);
    return g;
  }

  setEnabled(patch: Partial<BoardAudio['enabled']>) {
    Object.assign(this.enabled, patch);
    this.apply();
  }

  private apply() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfx.gain.setTargetAtTime(this.enabled.sound ? 0.8 : 0, t, 0.1);
    this.ambience.gain.setTargetAtTime(this.enabled.sound && this.enabled.ambience ? 0.22 : 0, t, 0.6);
    this.music.gain.setTargetAtTime(this.enabled.sound && this.enabled.music ? 0.16 : 0, t, 0.6);
    if (this.enabled.music && this.musicTimer === null) this.startMusic();
    if (!this.enabled.music && this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private async loadAll() {
    await Promise.all(
      SAMPLES.map(async (name) => {
        try {
          const res = await fetch(`/assets/audio/${name}.ogg`);
          const buf = await this.ctx!.decodeAudioData(await res.arrayBuffer());
          this.buffers.set(name, buf);
        } catch {
          /* Datei fehlt oder Format nicht unterstützt */
        }
      }),
    );
  }

  play(name: SampleName, opts: { volume?: number; rate?: number; delay?: number } = {}) {
    if (!this.ctx || !this.enabled.sound) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const g = this.ctx.createGain();
    g.gain.value = opts.volume ?? 1;
    src.connect(g).connect(this.sfx);
    src.start(this.ctx.currentTime + (opts.delay ?? 0));
  }

  step(onWood = false) {
    const n = onWood ? `step-wood-00${Math.floor(Math.random() * 3)}` : `step-grass-00${Math.floor(Math.random() * 5)}`;
    this.play(n as SampleName, { volume: 0.55, rate: 0.95 + Math.random() * 0.15 });
  }

  /** Meeresrauschen: gefiltertes Rauschen mit langsamer Lautstärkewelle. */
  private startOcean() {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = last * 0.985 + (Math.random() * 2 - 1) * 0.15; // braunes Rauschen
        d[i] = last;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    const swell = ctx.createGain();
    swell.gain.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.4;
    lfo.connect(lfoGain).connect(swell.gain);
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.07;
    const lfo2Gain = ctx.createGain();
    lfo2Gain.gain.value = 300;
    lfo2.connect(lfo2Gain).connect(filter.frequency);
    src.connect(filter).connect(swell).connect(this.ambience);
    src.start();
    lfo.start();
    lfo2.start();
  }

  /** Gelegentliches Vogelzwitschern. */
  private scheduleBirds() {
    const chirp = () => {
      if (!this.ctx) return;
      const ctx = this.ctx;
      const t0 = ctx.currentTime;
      const notes = 2 + Math.floor(Math.random() * 4);
      const base = 2200 + Math.random() * 1400;
      for (let i = 0; i < notes; i++) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        const st = t0 + i * (0.09 + Math.random() * 0.05);
        o.frequency.setValueAtTime(base, st);
        o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.5), st + 0.06);
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.18, st + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.08);
        o.connect(g).connect(this.ambience);
        o.start(st);
        o.stop(st + 0.1);
      }
      this.birdTimer = window.setTimeout(chirp, 4000 + Math.random() * 9000);
    };
    this.birdTimer = window.setTimeout(chirp, 3000);
  }

  /** Generative Marimba: I–vi–IV–V in C-Dur, pentatonische Melodie, 96 BPM. */
  private startMusic() {
    const ctx = this.ctx!;
    const beat = 60 / 96 / 2; // Achtel
    const chords = [
      [48, 52, 55],
      [45, 48, 52],
      [41, 45, 48],
      [43, 47, 50],
    ];
    const penta = [60, 62, 64, 67, 69, 72, 74, 76];
    let step = 0;
    let next = ctx.currentTime + 0.1;
    const note = (midi: number, time: number, vel: number, dur = 0.5) => {
      const f = 440 * Math.pow(2, (midi - 69) / 12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(vel, time + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      for (const [mult, amp] of [
        [1, 1],
        [4, 0.25],
        [10, 0.06],
      ] as const) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f * mult;
        const og = ctx.createGain();
        og.gain.value = amp;
        o.connect(og).connect(g);
        o.start(time);
        o.stop(time + dur + 0.05);
      }
      g.connect(this.music);
    };
    const tick = () => {
      while (next < ctx.currentTime + 0.4) {
        const bar = Math.floor(step / 8) % chords.length;
        const pos = step % 8;
        const chord = chords[bar]!;
        if (pos === 0) note(chord[0]! - 12, next, 0.35, 1.2);
        if (pos % 2 === 0) note(chord[(pos / 2) % 3]!, next, 0.18, 0.4);
        if (pos === 3 || pos === 7) note(chord[1]! + 12, next, 0.12, 0.3);
        if (Math.random() < 0.45) note(penta[Math.floor(Math.random() * penta.length)]!, next + (Math.random() < 0.3 ? beat / 2 : 0), 0.14, 0.35);
        next += beat;
        step += 1;
      }
    };
    tick();
    this.musicTimer = window.setInterval(tick, 150);
  }

  dispose() {
    if (this.musicTimer !== null) clearInterval(this.musicTimer);
    if (this.birdTimer !== null) clearTimeout(this.birdTimer);
    void this.ctx?.close();
    this.ctx = null;
  }
}
