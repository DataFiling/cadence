const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

const DESKTOP_ENTRY = "cadence.desktop";

const AUDIO_MIME_TYPES = [
  "audio/mpeg",
  "audio/vnd.wave",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/x-vorbis+ogg",
  "audio/flac",
  "audio/x-flac",
  "audio/mp4",
  "audio/aac",
  "audio/webm",
  "audio/x-opus+ogg",
];

function createDefaultPlayerManager({
  platform = process.platform,
  openExternal,
  runCommand = execFileAsync,
} = {}) {
  async function queryLinuxDefault() {
    try {
      const { stdout } = await runCommand("xdg-mime", ["query", "default", "audio/mpeg"]);
      return stdout.trim() === DESKTOP_ENTRY;
    } catch {
      return null;
    }
  }

  async function getStatus() {
    if (platform === "linux") {
      return {
        supported: true,
        platform,
        mode: "direct",
        isDefault: await queryLinuxDefault(),
      };
    }

    if (platform === "win32") {
      return {
        supported: true,
        platform,
        mode: "system-settings",
        isDefault: null,
      };
    }

    if (platform === "darwin") {
      return {
        supported: true,
        platform,
        mode: "manual",
        isDefault: null,
      };
    }

    return {
      supported: false,
      platform,
      mode: "manual",
      isDefault: null,
    };
  }

  async function setAsDefault() {
    if (platform === "linux") {
      try {
        await runCommand("xdg-mime", ["default", DESKTOP_ENTRY, ...AUDIO_MIME_TYPES]);
        const isDefault = await queryLinuxDefault();
        return {
          ok: true,
          isDefault: isDefault ?? true,
          message: "Cadence is now set as your default audio player.",
        };
      } catch {
        return {
          ok: false,
          isDefault: false,
          message: "Couldn’t update default apps. Make sure xdg-utils is installed.",
        };
      }
    }

    if (platform === "win32") {
      if (typeof openExternal !== "function") {
        return {
          ok: false,
          isDefault: null,
          message: "Couldn’t open Windows Default Apps.",
        };
      }
      try {
        await openExternal("ms-settings:defaultapps");
        return {
          ok: true,
          isDefault: null,
          message: "Opened Windows Default Apps. Select CADENCE to set it as your default audio player.",
        };
      } catch {
        return {
          ok: false,
          isDefault: null,
          message: "Couldn’t open Windows Default Apps. Open Settings → Apps → Default apps and choose CADENCE.",
        };
      }
    }

    if (platform === "darwin") {
      return {
        ok: true,
        isDefault: null,
        message: "In Finder, choose an audio file → Get Info → Open with: CADENCE → Change All.",
      };
    }

    return {
      ok: false,
      isDefault: null,
      message: "Setting the default player isn’t supported on this system.",
    };
  }

  return { getStatus, setAsDefault };
}

module.exports = {
  DESKTOP_ENTRY,
  AUDIO_MIME_TYPES,
  createDefaultPlayerManager,
};
