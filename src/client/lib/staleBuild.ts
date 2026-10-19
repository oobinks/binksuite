// After an update goes live, an open tab still points at the old build's files, so
// loading a part of the app on demand (e.g. the spreadsheet builder) fails. Reload
// once to pick up the new version instead of showing a confusing error.
import { isStaleBuild } from "../../shared/staleBuild";

export { isStaleBuild };

const KEY = "bs:staleReload";

/** Reload to the new version (at most once a minute, so it can never loop). */
export function reloadForUpdate(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* storage blocked: still reload once */
  }
  window.location.reload();
  return true;
}

export function watchForUpdates() {
  window.addEventListener("vite:preloadError", (event) => {
    if (reloadForUpdate()) event.preventDefault();
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (isStaleBuild(event.reason)) reloadForUpdate();
  });
}
