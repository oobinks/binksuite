# BinkSuite — Phased Build Plan

> Approved by the owner. This is the source of truth for what gets built, phase by phase.

## Context
You run an Etsy shop selling AI-made digital printables (UK, not VAT registered). BinkSuite turns running that shop into a cosy management game. It's an HQ map of rooms, each staffed by AI agents that do real work. You approve their output, complete quests and level up, and your score is real net profit in £.

**Decisions so far:**
- Etsy API: not yet. The copy-paste pack comes first and the Etsy API arrives in Phase 4.
- Image provider: decide later. A swappable interface and a fake demo provider for now.
- HQ map: flat top-down floor plan.
- Login: built-in password login.
- Everything runs on Cloudflare: the app on Workers, the database on D1, and files on R2.
- The code lives in a private GitHub repo (oobinks/binksuite), and Cloudflare auto-deploys it.
- Accounts: Cloudflare and GitHub. No Anthropic API key yet, which is fine because Phase 1 is demo-only.
- The owner's PC has no Node, Git or GitHub CLI, so nothing is built or stored locally.

---

## How it fits together

```
 Your phone / browser
        │  https://binksuite.<you>.workers.dev  (password login)
        ▼
┌─────────────────── Cloudflare (free plan) ───────────────────┐
│  ONE Worker                                                  │
│   ├─ serves the React app (static assets)                    │
│   ├─ /api/*  (Hono router)  ── auth, rooms, tasks, finance   │
│   ├─ Agent engine  ── calls Claude API / image API           │
│   └─ Cron (every 5 min) ── runs queued jobs, daily briefing  │
│        │                │                                    │
│     D1 database      R2 bucket                               │
│   (tasks, products,  (images, PDFs, ZIPs,                    │
│    finance, XP,       mockups)                               │
│    encrypted keys)                                           │
└──────────────────────────────────────────────────────────────┘
        ▲
        │ auto-deploy on every push
   GitHub (private repo: binksuite)
```

**Product pipeline (the parcels 📦 moving across the map):**
```
🔬 Research ─▶ 🎨 Studio ─▶ 🖼️ Mockups ─▶ ✍️ Listing ─▶ 🛡️ Compliance ─▶ 🚀 Launch
 niche          images +     listing       title/tags/     hard checks      copy-paste pack
 approved       print files  images        desc/price      (block if fail)  (later: Etsy API)
   ❗you           ❗you         ❗you          ❗you             ❗you            ❗you
```

---

## Key technical choices (and why)

| Choice | Why |
|---|---|
| **One Worker with static assets** (not separate Pages + Worker) | Cloudflare's current recommended setup. One deploy and one URL, and it's free. |
| **React + TS + Vite + Tailwind**, built with `@cloudflare/vite-plugin` | Requested stack. Local dev mirrors production. |
| **HQ map = SVG/HTML + Motion (Framer Motion)**, not canvas | Crisp at any size, easy to tap on a phone, accessible, simple to restyle per room. About 15 moving sprites, so canvas doesn't pay off. |
| **Agent characters = hand-built SVG avatars** with CSS/Motion idle, work and bounce animations | Cohesive, cute, quick to load. No image API needed for the characters. |
| **Hono** for the API, **Drizzle ORM** for D1, **Zod** for validation | Lightweight and well suited to Workers. Fee calculator and compliance rules live in shared code used by browser and Worker. |
| **TanStack Query + Zustand**, **Recharts** for charts, **canvas-confetti** for celebrations | Standard, small libraries. |
| **Task queue = a D1 table** (queued → working → needs_approval → done/failed, with retries) | Tasks run while the app is open (the browser triggers them) and the cron sweeps up the rest. |
| **Heavy file work in the browser**: PDF (pdf-lib), resize at 300 DPI (canvas), ZIP (JSZip). Results upload to R2. | The free Worker allows only 10 ms CPU per request. |
| **Login:** PBKDF2 (Web Crypto), signed HttpOnly session cookie, lockout after failed attempts | Secure, no extra service. |
| **Key Vault:** API keys encrypted (AES-GCM) in D1 with a master key held as a Cloudflare secret. The app only shows `••••1234`. | Keys never reach the frontend. |

### Free-tier check
| Resource | Free limit | BinkSuite usage |
|---|---|---|
| Worker requests | 100,000/day | A few hundred a day ✅ |
| Worker CPU | 10 ms/request | API calls are waiting time, not CPU ✅ |
| Cron triggers | 5 per account | 1 used ✅ |
| Outbound calls | 50 per request | One AI call per task step ✅ |
| D1 | 5M row reads and 100k writes/day, 5 GB | Tiny ✅ |
| R2 | 10 GB, 1M writes and 10M reads/month | ~2–4k print-ready products ⚠️ storage gauge in Settings |

⚠️ **Paid only if:** R2 storage passes 10 GB (~$0.015/GB/month after that), or long background jobs are wanted later. Claude and image API usage are pay-as-you-go with those providers, capped by spend guardrails.

---

## Facts baked in as editable settings (checked October 2026)
- **Etsy UK fees:** listing $0.20 (editable FX rate); transaction 6.5%; payment processing 4% + £0.20; regulatory operating fee **0.48%** (from 22 June 2026); VAT 20% on Etsy fees (not VAT registered); Offsite Ads 15% capped at $100/order (toggle); currency conversion 2.5% on non-GBP sales.
- **Etsy listing limits:** title ≤ 140 chars, 13 tags ≤ 20 chars each. Re-check in Phase 3.
- **Etsy API (Phase 4):** draft first, then upload files. 10k req/day, 10/s (new apps may start at 5k/day, 5/s). Re-check `who_made`.
- **UK tax helper:** gross trading income vs the £1,000 trading allowance. A record-keeping aid, not tax advice.

---

## Phase 0 — Setup
1. Done: private GitHub repo oobinks/binksuite.
2. Done: cloud session on that repo; code written, tested and pushed there.
3. **Owner:** Cloudflare dashboard → Workers → Create → Import a repository → `binksuite`. Create D1 `binksuite-db` and R2 `binksuite-files`.
4. `wrangler.jsonc` with bindings, plus a one-time setup page for the password. Secrets `SESSION_SECRET` and `VAULT_MASTER_KEY` set in the dashboard.
5. **Previews:** every branch gets a Cloudflare preview URL.

## Phase 1 — The game, on demo data
- **HQ map:** floor plan with all 11 rooms, colour-coded; agents walk and work with speech bubbles; queue counts; glowing ❗ for approvals; locked rooms greyed with 🔒 and requirement; parcels animate between rooms on handoff.
- **Room screens** for all rooms: Phase 1 rooms interactive with demo tasks; later rooms show "Coming in Phase N" with their agents.
- **Agents (all 13):** name, role, SVG avatar, status (💤 ⚙️ ❗ ⛔ ✅) with progress bar, activity log. A **demo simulator** runs fake tasks through the real task queue.
- **Game systems:** coins (= net profit) top bar; XP and levels with unlock ladder; quest log (starter campaign + daily + weekly); achievements and badges, celebrations, daily briefing modal.
- **Finance Vault (real):** live fee calculator; revenue/fees/costs ledger; profit charts; spend caps; trading-allowance tracker; CSV export.
- **Settings:** fee rates, profit target, caps, tone of voice, agent toggles, Key Vault UI, Demo mode toggle, theme (light/dark/system), JSON export.
- **Phone-first:** on mobile the map becomes a scrollable 2-column grid of room cards.
- **Login and seed data:** password login, seeded demo shop.

> **Changed after Phase 2 (owner's decision):** nothing is locked by level. Every room is always open; levels and XP remain as a fun score with shop titles (Market Stall → Printables Tycoon).

**Original level and unlock ladder (retired):**
```
Lv1 🔬 Research · 🎨 Studio · ✍️ Listing · 💷 Finance · ⚙️ Settings
Lv2 🛡️ Compliance   Lv3 🖼️ Mockups   Lv4 🚀 Launch Pad
Lv5 📦 Orders · 💬 Customer Care   Lv6 📣 Marketing   Lv7 📊 Strategy HQ
```

## Phase 2 — Research Lab + Product Studio (real AI)

> **Built on Cloudflare Workers AI (free), October 2026.** The owner chose a £0 setup: text by Llama 3.3 70B and art by FLUX.1 schnell, both via the Worker's `AI` binding (no keys), metered under the free 10,000-neuron daily allowance. Trade-offs agreed: 1024 px art enlarged for print, no live web research, no AI vision check (the owner reviews every image). Paid providers (Claude, OpenAI/Ideogram/Replicate) remain an optional upgrade.

- **Claude client:** model from config (default latest Sonnet), structured JSON output, per-call token cost logged to the ledger.
- **Research Lab — Suggestion box (added after Phase 1; demo version shipped early):** you suggest an idea, Scout researches it (Claude + web search in Phase 2) and returns a ✅ go / 🤔 maybe / ⛔ skip report with scores, reasons, risks, angles, price range, seasonality and keywords. Your ideas jump the queue; you can make it, research again, or drop it.
- **Idea Boosters (added, v0.6.0):** after you approve an idea, the Analyst pitches 3–5 ways to make it stronger (catchy slogan with options, art twist, bundle, listing angle). You switch on the ones you like or add your own; the Designer weaves art boosters into prompts, the Copywriter mentions them, and slogans are set as real text by the Printer (never misspelled by the image AI).
- **Research Lab:** **Scout** scores niche ideas (demand, competition, AI fit, price potential, keywords). **Analyst** summarises pasted competitor notes into a ranked Niche Board. Approved niche → product brief. No scraping.
- **Product Studio:** **Designer** (prompts, prompt library, style presets, `ImageProvider`: demo + OpenAI/Replicate/Ideogram). **Inspector** (Claude vision checks; swipeable approve/reject/regenerate). **Printer** (in-browser PDF/PNG/JPG at A4/A5/A3, US Letter, 8×10, 300 DPI; upscaling; zipped to R2).
- **Costs and guardrails:** per-product API cost; spend caps enforced; agent shows ⛔ when hit.

## Phase 3 — Mockups, Listing Office, Compliance, Copy-paste pack
- **Stylist:** template mockups composited in the browser; cover, "what's included", size guide; template manager.
- **Copywriter:** title, 13 tags, description; AI disclosure enforced in the first paragraph.
- **Pricer:** fee calculator vs minimum profit target.
- **Compliance Office:** AI disclosure, "Designed by", keyword blocklist, manual image confirmation, provider-licence setting. Failure blocks publishing unless overridden with a note.
- **Launch Pad:** copy-paste pack with one-tap copy buttons and ZIP download.

## Phase 4 — Etsy API + Orders Desk
- **Etsy OAuth (PKCE):** walkthrough for a personal app; **draft** listings only, then images and files; nothing goes live without the owner's tap; respects rate limits.
- **Orders Desk:** receipts via API or CSV import; personalised orders queue (**Crafter**); each sale awards coins and XP with a celebration.

## Phase 5 — Customer Care, Marketing, Strategy HQ, polish
- **Concierge:** reply and review-response drafts; owner always sends.
- **Promoter:** Pinterest pins, social ideas, content calendar, channel tracking.
- **Manager:** weekly cron report with suggested quests; charts.
- **Polish:** animations, celebration effects, accessibility.

---

## Code layout
```
binksuite/
├─ src/client/        React app
│   ├─ hq/            map, rooms, parcels
│   ├─ agents/        avatars, bubbles, logs
│   ├─ game/          XP, quests, achievements
│   └─ rooms/<room>/  one folder per room screen
├─ src/worker/        Hono API
│   ├─ routes/
│   ├─ engine/        task queue, agent registry, handoffs
│   ├─ providers/     claude, image (demo/openai/...), etsy
│   └─ cron.ts
├─ src/shared/        types, fee calculator, compliance rules, room/agent registry
├─ migrations/        D1 SQL
├─ seed/              demo data
└─ README.md
```

**Adding a room or agent** = one entry in `src/shared/registry.ts`, one folder in `rooms/`, one handler in `engine/agents/`.

**Human-in-the-loop guardrails** live in the engine. Anything that publishes, sends, spends past a cap or deletes creates an `approval` record and only runs after the owner taps Approve. Every action and API cost is logged.

---

## Verification (after every phase)
- **Unit tests (Vitest):** fee calculator vs hand-worked examples (£25 sale ≈ £3.11 fees before VAT); compliance rules; task state machine; XP and unlock logic.
- **API tests:** local Worker (Miniflare) with local D1.
- **Click-through on the preview URL:** login, map, a room, approving a task, fee calculator, quest completion and celebration.
- **Screenshots:** desktop and phone, light and dark.
- **Recap for the owner:** what to try, what changed, what's next.

## Not doing (by design)
- No Etsy scraping.
- No auto-publishing and no auto-sending of messages.
- Agents never spend money without the owner.
