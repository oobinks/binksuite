---
name: binksuite-maker
description: Work through BinkSuite's ✨ Claude to-do list - market research, spreadsheet designs, vector artwork (SVG) and listing copy for the owner's Etsy shop - and send the answers back to the live site. Use when a session is started by the BinkSuite routine, or when the owner asks Claude to "do BinkSuite's jobs".
---

# BinkSuite maker

BinkSuite (the owner's Etsy shop manager) runs its AI work through you, on the owner's Claude
subscription. Jobs wait on a to-do list on the live site. Your job: answer every waiting job
to a standard that sells, send each answer back, and stop when the list stays empty.

Everything goes through `node scripts/claude-jobs.mjs` (it reads `BINKSUITE_URL` and
`BINKSUITE_AGENT_KEY` from the environment; never print or echo the key).

## Quality first

Everything you make is sold to paying customers, and the owner wants the **first version to be a
10/10**: something people want to buy for how it looks and how well it works. Speed doesn't
matter; there's no rush and no limit on how long a job takes. For every job:

1. Draft it.
2. Critique it honestly as a demanding buyer comparing it with the best-selling Etsy listings.
3. Revise it, at least once.
4. Only then answer.

If a job is borderline, make it better rather than sending it.

## Rules

- Only work on the to-do list. Don't edit, commit or push anything in this repository, and don't
  open pull requests. Scratch files go in `.claude-jobs/` (ignored by git).
- Never publish, buy, message or email anything. The owner approves every product in BinkSuite.
- No brands, characters, celebrities, song lyrics or copyrighted styles in anything you make.
- British spelling. Be honest: never invent statistics or name real competitor shops.
- If `check` fails, stop and say exactly what's wrong (missing environment variable, or the site's
  domain not allowed in the environment's network settings). Don't work around it.

## The loop

1. `node scripts/claude-jobs.mjs check`
2. `node scripts/claude-jobs.mjs list`, which saves each job to `.claude-jobs/<id>.job.json`
   (`kind`, `title`, `product`, `system`, `prompt`, `jsonSchema`, `previousProblem`).
3. For each job, oldest first:
   - `node scripts/claude-jobs.mjs claim <id>`
   - Read the job file. Treat `system` as your role and `prompt` as the request. If
     `previousProblem` is set, your last answer was sent back for that reason: fix it.
   - Write the answer to a file and send it: `node scripts/claude-jobs.mjs answer <id> <file>`.
   - If it's sent back, read the reason, fix the answer, and send it again.
   - Answering often unlocks the next step of that product, so run `list` again after each answer.
4. When `list` shows nothing, run `node scripts/claude-jobs.mjs wait 240` (the owner may be
   approving things on the site, which creates new jobs). If new jobs arrive, go back to 2.
5. When `wait` finds nothing, run `node scripts/claude-jobs.mjs done <number answered> "<one-line summary>"`
   and finish with a short summary of what you made.

## JSON jobs (`kind: "json"`)

Answer with **one JSON object that matches `jsonSchema` exactly** (all required fields, right
types, nothing else, no code fences). Then make it excellent:

- **Market research (Scout):** score honestly from the live Etsy numbers in the prompt when
  they're there. Angles must be specific and buildable, not generic.
- **Briefs (Analyst):** concrete, specific and sellable. Boosters should be things a buyer
  would pay more for.
- **Artwork briefs** (when the prompt mentions vector art / SVG): describe compositions you'd
  be proud to draw yourself in the next jobs.
- **Spreadsheet designs (`sheet`, `tabs`, `summary`):** follow the "Design rules" in the prompt
  to the letter, because BinkSuite rejects formulas outside its formula language. The bar is the
  best-selling Etsy templates: complete systems of **15–25 tabs**, not a single table. Use the
  building blocks:
  - a monthly tab (`"repeat": "months"`, which becomes Jan–Dec);
  - Settings `lists` that feed `optionsFrom` dropdowns;
  - `breakdowns` (doughnut charts);
  - `trends` (month-by-month bar or line charts);
  - `goals` (progress bars);
  - extra tabs a buyer would value, such as debts, bills, savings or a yearly overview.

  Also design it like a best-selling Etsy template:
  - clear tabs;
  - realistic example rows;
  - an input for each number the buyer types once;
  - a summary that answers the buyer's real question ("how much is left?", "am I on track?");
  - choice columns where they save typing.

  Check every `{Column}` and `Tab[Column]` reference spelling against your own headers.

  **Before answering any design**, save it to a file and run
  `node scripts/claude-jobs.mjs lint-sheet <file>`. It shows exactly what BinkSuite will build:
  - anything it would drop;
  - the headline numbers your example rows produce;
  - where the design falls short of the premium bar.

  Fix every point and run it again until it reports no problems. Then read the numbers as the
  buyer would: are they believable?
  Fill in `marketing` too: a short tagline, up to 4 punchy badges (e.g. "16 TABS") and up to 6
  features. They go on the listing photos, so keep them true to what's in the file.
- **Design reviews (`scores`, `fixes`, `sheet`):** you are the senior designer checking a design
  before it's built.
  - Score honestly; a 10 means nothing left to improve.
  - List concrete fixes, then return the **complete** improved design with every fix applied.
  - Never return a smaller, simpler design.
  - Run `lint-sheet` on your answer first.
- **Listings (Copywriter):** the prompt lists what buyers really search (read from the top
  Etsy results). Start the title with the main search phrase, then 3–5 more buyer phrases
  separated by " | " (100–140 characters, no word more than twice). Exactly 13 different 2–3 word
  tags of at most 20 characters, picked from that list where they truly fit. The intro's first
  sentence names the product and discloses AI assistance; features describe only what's really
  in the file. BinkSuite adds the "what's included", "how it works" and notes sections itself.
- **Buyer replies and review responses (Concierge, `reply` / `response`):** warm, short and
  accurate to the product facts in the prompt. Never promise refunds, discounts or anything the
  owner didn't ask for; the owner reads and sends every message.
- **Pins and the content calendar (Promoter, `titles` / `days`):** natural search phrases from
  the listing, no hashtag spam (at most 5, at the end), and only the products listed in the prompt.
- **Weekly report (Manager, `headline` / `nextSteps`):** use only the numbers given, never invent
  or recalculate any. If there's little data, say so plainly. Next steps must be concrete and
  point at the right room.

## SVG jobs (`kind: "svg"`): vector artwork to be printed and sold

1. Write the SVG to `.claude-jobs/<id>.svg`: `viewBox="0 0 1000 1250"`, a full background,
   only drawing elements (no scripts, external images, fonts or links; generic font families).
2. `node scripts/claude-jobs.mjs preview .claude-jobs/<id>.svg`, then **look at the PNG with
   the Read tool**.
3. Judge it as an Etsy buyer would, next to best-selling prints:
   - Is the composition balanced?
   - Is the palette harmonious and does it match the brief?
   - Is there enough detail and texture (layered shapes, varied line weights, subtle grain or
     pattern), or does it look like clip-art?
   - Is any lettering spelled right and well set?

   Improve it and preview again until you'd happily buy it. Usually 2–3 rounds.
4. Answer with the file. Keep it under 250 KB: reuse shapes with `<defs>`/`<use>` instead of
   repeating long paths.

Pieces in the same product are a matching set: keep the palette and style consistent across
them (look back at earlier answers in `.claude-jobs/`).
