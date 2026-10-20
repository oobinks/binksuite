// Your files in R2: generated art, print-file ZIPs, spreadsheet previews. Login required for everything.
import { newApp, HttpError } from "../app";
import { products } from "../db/schema";
import { eq } from "drizzle-orm";

const MAX_UPLOAD = 95 * 1024 * 1024; // the free plan accepts request bodies up to 100 MB
const SAFE_NAME = /^[a-z0-9][a-z0-9._-]{0,120}$/i;

export const fileRoutes = newApp()
  .get("/files/*", async (c) => {
    const key = decodeURIComponent(c.req.path.replace(/^\/api\/files\//, ""));
    if (!key.startsWith("products/") || key.includes("..")) throw new HttpError(404, "Not found");
    const obj = await c.env.FILES.get(key);
    if (!obj) throw new HttpError(404, "That file isn't there any more.");
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set("etag", obj.httpEtag);
    headers.set("Cache-Control", "private, max-age=31536000, immutable");
    // Artwork SVGs are cleaned before they're stored; this makes sure nothing in one can ever run.
    headers.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src data:");
    headers.set("X-Content-Type-Options", "nosniff");
    const download = c.req.query("download");
    if (download && SAFE_NAME.test(download)) headers.set("Content-Disposition", `attachment; filename="${download}"`);
    return new Response(obj.body, { headers });
  })
  .put("/files/products/:productId/:name", async (c) => {
    const { productId, name } = c.req.param();
    // Packs (.zip), listing photos (.jpg), and the files buyers download (.xlsx, .pdf).
    const TYPES: Record<string, string> = {
      zip: "application/zip",
      jpg: "image/jpeg",
      pdf: "application/pdf",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
    const type = TYPES[name.split(".").pop()?.toLowerCase() ?? ""] ?? null;
    if (!SAFE_NAME.test(name) || !type) throw new HttpError(400, "Only .zip, .jpg, .pdf and .xlsx files can be uploaded.");
    const product = await c.get("db").select({ id: products.id }).from(products).where(eq(products.id, productId)).get();
    if (!product) throw new HttpError(404, "No such product");
    const size = Number(c.req.header("content-length") ?? 0);
    if (!size || size > MAX_UPLOAD) throw new HttpError(413, "That pack is too big (max 95 MB). Keep fewer images.");
    const key = `products/${productId}/${name}`;
    // R2 needs to know the length up front when streaming.
    const { readable, writable } = new FixedLengthStream(size);
    c.req.raw.body?.pipeTo(writable);
    await c.env.FILES.put(key, readable, { httpMetadata: { contentType: type } });
    return c.json({ ok: true, key });
  });
