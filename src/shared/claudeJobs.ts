// ✨ Claude's to-do list in plain words, for the Claude bar.

/** A job in plain words: what Claude is doing, for which product. */
export function describeJob(job: { title: string; kind: string }): string {
  const t = job.title.trim();
  const after = (prefix: RegExp) => t.replace(prefix, "").trim();
  const rules: [RegExp, (rest: string) => string][] = [
    [/^(Research your idea|Score niche):/i, (r) => `🔬 Researching the market for “${r}”`],
    [/^Write brief:/i, (r) => `📝 Planning and designing “${r}”`],
    [/^🔍 Design review:/i, (r) => `🔍 Reviewing and polishing the design of “${r}”`],
    [/^Build files:/i, (r) => `📊 Updating the design of “${r}”`],
    [/^Generate art:/i, (r) => `🎨 Drawing the artwork for “${r}”`],
    [/^Style mockups:/i, (r) => `🖼️ Setting up mockups for “${r}”`],
    [/^Write listing:/i, (r) => `✍️ Writing the Etsy title, tags and description for “${r}”`],
    [/^🎯 Today's ideas/i, () => "🎯 Coming up with today's product ideas"],
    [/^💡 Suggest ideas/i, () => "💡 Brainstorming ideas for you"],
    [/^Trend Radar/i, () => "📡 Estimating what's trending"],
  ];
  for (const [re, say] of rules) if (re.test(t)) return say(after(re).replace(/^[:\s]+/, ""));
  return job.kind === "svg" ? `🎨 ${t}` : `✨ ${t}`;
}
