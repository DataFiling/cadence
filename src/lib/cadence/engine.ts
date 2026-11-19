import { BANDS } from "./types";

type TimeHandler = (time: number, duration: number) => void;
type EndedHandler = () => void;

class DeskEngine {
  private ctx: AudioContext | null = null;
  private audio: HTMLAudioElement | null = null;
  private filters: BiquadFilterNode[] = [];
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private bins: Uint8Array<ArrayBuffer> | null = null;
  private url: string | null = null;
  private wired = false;
  private onTime: TimeHandler | null = null;
  private onEnded: EndedHandler | null = null;

  bind(onTime: TimeHandler, onEnded: EndedHandler) {
    this.onTime = onTime;
    this.onEnded = onEnded;
  }

  private ensure() {
    if (this.wired) return;
    const ctx = new AudioContext();
    const audio = new Audio();
    audio.preload = "auto";
    const source = ctx.createMediaElementSource(audio);
    const filters = BANDS.map((freq, i) => {
      const node = ctx.createBiquadFilter();
      node.type = i === 0 ? "lowshelf" : i === BANDS.length - 1 ? "highshelf" : "peaking";
      node.frequency.value = freq;
      node.Q.value = 1;
      node.gain.value = 0;
      return node;
    });
    const master = ctx.createGain();
    master.gain.value = 0.85;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.78;
    let node: AudioNode = source;
    for (const filter of filters) {
      node.connect(filter);
      node = filter;
    }
    node.connect(master);
    master.connect(analyser);
    analyser.connect(ctx.destination);

    audio.ontimeupdate = () => {
      this.onTime?.(audio.currentTime, Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    audio.onended = () => this.onEnded?.();
    audio.onplay = () => {
      this.onTime?.(audio.currentTime, Number.isFinite(audio.duration) ? audio.duration : 0);
    };

    this.ctx = ctx;
    this.audio = audio;
    this.filters = filters;
    this.master = master;
    this.analyser = analyser;
    this.bins = new Uint8Array(analyser.frequencyBinCount);
    this.wired = true;
  }

  unlock() {
    this.ensure();
    void this.ctx?.resume();
  }

  setBands(gains: number[]) {
    this.ensure();
    gains.forEach((gain, i) => {
      const filter = this.filters[i];
      if (filter) filter.gain.value = gain;
    });
  }

  setVolume(volume: number, muted: boolean) {
    this.ensure();
    if (!this.master) return;
    this.master.gain.value = muted ? 0 : Math.min(1, Math.max(0, volume));
  }

  async loadAndPlay(blob: Blob) {
    this.ensure();
    const audio = this.audio;
    const ctx = this.ctx;
    if (!audio || !ctx) return;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = URL.createObjectURL(blob);
    audio.src = this.url;
    await ctx.resume();
    await audio.play();
  }

  async toggle() {
    this.ensure();
    const audio = this.audio;
    const ctx = this.ctx;
    if (!audio || !ctx || !audio.src) return false;
    await ctx.resume();
    if (audio.paused) {
      await audio.play();
      return true;
    }
    audio.pause();
    return false;
  }

  seek(time: number) {
    if (!this.audio) return;
    const duration = Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
    this.audio.currentTime = Math.min(Math.max(0, time), duration || time);
  }

  pause() {
    this.audio?.pause();
  }

  playing() {
    return Boolean(this.audio && !this.audio.paused && this.audio.src);
  }

  bars(): Uint8Array<ArrayBuffer> | null {
    if (!this.analyser || !this.bins) return null;
    this.analyser.getByteFrequencyData(this.bins);
    return this.bins;
  }
}

export const engine = new DeskEngine();
