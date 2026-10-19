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
    process.exit(status === 200 ? 0 : 1);
  }
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
    break;
  }
  default:
    console.log("Commands: check | list | claim <id> | answer <id> <file> | preview <svg> [png] | wait [s] | done <n> [note]");
}
