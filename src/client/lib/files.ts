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
