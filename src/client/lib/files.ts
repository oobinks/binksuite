// Your stored files. Generated art is saved as base64 text (so the Worker does no
// heavy work); your browser turns it back into a picture here.
import { useQuery } from "@tanstack/react-query";

export const fileUrl = (key: string, download?: string) =>
  `/api/files/${key.split("/").map(encodeURIComponent).join("/")}${download ? `?download=${encodeURIComponent(download)}` : ""}`;

export async function loadImageSrc(key: string): Promise<string> {
  const res = await fetch(fileUrl(key), { credentials: "same-origin" });
  if (!res.ok) throw new Error("Couldn't load that image");
  if (key.endsWith(".b64")) return `data:image/jpeg;base64,${(await res.text()).trim()}`;
  return URL.createObjectURL(await res.blob());
}

export function useImageSrc(key: string | null | undefined) {
  return useQuery({ queryKey: ["file", key], queryFn: () => loadImageSrc(key!), enabled: !!key, staleTime: Infinity, gcTime: 30 * 60_000 });
}

/** Save an image to the device as a .jpg. */
export async function downloadImage(key: string, name: string) {
  const src = await loadImageSrc(key);
  const a = document.createElement("a");
  a.href = src;
  a.download = name;
  a.click();
}

/** Save a file you made on this device to the product's storage. Returns its key. */
export async function uploadProductFile(productId: string, name: string, body: Blob, type: string): Promise<string> {
  const res = await fetch(fileUrl(`products/${productId}/${name}`), { method: "PUT", credentials: "same-origin", headers: { "content-type": type }, body });
  if (!res.ok) {
    const msg = await res.json().catch(() => null);
    throw new Error(msg?.error ?? `Upload failed (${res.status})`);
  }
  return ((await res.json()) as { key: string }).key;
}

/** A tidy file name buyers see on Etsy, e.g. "The Ultimate Budget - Printable A4.pdf". */
export const buyerFileName = (title: string, suffix: string, ext: string) =>
  `${title.replace(/[^\w .()&+-]/g, "").replace(/\s+/g, " ").trim().slice(0, 60) || "Download"}${suffix ? ` - ${suffix}` : ""}.${ext}`;

export interface Deliverable {
  key: string;
  name: string;
}
