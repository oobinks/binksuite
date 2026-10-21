#!/usr/bin/env node
// ✨ Helper for Claude Code sessions working through BinkSuite's to-do list.
// Reads BINKSUITE_URL and BINKSUITE_AGENT_KEY from the environment (set in the
// Claude Code environment settings). Never prints the key.
//
//   node scripts/claude-jobs.mjs check              connection test
//   node scripts/claude-jobs.mjs list               save waiting jobs to .claude-jobs/ and list them
//   node scripts/claude-jobs.mjs claim <id>         mark a job as being worked on
//   node scripts/claude-jobs.mjs answer <id> <file> send an answer (JSON or SVG file)
//   node scripts/claude-jobs.mjs preview <svg> [png] render an SVG to PNG to look at it
//   node scripts/claude-jobs.mjs wait [seconds]     wait for new jobs (default 240 s)
//   node scripts/claude-jobs.mjs done <count> [note] tell BinkSuite the session is finished
//   node scripts/claude-jobs.mjs usage              send your Claude plan's limits to BinkSuite
//                                                   (check and done do this too)
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = ".claude-jobs";
// Forgiving about how the address was typed: "binksuite.example.workers.dev/settings/" works too.
const rawUrl = (process.env.BINKSUITE_URL ?? "").trim();
const base = rawUrl ? (/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`).replace(/^(https?:\/\/[^/]+).*$/i, "$1") : "";
// …and about stray quotes, spaces or a doubled "BINKSUITE_AGENT_KEY=" from pasting.
const key = (process.env.BINKSUITE_AGENT_KEY ?? "").trim().replace(/^BINKSUITE_AGENT_KEY=/, "").replace(/^["']|["']$/g, "").trim();
const [cmd, ...args] = process.argv.slice(2);
const file = (id) => join(DIR, id.replace(/[^a-z0-9_-]+/gi, "_"));

async function call(method, path, body) {
  if (!base || !key) {
    console.error("BINKSUITE_URL and BINKSUITE_AGENT_KEY must be set in the Claude Code environment (Settings → environment variables).");
    process.exit(2);
  }
  const res = await fetch(`${base}/api/agent${path}`, {
    method,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }).catch((e) => {
    console.error(`Couldn't reach ${base}: ${e.message}. Is the site's domain allowed in the environment's network settings?`);
    process.exit(2);
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function list() {
  const { status, data } = await call("GET", "/jobs");
  if (status !== 200) return console.error(`Error ${status}: ${data.error ?? ""}`), process.exit(1);
  mkdirSync(DIR, { recursive: true });
  for (const j of data.jobs) writeFileSync(`${file(j.id)}.job.json`, JSON.stringify(j, null, 2));
  console.log(`${data.jobs.length} job(s) waiting.`);
  for (const j of data.jobs) {
    console.log(`- ${j.id}  [${j.kind}] ${j.title}${j.product ? `  (${j.product.format}: ${j.product.title})` : ""}${j.previousProblem ? `\n    ⚠ previous answer was sent back: ${j.previousProblem}` : ""}\n    → ${file(j.id)}.job.json`);
  }
  return data.jobs.length;
}

/**
 * Your Claude plan's session and weekly limits. Claude Code reports them alongside
 * every reply, so ask for the tiniest possible one and keep the report lines.
 */
function readUsageEvents() {
  return new Promise((resolve) => {
    const events = [];
    let buf = "";
    let p;
    try {
      p = spawn("claude", ["-p", "Reply with just: ok", "--output-format", "stream-json", "--verbose", "--model", "haiku"], { stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      return resolve(events);
    }
    const stop = setTimeout(() => p.kill(), 90_000);
    p.stdout.on("data", (d) => {
      buf += d;
      for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (line.includes('"rate_limit_event"')) events.push(line.slice(0, 4000));
      }
    });
    p.on("error", () => (clearTimeout(stop), resolve(events)));
    p.on("close", () => (clearTimeout(stop), resolve(events)));
  });
}

async function reportUsage() {
  const events = await readUsageEvents();
  if (!events.length) return console.log("Couldn't read the Claude plan limits this time (that's fine, carry on).");
  const { status, data } = await call("POST", "/usage", { events: events.slice(-5) });
  if (status === 200 && data.usage)
    console.log(`Claude plan: session ${data.usage.session ? `${data.usage.session.usedPercent}%` : "?"} used, weekly ${data.usage.weekly ? `${data.usage.weekly.usedPercent}%` : "?"} used.`);
  else console.log(`Couldn't send the plan limits (${status}).`);
}

async function preview(svgPath, pngPath = svgPath.replace(/\.svg$/i, "") + ".png") {
  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    console.error("playwright-core isn't installed. Run: npm install --no-save playwright-core");
    process.exit(2);
  }
  const svg = readFileSync(svgPath, "utf8");
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
  const page = await browser.newPage({ viewport: { width: 800, height: 1000 } });
  await page.setContent(`<html><body style="margin:0;background:#fff">${svg.replace(/<svg/i, '<svg style="width:800px;height:1000px;display:block"')}</body></html>`);
  await page.screenshot({ path: pngPath });
  await browser.close();
  console.log(`Saved ${pngPath}. Open it with the Read tool to check the artwork.`);
}

switch (cmd) {
  case "check": {
    const { status, data } = await call("GET", "/jobs");
    console.log(status === 200 ? `Connected ✓ ${data.jobs.length} job(s) waiting.` : `Not connected (${status}): ${data.error ?? ""}`);
    if (status === 200) await reportUsage();
    process.exit(status === 200 ? 0 : 1);
  }
  case "usage":
    await reportUsage();
    break;
  case "list":
    await list();
    break;
  case "claim": {
    const { data } = await call("POST", `/jobs/${encodeURIComponent(args[0])}/claim`, {});
    console.log(data.ok ? "Claimed." : "Someone else has it (or it's gone).");
    break;
  }
  case "answer": {
    const [id, path] = args;
    const answer = readFileSync(path, "utf8");
    const { status, data } = await call("POST", `/jobs/${encodeURIComponent(id)}/answer`, { answer });
    if (status === 200) console.log(`Accepted ✓ ${data.task ? `Task now: ${data.task.state} (${data.task.title}). ` : ""}${data.jobsWaiting} job(s) waiting.`);
    else console.log(`Sent back (${status}): ${data.problem ?? data.error ?? "unknown problem"}\nFix the answer and send it again.`);
    process.exit(status === 200 ? 0 : 1);
  }
  case "preview":
    await preview(args[0], args[1]);
    break;
  case "wait": {
    const until = Date.now() + Number(args[0] ?? 240) * 1000;
    while (Date.now() < until) {
      const { data } = await call("GET", "/jobs");
      if (data.jobs?.length) {
        console.log(`${data.jobs.length} new job(s). Run list.`);
        process.exit(0);
      }
      await new Promise((r) => setTimeout(r, 20_000));
    }
    console.log("No new jobs.");
    process.exit(3);
  }
  case "done": {
    const { status } = await call("POST", "/done", { answered: Number(args[0] ?? 0), note: args.slice(1).join(" ") || undefined });
    console.log(status === 200 ? "Reported to BinkSuite." : `Couldn't report (${status}).`);
    await reportUsage();
    break;
  }
  case "lint-sheet":
    await lintSheet(args[0]);
    break;
  default:
    console.log("Commands: check | list | claim <id> | answer <id> <file> | preview <svg> [png] | lint-sheet <file> | wait [s] | done <n> [note] | usage");
}

/**
 * Check a spreadsheet design (a whole answer with "sheet" in it, or just the design)
 * the way BinkSuite will: what gets dropped, what the example numbers work out to,
 * and how it measures up to the premium bar. Fix everything it flags before answering.
 */
async function lintSheet(path) {
  let m;
  try {
    m = await import(new URL("../src/shared/sheetSpec.ts", import.meta.url).href);
  } catch (e) {
    console.log(`(Can't run the checker on this Node version: ${e.message}. Check the design by hand against the Design rules.)`);
    return;
  }
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const design = raw.sheet ?? raw;
  const { spec, dropped } = m.tidySheetSpec(design, design.title ?? "Spreadsheet");
  const v = m.previewValues(spec);
  const sheets = m.dataSheets(spec).length + 1 + (m.hasDashboard(spec) ? 1 : 0) + (spec.lists.length ? 1 : 0);
  const fmt = (x, t) => m.formatValue(x, t, spec.currency);
  console.log(`${spec.title}: ${sheets} tabs (${spec.tabs.map((t) => (t.repeat === "months" ? `${t.name} ×12` : t.name)).join(", ")})`);
  console.log(`Headline cards: ${v.summary.slice(0, 3).map((s) => `${s.label} = ${fmt(s.value, s.type)}`).join(" | ") || "none"}`);
  for (const s of v.summary.slice(3)) console.log(`  ${s.label} = ${fmt(s.value, s.type)}`);
  for (const g of v.goals) console.log(`  Goal ${g.label}: ${g.value}%`);
  for (const b of v.breakdowns) console.log(`  ${b.title}: ${b.items.filter((i) => i.value).map((i) => `${i.label} ${i.value}`).join(", ") || "all zero"}`);
  const problems = [...dropped.map((d) => `BinkSuite will drop or change: ${d}`)];
  const warn = (ok, text) => ok || problems.push(text);
  warn(sheets >= 8, `Only ${sheets} tabs: best sellers are complete systems (aim for 15-25 with a monthly tab).`);
  warn(spec.summary.length >= 3, "Fewer than 3 summary items: the Dashboard's headline cards need 3 strong numbers.");
  warn(spec.lists.length > 0, "No Settings lists: category-like columns should use optionsFrom dropdowns.");
  warn(spec.breakdowns.length + spec.trends.length > 0, "No charts: add a breakdown (doughnut) and/or a trend (bar/line).");
  for (const t of spec.tabs) {
    warn(t.exampleRows.length >= 6, `${t.name}: only ${t.exampleRows.length} example rows (aim for 6-10 believable ones).`);
    for (const c of t.columns) warn(c.header.length <= 18, `${t.name}: header "${c.header}" is long (max 18 characters).`);
  }
  for (const s of v.summary) warn(!(s.value === 0 && s.type === "money"), `"${s.label}" works out to 0 with the examples: check its formula and the example rows.`);
  warn(spec.howTo.length >= 4, "How to use has fewer than 4 steps.");
  console.log(problems.length ? `\n${problems.length} thing(s) to fix:\n- ${problems.join("\n- ")}` : "\nNo problems found. Now review it as the buyer would.");
}
