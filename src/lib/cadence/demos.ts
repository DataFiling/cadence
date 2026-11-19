import type { StoredTrack } from "./types";

const FILES = [
  { title: "Night Bus", url: "/demos/night-bus.wav" },
  { title: "Copper Wire", url: "/demos/copper-wire.wav" },
  { title: "Glass Hour", url: "/demos/glass-hour.wav" },
] as const;

export async function makeDemos(): Promise<StoredTrack[]> {
  const tracks: StoredTrack[] = [];
  let added = Date.now();
  for (const file of FILES) {
    const response = await fetch(file.url);
    if (!response.ok) throw new Error(`Could not load ${file.title}`);
    tracks.push({
      id: crypto.randomUUID(),
      title: file.title,
      duration: 12,
      added: added++,
      blob: await response.blob(),
    });
  }
  return tracks;
}
