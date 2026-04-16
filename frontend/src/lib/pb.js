import PocketBase from "pocketbase";

const PB_URL = import.meta.env.VITE_PB_URL ?? "https://fieldtrack-kenya.fly.dev";

export const pb = new PocketBase(PB_URL);
pb.authStore.onChange(() => {}, true);

export const API = PB_URL;

export function fileUrl(record, filename, thumb = "") {
  if (!filename) return null;
  const f = Array.isArray(filename) ? filename[0] : filename;
  if (!f) return null;
  const base = `${API}/api/files/${record.collectionId}/${record.id}/${f}`;
  return thumb ? `${base}?thumb=${thumb}` : base;
}
