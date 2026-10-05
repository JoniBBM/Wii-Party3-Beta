/**
 * Ton für den Beamer – vier Spuren mit eigener Lautstärke (live aus der Regie):
 * - Effekte: Kenney-Klänge (CC0) und eigene Effekte (ElevenLabs), lautheitsangeglichen
 * - Musik: Stücke im Inselstil, gestreamt, mit weicher Überblendung (auch beim Wiederholen)
 * - Sprache: Kommentator und Spielerklärung; die Musik wird dabei leiser
 * - Umgebung: Meeresrauschen und Vögel als Synthese
 */
import type { ShowSettings } from '@insel/shared';

const KENNEY = [
  'dice-shake', 'dice-throw-1', 'dice-throw-2', 'step-grass-000', 'step-grass-001', 'step-grass-002', 'step-grass-003', 'step-grass-004',
  'step-wood-000', 'step-wood-001', 'step-wood-002', 'land', 'thud', 'bell', 'rumble', 'confirm', 'select', 'bong', 'question', 'wrong',
  'tick', 'whoosh-up', 'whoosh-down', 'sparkle', 'pop', 'jingle-win', 'jingle-results', 'jingle-start', 'jingle-good', 'jingle-swap',
  'jingle-fanfare', 'jingle-bad', 'jingle-alarm',
] as const;

/** Eigene Effekte (ElevenLabs Sound Effects) unter /assets/audio/fx/. */
export const FX = [
  'jubel', 'aww', 'applaus', 'trommelwirbel', 'vulkan', 'feder', 'ufo', 'flugzeug', 'platsch', 'liane', 'zauber', 'posaune', 'feuerwerk',
  'kaefig', 'salto', 'fass', 'frage', 'richtig', 'falsch', 'pfiff', 'swoosh', 'hoehle', 'zug', 'fallen', 'lava', 'aerger', 'blase',
] as const;

export type FxName = (typeof FX)[number];
export type SampleName = (typeof KENNEY)[number] | FxName;
export type MusicTrack = 'insel' | 'lobby' | 'spannung' | 'finale';

interface Sample {
  buffer: AudioBuffer;
  /** Ausgleich auf gleiche Lautheit */
  gain: number;
  /** Stille am Anfang überspringen (s) */
  offset: number;
}

/** Wahrgenommene Lautstärke: Schieberegler 0..1 → Verstärkung. */
const curve = (v: number) => Math.pow(Math.max(0, Math.min(1, v)), 1.6);

const XFADE = 3.2; // s Überblendung beim Wiederholen eines Stücks
const SWITCH = 1.6; // s Überblendung beim Wechsel des Stücks

export type AudioLevels = Pick<ShowSettings, 'master' | 'music' | 'musicVolume' | 'sound' | 'soundVolume' | 'voice' | 'voiceVolume' | 'ambience' | 'ambienceVolume'>;

interface Deck {
  track: MusicTrack;
  el: HTMLAudioElement;
  gain: GainNode;
  src: MediaElementAudioSourceNode;
  /** Nachfolger fürs Wiederholen schon gestartet */
  handedOver: boolean;
  dying: boolean;
}

export class BoardAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private ambience!: GainNode;
  private music!: GainNode;
  private duck!: GainNode;
  private voice!: GainNode;
  private samples = new Map<string, Sample>();
  private loading = new Map<string, Promise<Sample | null>>();
  private birdTimer: number | null = null;
  private musicTimer: number | null = null;
  private decks: Deck[] = [];
  private wanted: { track: MusicTrack; loop: boolean; then: MusicTrack | null } | null = null;
  private voiceSrc: AudioBufferSourceNode | null = null;
  private voiceDone: (() => void) | null = null;
  private levels: AudioLevels = {
    master: 0.9,
    music: true,
    musicVolume: 0.45,
    sound: true,
    soundVolume: 0.8,
    voice: true,
    voiceVolume: 0.9,
    ambience: true,
    ambienceVolume: 0.5,
  };

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Spricht gerade jemand? */
  get speaking() {
    return this.voiceSrc !== null;
  }

  /** Muss aus einer Nutzeraktion heraus aufgerufen werden (Autoplay-Regeln). */
  async unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfx = this.bus(this.master);
      this.ambience = this.bus(this.master);
      this.duck = this.bus(this.master);
      this.music = this.bus(this.duck);
      this.voice = this.bus(this.master);
      this.ambience.gain.value = 0;
      this.music.gain.value = 0;
      void this.preload();
      this.startOcean();
      this.scheduleBirds();
      this.musicTimer = window.setInterval(() => this.tickMusic(), 250);
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
    this.apply();
    this.syncMusic();
  }

  private bus(to: AudioNode) {
    const g = this.ctx!.createGain();
    g.connect(to);
    return g;
  }

  /** Lautstärken und Schalter aus der Beamer-Show übernehmen. */
  setLevels(s: Partial<AudioLevels>) {
    const musicWas = this.levels.music;
    Object.assign(this.levels, s);
    this.apply();
    if (musicWas !== this.levels.music) this.syncMusic();
  }

  private apply() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const L = this.levels;
    this.master.gain.setTargetAtTime(curve(L.master) * 1.1, t, 0.08);
    this.sfx.gain.setTargetAtTime(L.sound ? curve(L.soundVolume) : 0, t, 0.08);
    this.ambience.gain.setTargetAtTime(L.ambience ? curve(L.ambienceVolume) * 0.45 : 0, t, 0.5);
    this.music.gain.setTargetAtTime(L.music ? curve(L.musicVolume) * 0.9 : 0, t, 0.4);
    this.voice.gain.setTargetAtTime(L.voice ? curve(L.voiceVolume) * 1.25 : 0, t, 0.08);
  }

  // -------------------------------------------------------------------------
  // Effekte
  // -------------------------------------------------------------------------

  private urlOf(name: string) {
    return (FX as readonly string[]).includes(name) ? `/assets/audio/fx/${name}.mp3` : `/assets/audio/${name}.ogg`;
  }

  private async preload() {
    await Promise.all([...KENNEY, ...FX].map((n) => this.load(n, this.urlOf(n), (FX as readonly string[]).includes(n))));
  }

  /** Datei laden und dekodieren; eigene Effekte werden auf gleiche Lautheit gebracht. */
  private load(key: string, url: string, normalize: boolean): Promise<Sample | null> {
    const cached = this.loading.get(key);
    if (cached) return cached;
    const p = (async () => {
      if (!this.ctx) return null;
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const buffer = await this.ctx.decodeAudioData(await res.arrayBuffer());
        const sample = normalize ? analyse(buffer) : { buffer, gain: 1, offset: 0 };
        this.samples.set(key, sample);
        return sample;
      } catch {
        return null; // Datei fehlt oder Format nicht unterstützt
      }
    })();
    this.loading.set(key, p);
    return p;
  }

  play(name: SampleName, opts: { volume?: number; rate?: number; delay?: number } = {}) {
    if (!this.ctx || !this.levels.sound) return;
    const s = this.samples.get(name);
    if (!s) return;
    const src = this.ctx.createBufferSource();
    src.buffer = s.buffer;
    src.playbackRate.value = opts.rate ?? 1;
    const g = this.ctx.createGain();
    g.gain.value = (opts.volume ?? 1) * s.gain;
    src.connect(g).connect(this.sfx);
    src.start(this.ctx.currentTime + (opts.delay ?? 0), s.offset);
  }

  splash(volume = 1) {
    this.play('platsch', { volume });
  }

  boing() {
    this.play('feder');
  }

  ufo() {
    this.play('ufo', { volume: 0.9 });
  }

  creak() {
    this.play('fass');
  }

  step(onWood = false) {
    const n = onWood ? `step-wood-00${Math.floor(Math.random() * 3)}` : `step-grass-00${Math.floor(Math.random() * 5)}`;
    this.play(n as SampleName, { volume: 0.45, rate: 0.95 + Math.random() * 0.15 });
  }

  // -------------------------------------------------------------------------
  // Musik
  // -------------------------------------------------------------------------

  /** Gewünschtes Stück; wechselt weich. `then` folgt, wenn ein nicht wiederholtes Stück endet. */
  setMusic(track: MusicTrack | null, opts: { loop?: boolean; then?: MusicTrack } = {}) {
    const next = track ? { track, loop: opts.loop ?? true, then: opts.then ?? null } : null;
    if (next && this.wanted && this.wanted.track === next.track && this.wanted.loop === next.loop) return;
    this.wanted = next;
    this.syncMusic();
  }

  get musicTrack() {
    return this.wanted?.track ?? null;
  }

  private syncMusic() {
    if (!this.ctx) return;
    const want = this.levels.music ? this.wanted : null;
    const live = this.decks.filter((d) => !d.dying);
    if (want && live.some((d) => d.track === want.track)) return;
    for (const d of live) this.fadeOut(d, SWITCH);
    if (want) this.startDeck(want.track, SWITCH, 0);
  }

  private startDeck(track: MusicTrack, fade: number, at: number) {
    const ctx = this.ctx!;
    const el = new Audio(`/assets/audio/music/${track}.mp3`);
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    el.currentTime = at;
    const src = ctx.createMediaElementSource(el);
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    src.connect(gain).connect(this.music);
    const deck: Deck = { track, el, gain, src, handedOver: false, dying: false };
    this.decks.push(deck);
    el.addEventListener('ended', () => this.onEnded(deck));
    void el.play().then(
      () => gain.gain.setTargetAtTime(1, ctx.currentTime, fade / 4),
      () => this.kill(deck),
    );
  }

  private onEnded(deck: Deck) {
    this.kill(deck);
    const w = this.wanted;
    if (w && w.track === deck.track && !w.loop) {
      this.wanted = w.then ? { track: w.then, loop: true, then: null } : null;
      this.syncMusic();
    }
  }

  private fadeOut(d: Deck, secs: number) {
    if (d.dying || !this.ctx) return;
    d.dying = true;
    d.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, secs / 4);
    window.setTimeout(() => this.kill(d), secs * 1000 + 200);
  }

  private kill(d: Deck) {
    d.dying = true;
    d.el.pause();
    d.el.removeAttribute('src');
    try {
      d.src.disconnect();
      d.gain.disconnect();
    } catch {
      /* schon getrennt */
    }
    this.decks = this.decks.filter((x) => x !== d);
  }

  /** Endlosschleife: kurz vor Schluss dasselbe Stück von vorn einblenden. */
  private tickMusic() {
    const w = this.wanted;
    if (!w?.loop || !this.levels.music) return;
    for (const d of this.decks) {
      if (d.dying || d.handedOver || d.track !== w.track) continue;
      const dur = d.el.duration;
      if (!Number.isFinite(dur) || dur < XFADE * 3) continue;
      if (d.el.currentTime >= dur - XFADE - 0.3) {
        d.handedOver = true;
        this.startDeck(w.track, XFADE, 0);
        this.fadeOut(d, XFADE);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Sprache (Kommentator, Erklärung)
  // -------------------------------------------------------------------------

  /** Sprachdatei vorab laden (z. B. die Erklärung). Liefert die Dauer in Sekunden. */
  async prepare(url: string): Promise<number> {
    const s = await this.load(url, url, false);
    return s?.buffer.duration ?? 0;
  }

  /**
   * Sprachdatei abspielen; die Musik wird solange leiser. Unterbricht eine laufende Ansage nur
   * mit `interrupt`. Liefert true, wenn bis zum Ende gesprochen wurde.
   */
  async say(url: string, opts: { interrupt?: boolean } = {}): Promise<boolean> {
    if (!this.ctx || !this.levels.voice) return false;
    if (this.voiceSrc && !opts.interrupt) return false;
    const s = await this.load(url, url, false);
    if (!s || !this.ctx) return false;
    if (this.voiceSrc && !opts.interrupt) return false;
    this.stopVoice();
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = s.buffer;
    src.connect(this.voice);
    this.voiceSrc = src;
    this.duck.gain.setTargetAtTime(0.32, ctx.currentTime, 0.12);
    return new Promise<boolean>((resolve) => {
      let done = false;
      const finish = (complete: boolean) => {
        if (done) return;
        done = true;
        if (this.voiceSrc === src) {
          this.voiceSrc = null;
          this.voiceDone = null;
          this.duck.gain.setTargetAtTime(1, ctx.currentTime + 0.2, 0.5);
        }
        resolve(complete);
      };
      this.voiceDone = () => finish(false);
      src.onended = () => finish(true);
      src.start();
    });
  }

  stopVoice() {
    const src = this.voiceSrc;
    if (!src) return;
    const done = this.voiceDone;
    this.voiceSrc = null;
    this.voiceDone = null;
    try {
      src.onended = null;
      src.stop();
      src.disconnect();
    } catch {
      /* schon beendet */
    }
    if (this.ctx) this.duck.gain.setTargetAtTime(1, this.ctx.currentTime, 0.4);
    done?.();
  }

  // -------------------------------------------------------------------------
  // Umgebung
  // -------------------------------------------------------------------------

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

  dispose() {
    if (this.birdTimer !== null) clearTimeout(this.birdTimer);
    if (this.musicTimer !== null) clearInterval(this.musicTimer);
    this.stopVoice();
    for (const d of [...this.decks]) this.kill(d);
    void this.ctx?.close();
    this.ctx = null;
  }
}

/** Lautheit (RMS) auf ein gemeinsames Maß bringen und Stille am Anfang finden. */
function analyse(buffer: AudioBuffer): Sample {
  const ch = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(ch.length / 40000));
  let sum = 0;
  let n = 0;
  let peak = 0;
  let first = -1;
  for (let i = 0; i < ch.length; i += step) {
    const v = Math.abs(ch[i]!);
    if (first < 0 && v > 0.015) first = i;
    peak = Math.max(peak, v);
    sum += v * v;
    n++;
  }
  const rms = Math.sqrt(sum / Math.max(1, n));
  const gain = rms > 0 ? Math.min(0.16 / rms, 0.95 / Math.max(peak, 1e-3), 4) : 1;
  const offset = first > 0 ? Math.max(0, first / buffer.sampleRate - 0.01) : 0;
  return { buffer, gain, offset };
}
