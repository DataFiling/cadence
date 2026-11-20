import type { StoredTrack, TrackMeta } from "./types";

const DB_NAME = "cadence-v2";
const STORE = "tracks";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open the library"));
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Library request failed"));
  });
}

export async function listTracks(): Promise<TrackMeta[]> {
  const db = await openDb();
  const rows = await reqToPromise(db.transaction(STORE, "readonly").objectStore(STORE).getAll());
  db.close();
  const tracks = (rows as StoredTrack[]).map(({ id, title, duration, added, converted }) => ({
    id,
    title,
    duration,
    added,
    converted: Boolean(converted),
  }));
  tracks.sort((a, b) => a.added - b.added);
  return tracks;
}

export async function getTrackBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  const row = await reqToPromise(db.transaction(STORE, "readonly").objectStore(STORE).get(id));
  db.close();
  if (!row) return null;
  return (row as StoredTrack).blob;
}

export async function putTrack(track: StoredTrack): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(track);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not save the track"));
  });
  db.close();
}

export async function deleteTrack(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not remove the track"));
  });
  db.close();
}
