const DB_NAME    = "fieldtrack-offline";
const STORE_NAME = "queue";
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

export async function enqueue(action) {
  const db    = await openDB();
  const store = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME);
  store.add({ ...action, ts: Date.now() });
}

export async function getQueue() {
  const db    = await openDB();
  const store = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME);
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

export async function dequeue(id) {
  const db    = await openDB();
  const store = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME);
  store.delete(id);
}

export async function flushQueue(pb) {
  const items = await getQueue();
  if (!items.length) return 0;
  let flushed = 0;
  for (const item of items) {
    try {
      if (item.type === "create") {
        await pb.collection(item.collection).create(item.data);
      } else if (item.type === "update") {
        await pb.collection(item.collection).update(item.recordId, item.data);
      }
      await dequeue(item.id);
      flushed++;
    } catch (err) {
      console.warn("[OfflineQueue] Failed:", err);
    }
  }
  return flushed;
}

export function isOnline() { return navigator.onLine; }
