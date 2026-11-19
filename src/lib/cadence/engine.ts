import {
  MEDIA_ERR_ABORTED,
  describePlaybackFailure,
  mediaTypeCandidates,
  verdictFromCanPlayType,
  type PlaybackFailure,
  type ProbeResult,
} from "./playback";
import { BANDS } from "./types";

type TimeHandler = (time: number, duration: number) => void;
type EndedHandler = () => void;
type ErrorHandler = (failure: PlaybackFailure) => void;

const PROBE_TIMEOUT_MS = 8000;

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
  private onError: ErrorHandler | null = null;

  bind(onTime: TimeHandler, onEnded: EndedHandler, onError?: ErrorHandler) {
    this.onTime = onTime;
    this.onEnded = onEnded;
    this.onError = onError ?? null;
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
    audio.onerror = () => {
      const mediaError = audio.error;
      if (!mediaError || mediaError.code === MEDIA_ERR_ABORTED) return;
      this.onError?.(describePlaybackFailure(mediaError, mediaError));
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

  /**
   * Reject a file the playback element cannot decode, before it is stored.
   * Uses a throwaway `Audio()` — the same media element playback uses — so
   * codec support matches the engine rather than Web Audio's decoder.
   */
  async probe(file: File): Promise<ProbeResult> {
    try {
      const audio = new Audio();
      const candidates = mediaTypeCandidates(file.name, file.type);
      const verdict = verdictFromCanPlayType(candidates.map((type) => audio.canPlayType(type)));
      if (verdict === "unplayable") return { ok: false };
      return await probeElement(audio, file);
    } catch {
      return { ok: false };
    }
  }

  async loadAndPlay(blob: Blob) {
    this.ensure();
    const audio = this.audio;
    const ctx = this.ctx;
    if (!audio || !ctx) return;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = URL.createObjectURL(blob);
    audio.src = this.url;
    await this.start(audio, ctx);
  }

  async toggle() {
    this.ensure();
    const audio = this.audio;
    const ctx = this.ctx;
    if (!audio || !ctx || !audio.src) return false;
    if (!audio.paused) {
      audio.pause();
      return false;
    }
    await this.start(audio, ctx);
    return true;
  }

  private async start(audio: HTMLAudioElement, ctx: AudioContext) {
    try {
      await ctx.resume();
      await audio.play();
    } catch (err) {
      // play() can reject with NotAllowedError before the element's error event
      // reports that the source itself is undecodable.
      const mediaError = await mediaErrorIfBlocked(audio, err);
      throw describePlaybackFailure(err, mediaError);
    }
    if (audio.error && audio.error.code !== MEDIA_ERR_ABORTED) {
      throw describePlaybackFailure(audio.error, audio.error);
    }
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

function mediaErrorIfBlocked(audio: HTMLAudioElement, err: unknown): Promise<MediaError | null> {
  if (audio.error) return Promise.resolve(audio.error);
  const name = err instanceof DOMException ? err.name : "";
  if (name !== "NotAllowedError") return Promise.resolve(audio.error);
  return new Promise((resolve) => {
    let done = false;
    const pending: { timer?: ReturnType<typeof setTimeout> } = {};
    const finish = () => {
      if (done) return;
      done = true;
      if (pending.timer !== undefined) clearTimeout(pending.timer);
      audio.removeEventListener("error", finish);
      resolve(audio.error);
    };
    pending.timer = setTimeout(finish, 100);
    audio.addEventListener("error", finish);
  });
}

function probeElement(audio: HTMLAudioElement, blob: Blob): Promise<ProbeResult> {
  const url = URL.createObjectURL(blob);
  audio.preload = "auto";
  audio.muted = true;
  audio.volume = 0;

  return new Promise((resolve) => {
    let settled = false;
    const pending: { timer?: ReturnType<typeof setTimeout> } = {};

    const release = () => {
      audio.pause();
      audio.removeAttribute("src");
      try {
        audio.load();
      } catch {
        // The element is being discarded either way.
      }
      URL.revokeObjectURL(url);
    };
    const finish = (result: ProbeResult) => {
      if (settled) return;
      settled = true;
      if (pending.timer !== undefined) clearTimeout(pending.timer);
      audio.removeEventListener("canplay", onReady);
      audio.removeEventListener("error", onFail);
      release();
      resolve(result);
    };
    const onReady = () => {
      if (audio.error && audio.error.code !== MEDIA_ERR_ABORTED) {
        finish({ ok: false });
        return;
      }
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      finish({ ok: true, duration });
    };
    const onFail = () => finish({ ok: false });

    pending.timer = setTimeout(() => {
      if (!audio.error && audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        onReady();
        return;
      }
      finish({ ok: false });
    }, PROBE_TIMEOUT_MS);

    audio.addEventListener("canplay", onReady);
    audio.addEventListener("error", onFail);
    try {
      audio.src = url;
    } catch {
      finish({ ok: false });
    }
  });
}

export const engine = new DeskEngine();
