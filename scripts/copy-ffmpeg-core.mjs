import { copyFileSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "vendor", "ffmpeg-lgpl");
const dest = path.join(root, "public", "ffmpeg");
const files = ["ffmpeg-core.js", "ffmpeg-core.wasm"];

mkdirSync(dest, { recursive: true });
for (const name of files) {
  const from = path.join(srcDir, name);
  statSync(from);
  copyFileSync(from, path.join(dest, name));
}
