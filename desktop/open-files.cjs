const { randomUUID } = require("node:crypto");
const { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } = require("node:fs");
const { stat } = require("node:fs/promises");
const path = require("node:path");
const { fileURLToPath, pathToFileURL } = require("node:url");

const AUDIO_TYPES = new Map([
  [".aac", "audio/aac"],
  [".flac", "audio/flac"],
  [".m4a", "audio/mp4"],
  [".mp3", "audio/mpeg"],
  [".ogg", "audio/ogg"],
  [".opus", "audio/ogg"],
  [".wav", "audio/wav"],
  [".webm", "audio/webm"],
]);
const AUDIO_PATH = "/__audio/";

function audioPaths(args, directory) {
  const paths = new Map();

  for (const argument of args) {
    if (typeof argument !== "string" || argument.startsWith("-")) continue;

    const unquoted = argument.replace(/^(["'])(.*)\1$/s, "$2");
    const fileUrl = /^file:/i.test(unquoted);
    if (!fileUrl && /^[a-z][a-z\d+.-]+:\/\//i.test(unquoted)) continue;

    try {
      const filename = fileUrl ? fileURLToPath(unquoted) : path.resolve(directory, unquoted);
      if (!AUDIO_TYPES.has(path.extname(filename).toLowerCase())) continue;

      const key = process.platform === "win32" ? filename.toLowerCase() : filename;
      if (!paths.has(key)) paths.set(key, filename);
    } catch {
      // Invalid file URLs and paths are ignored.
    }
  }

  return [...paths.values()];
}

async function selectedAudioFiles(paths) {
  const checked = await Promise.all(paths.map(async (filename) => {
    const info = await stat(filename).catch(() => null);
    return info?.isFile()
      ? { filename, name: path.basename(filename), type: AUDIO_TYPES.get(path.extname(filename).toLowerCase()) }
      : null;
  }));
  return checked.filter(Boolean);
}

function createFilePreferences(directory) {
  const filename = path.join(directory, "file-opening.json");
  let enabled = true;

  try {
    enabled = JSON.parse(readFileSync(filename, "utf8")).openFilesInExistingPlayer !== false;
  } catch {
    // A fresh profile or invalid settings starts with the default.
  }

  return {
    get: () => enabled,
    set(value) {
      if (enabled === value) return enabled;

      const temporary = `${filename}.tmp`;
      try {
        mkdirSync(directory, { recursive: true });
        writeFileSync(temporary, JSON.stringify({ openFilesInExistingPlayer: value }), { mode: 0o600 });
        renameSync(temporary, filename);
      } catch {
        try {
          rmSync(temporary, { force: true });
        } catch {
          // Report the original save failure.
        }
        throw new Error("Could not save the file-opening preference");
      }
      enabled = value;
      return enabled;
    },
  };
}

function createAudioTransfer(net, allowedOrigin) {
  const tokens = new Map();
  return {
    issue(files) {
      return files.map(({ filename, name, type }) => {
        const token = randomUUID();
        tokens.set(token, { filename, type });
        setTimeout(() => tokens.delete(token), 5 * 60 * 1000).unref();
        return { name, url: `cadence://app${AUDIO_PATH}${token}` };
      });
    },
    async respond(request, url) {
      const origin = request.headers.get("origin");
      if (request.method !== "GET" || (origin && origin !== allowedOrigin)) {
        return new Response(null, { status: 403 });
      }

      const token = url.pathname.slice(AUDIO_PATH.length);
      const selected = tokens.get(token);
      if (!selected) return new Response(null, { status: 404 });
      tokens.delete(token);

      try {
        const file = await net.fetch(pathToFileURL(selected.filename).href);
        if (!file.ok) return new Response(null, { status: 404 });
        const headers = {
          "Content-Type": selected.type,
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": allowedOrigin,
          "X-Content-Type-Options": "nosniff",
        };
        return new Response(file.body, { headers });
      } catch {
        return new Response(null, { status: 404 });
      }
    },
  };
}

module.exports = { AUDIO_PATH, audioPaths, selectedAudioFiles, createFilePreferences, createAudioTransfer };
