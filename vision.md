# Launch Engine — Vision

> **Status:** v0.1 draft · working title "Launch Engine" · authored as the substrate we build off of. Sections marked **⟁ OPEN** are decisions to settle before/while building.

---

## One-liner

**A co-pilot that turns "here's my product, here's my goal, here's my 2 weeks and my budget" into an optimized, sequenced collection of concrete actions that get it launched.**

The output is the to-do list you'd kill for — specific, prioritized, time- and cost-estimated, scheduled. It is *not* an analysis of you or your idea. It's **what to actually do next, and in what order.**

---

## The problem (the heart of this)

Founders rarely fail for lack of motivation. They fail because, on any given morning, **they don't know which of a hundred possible actions actually moves them toward launch** — so they default to whatever's comfortable and the rest rots.

The recurring question is always: **"How do I best spend my limited time and money to launch?"** Generic planners can't answer it — they're empty boxes you fill with your own bias. What's missing is a tool that **generates the right actions for this specific product and budget, ruthlessly prioritizes them, and lays them across the next two weeks.**

We are not here to judge the idea or psychoanalyze the founder. **We are here to produce a great collection of actionable steps — and keep it current as the work gets done.**

---

## The insight / why this is different

1. **Action-generation, not analysis.** The core artifact is a concrete, doable step ("film 3 reels — postpartum / back / nervous-system angles, 20-30s each"), never a score or a verdict.
2. **Scope from current state.** A light read of what already exists (build? landing page? users?) exists only to figure out *which steps remain* — done work drops off the list. No grading.
3. **Broad model, focused output.** Internally enumerate *every* possible action/channel (see Areas below). Externally, prune hard to the few that matter for this budget — and say why the rest were cut.
4. **Optimized to the constraint.** Every step carries time + cost estimates, so the collection is fit to the real 2-week / fixed-dollar budget, with the tradeoffs made visible.
5. **Stays live.** Daily check-ins mark steps done and re-sequence what's left — a living plan, not a one-time export.

---

## Organizing principle — Left brain / Right brain

The product is organized around a single binary that maps the founder's imbalance onto an intuitive picture: **a brain with two hemispheres.**

- **LEFT — the material build.** Product/Dev, QA, Ops, Scheduling, Accounting, Legal/entity, Infra. Structured, sequential, logical. Aesthetic: cool, geometric, circuitry/grid. The **Builder's** comfort zone.
- **RIGHT — the immaterial market.** Idea, Positioning, Content & creative, Audience/network, Distribution, PR. Generative, holistic, relational. Aesthetic: warm, organic, flowing/ink. The **Marketer/Creative's** comfort zone.
- **CORPUS CALLOSUM — the balance.** The middle is integration: the balance score and the 14-day schedule that weaves both sides together.

**The brain organizes the *work*, not a verdict.** Actions cluster into the hemisphere they belong to, so you can see at a glance how the launch splits across build vs. market and where the open, high-priority steps are. It's a map of the to-do list, not a judgment of the founder.

**Two rules:**
1. **It's a metaphor, not neuroscience.** Left/right-brain is pop-psychology; we use it for instant, intuitive structure, never claim it's clinical.
2. **The binary has internal gradients.** The right hemisphere *produces material artifacts* (the 3 videos, ad creative, posts); the left makes *immaterial decisions* (UX, architecture). Each side carries a material↔immaterial gradient.

The optimizer's time/money allocation reads as *how the budget is split across the two kinds of work.*

---

## Who it's for

- **v1 / dogfood:** us — using it to launch **Hannah's Deep-Core App** as test subject #1. (See `../hannahs-fitness-app/`.)
- **Beyond:** solo founders, indie hackers, first-time builders shipping a product on a tight time/money budget.
- **⟁ OPEN:** general across product types (digital, manufacturing, services) vs. digital-products-first. *Recommendation: taxonomy is general; only the digital-product path is tuned for the prototype.*

---

## The six stages

**Stage 1 — Intake & scope**
Questions: *What are you building? What's the goal? Where are you now?* — including a light read of current state (build? landing page? users?) purely to scope which steps remain — plus the time + money budget.
→ Output: a clear starting point + goal + budget — the inputs the action generator runs on.

**Stage 2 — Investment options & key decisions**
Claude generates a few **time/money investment scenarios** (lean / balanced / aggressive). User adjusts **time & money sliders** (prototype already built — see Optimizer) and makes the critical trade-off decisions surfaced by the diagnosis.

**Stage 3 — Mind map**
Central idea → **areas** → concrete steps. Each node carries: **generated action steps (the real payload)**, time/$ estimates, priority, done-state, and an embedded **Claude chat** to define and refine those steps. The map shows the work, clustered build vs. market.

**Stage 4 — Schedule**
A concrete **14-day agenda** with an estimated budget across every activity — the optimizer's allocation turned into a day-by-day plan.

**Stage 5 — Daily check-ins**
User logs **wins + improvement areas**, uploads photos/videos of progress. A **blog post about the build stage is auto-generated**. The check-in re-feeds the assessment so the plan stays honest.

**Stage 6 — Final review & report**
A retrospective: what shipped, what the founder avoided, where the budget actually went vs. plan, and the launch outcome.

---

## The mind map — areas under each hemisphere

The mind map *is* the brain. Areas hang off the left or right hemisphere. Each gets the full-breadth treatment internally, then is pruned hard on screen to what matters now.

### ◧ LEFT — material build
- **Product / Development** — scope, MVP, build, QA, the "stop building" line
- **Operations** — scheduling, support, infra/hosting
- **Finance / Accounting** — pricing, unit economics (LTV/CAC/payback), runway, break-even, bookkeeping
- **Legal / Entity** — formation, terms, privacy, compliance
- **Manufacturing / fulfillment** *(physical products only)*

### ◨ RIGHT — immaterial market *(the founder's hardest side — model it richest)*
- **Idea / Validation** — problem, ICP, positioning, customer interviews, willingness-to-pay
- **Content & creative** — the 3 videos → Facebook, Instagram, TikTok, YouTube, App Store ad space
- **Paid** — Meta/IG/TikTok ads, search, the variant-test matrix (creative × audience)
- **Organic** — SEO, reels cadence, communities, repurposing
- **Network / earned** — referrals, partnerships, leveraging existing audience, cold calling, cold email, DMs
- **Traditional / wild cards** — TV, radio, magazine, podcast tours, PR, events, flyers
- **Channel / App-store** — ASO, ratings, listing A/B

### ⌖ CORPUS CALLOSUM — balance
- **Schedule** (14-day weave of both sides) · **Balance score** · **Budget rollup**

*Same broad → focused approach applies to every area, not just marketing.*
**⟁ OPEN:** lock the canonical area list + which are "core" vs. conditional on product type.

---

## Intelligence layer

- **Production:** the **Open Shannon Claude sidecar** — `POST http://open-shannon:3000/claude` with `Authorization: Bearer $SHANNON_SECRET`, body `{ prompt, options: { systemPrompt, maxTurns } }`, returns `{ result, exitCode }`. Uses the Claude Code OAuth subscription (not per-token billing). Health: `GET /health`.
- **Prototype:** the local **Docker container running Claude** (⟁ may need re-signing in — verify before building Stage 1+).
- Each mind-map node = a scoped Claude conversation with the diagnosis + concept state injected as system context, so advice is grounded in *this* product, not generic.

---

## Data model (sketch)

The **Concept** is one living object that evolves across stages:

```
Concept {
  intake:      { what, problem, why, evidence: {build?, url?, users, revenue, convos} }
  diagnosis:   { archetype, assessment, blindSpot, stageReadiness }
  budgets:     { timeHrs, money, scenario }
  areas:       [ Area { key, status, tasks[], estTime, estMoney, chatThread } ]
  schedule:    [ Day { date, activities[], budget } ]
  checkins:    [ { date, wins, improve, media[], blogPost } ]
  report:      { ... }
}
```

---

## The optimizer (already prototyped)

`../hannahs-fitness-app/launch-optimizer.html` is the seed of Stages 2–4: time/money sliders → greedy ROI-density allocation → efficient frontier + funnel + ad-variant module. It proves the quantitative spine. It needs: editable channel assumptions, a real two-resource solver, and a 14-day schedule view.

---

## Prototype scope — the irreducible "aha"

The magic is **a great, optimized collection of actionable steps** — generated for this product, fit to the budget, sequenced into 2 weeks. Smallest thing that proves it:

1. **Stage 1** intake & scope → product, goal, current state, time/money budget (real Claude call).
2. **Stage 2/3** Claude generates the **action collection** — concrete steps per area (build + market), each with a time/cost estimate and priority, pruned to the budget — shown as the brain/action map, with **Marketing fully fleshed** (deep per-node chat + broad→focused channel steps) and the rest lighter.
3. **Stage 4** the existing optimizer fits the steps to the budget and lays them across a 14-day schedule.

Stages 5–6 (daily check-ins, blog gen, final report) come after.
**⟁ OPEN:** deep vertical slice (above) vs. all stages stubbed end-to-end first.

---

## Out of scope (for now)

Auth/accounts, multi-user, billing, mobile app, the general manufacturing/physical-product path, integrations (calendar, Stripe, social posting APIs). Note them; don't build them yet.

---

## Open decisions (our chat agenda)

1. **Soul check** — do we agree the product *is* the honest diagnosis + nag, and everything else serves it?
2. **Bluntness dial** — how truthful vs. encouraging should the assessment be?
3. **General vs. digital-first** for the prototype taxonomy.
4. **Prototype shape** — deep vertical slice vs. broad stubs.
5. **Intelligence path** — confirm local Docker Claude for the prototype; is it running/signed in?
6. **Naming** — "Launch Engine" placeholder or something with more edge.
```
