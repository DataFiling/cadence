import type { FFmpeg } from "@ffmpeg/ffmpeg";

export type LibraryActivity = {
  label: string;
  /** 0–100 once conversion has started. Null while the core is still loading. */
  progress: number | null;
};

export type ConvertResult = { ok: true; blob: Blob } | { ok: false; fatal: boolean };

const CONVERT_TIMEOUT_MS = 120_000;

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function conversionActivity(
  fileName: string,
  phase: "preparing" | "converting",
  progress: number | null,
): LibraryActivity {
  const name = `"${fileName.trim() || "Untitled"}"`;
  if (phase === "preparing") {
    const pct = progress == null ? null : clampPercent(progress);
    const suffix = pct == null ? "" : ` ${pct}%`;
    return { label: `Preparing to convert ${name}…${suffix}`, progress: pct };
  }
  const pct = clampPercent(progress ?? 0);
  return { label: `Converting ${name}… ${pct}%`, progress: pct };
}

/** Virtual-FS input name. The extension is the only part ffmpeg uses to sniff a container. */
export function ffmpegInputName(filename: string): string {
  const base = filename.replace(/\\/g, "/").split("/").pop() ?? "";
  const match = /\.([a-z0-9]{1,8})$/i.exec(base.trim());
  const ext = match?.[1]?.toLowerCase() ?? "bin";
  return `input.${ext}`;
}

function coreAsset(name: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return new URL(`${prefix}ffmpeg/${name}`, window.location.href).href;
}

function isWav(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) return false;
  const head = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  const wave = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
  return head === "RIFF" && wave === "WAVE";
}

let loading: Promise<FFmpeg> | null = null;

function forgetFFmpeg() {
  loading = null;
}

async function startFFmpeg(onProgress: (progress: number | null) => void): Promise<FFmpeg> {
  const [{ FFmpeg }, { toBlobURL }, workerMod] = await Promise.all([
    import("@ffmpeg/ffmpeg"),
    import("@ffmpeg/util"),
    import("@ffmpeg/ffmpeg/worker?worker&url"),
  ]);
  let lastPercent = -1;
  const reportWasm = (received: number, total: number) => {
    if (total <= 0) return;
    const pct = Math.round((received / total) * 100);
    if (pct === lastPercent) return;
    lastPercent = pct;
    onProgress(pct);
  };
  // The glue script is tiny. Only the wasm download moves the bar, so it does
  // not fill up and then start over.
  const coreURL = await toBlobURL(coreAsset("ffmpeg-core.js"), "text/javascript");
  const wasmURL = await toBlobURL(
    coreAsset("ffmpeg-core.wasm"),
    "application/wasm",
    true,
    (event) => {
      reportWasm(event.received, event.total);
    },
  );
  const ffmpeg = new FFmpeg();
  const workerUrl = new URL(workerMod.default, window.location.href).href;
  await ffmpeg.load({
    classWorkerURL: workerUrl,
    coreURL,
    wasmURL,
  });
  return ffmpeg;
}

function getFFmpeg(onProgress: (progress: number | null) => void): Promise<FFmpeg> {
  if (!loading) {
    loading = startFFmpeg(onProgress).catch((err) => {
      loading = null;
      throw err;
    });
  }
  return loading;
}

async function removeQuiet(ffmpeg: FFmpeg, name: string) {
  try {
    await ffmpeg.deleteFile(name);
  } catch {
    // The file was never written, or the worker has already stopped.
  }
}

/**
 * Turn a file the media element rejected into 16-bit PCM WAV.
 * The core is loaded once, and only from the files shipped with the app.
 */
export async function convertToWav(
  file: File,
  onProgress: (activity: LibraryActivity) => void,
): Promise<ConvertResult> {
  let ffmpeg: FFmpeg;
  try {
    onProgress(conversionActivity(file.name, "preparing", null));
    ffmpeg = await getFFmpeg((progress) => {
      onProgress(conversionActivity(file.name, "preparing", progress));
    });
  } catch {
    return { ok: false, fatal: true };
  }

  const input = ffmpegInputName(file.name);
  const output = "output.wav";
  let lastPct = -1;
  const onFfmpegProgress = ({ progress }: { progress: number }) => {
    const pct = clampPercent(progress * 100);
    if (pct === lastPct) return;
    lastPct = pct;
    onProgress(conversionActivity(file.name, "converting", pct));
  };

  try {
    onProgress(conversionActivity(file.name, "converting", 0));
    const { fetchFile } = await import("@ffmpeg/util");
    await ffmpeg.writeFile(input, await fetchFile(file));
    ffmpeg.on("progress", onFfmpegProgress);
    const code = await ffmpeg.exec(
      ["-i", input, "-vn", "-acodec", "pcm_s16le", output],
      CONVERT_TIMEOUT_MS,
    );
    if (code !== 0) return { ok: false, fatal: false };
    const data = await ffmpeg.readFile(output);
    if (typeof data === "string") return { ok: false, fatal: false };
    const bytes = new Uint8Array(data.byteLength);
    bytes.set(data);
    if (!isWav(bytes)) return { ok: false, fatal: false };
    return { ok: true, blob: new Blob([bytes], { type: "audio/wav" }) };
  } catch {
    try {
      ffmpeg.terminate();
    } catch {
      // The worker is already gone.
    }
    forgetFFmpeg();
    return { ok: false, fatal: true };
  } finally {
    ffmpeg.off("progress", onFfmpegProgress);
    await removeQuiet(ffmpeg, input);
    await removeQuiet(ffmpeg, output);
  }
}
