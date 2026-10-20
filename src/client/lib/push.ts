// Phone notifications on this device: what it supports, and turning them on or off.
import { fromB64urlBytes } from "./b64";

export type PushSupport = "ok" | "ios-needs-home-screen" | "unsupported";

const ua = () => navigator.userAgent;
export const isIos = () => /iPhone|iPad|iPod/.test(ua()) || (/Macintosh/.test(ua()) && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

export function pushSupport(): PushSupport {
  // iPhone and iPad only allow notifications for apps added to the home screen.
  if (isIos() && !standalone()) return "ios-needs-home-screen";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  return "ok";
}

/** A friendly name for this device, e.g. "iPhone" or "Android phone (Chrome)". */
export function deviceLabel(): string {
  const u = ua();
  const browser = /Edg\//.test(u) ? "Edge" : /Firefox\//.test(u) ? "Firefox" : /Chrome\//.test(u) ? "Chrome" : /Safari\//.test(u) ? "Safari" : "browser";
  if (/iPhone/.test(u)) return "iPhone";
  if (/iPad/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1)) return "iPad";
  if (/Android/.test(u)) return `Android phone (${browser})`;
  if (/Macintosh/.test(u)) return `Mac (${browser})`;
  if (/Windows/.test(u)) return `Windows PC (${browser})`;
  return `This device (${browser})`;
}

export function registerServiceWorker() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
}

/** This device's current subscription, if notifications are on here. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== "ok") return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Ask permission and subscribe. Returns the subscription to send to BinkSuite. */
export async function subscribe(publicKey: string): Promise<PushSubscriptionJSON> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error(permission === "denied" ? "Notifications are blocked for BinkSuite. Allow them in your phone's settings, then try again." : "Notifications weren't allowed.");
  const reg = (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  const old = await reg.pushManager.getSubscription();
  // A subscription made with an older key won't work any more.
  if (old) await old.unsubscribe();
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64urlBytes(publicKey) });
  return sub.toJSON();
}
