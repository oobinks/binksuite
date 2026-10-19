/** The error a browser gives when an old tab asks for a file a newer build replaced. */
export function isStaleBuild(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(msg);
}
