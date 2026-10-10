# Engineering log

These are the working notes written while building ActionPulse — reviews, plans, and the record of what went wrong.

> **Note: the linked documents are written in Chinese (中文).** They are kept in their original form because that is how they were actually written; translating them after the fact would sand off exactly the detail that makes them useful.

---

| Document | What it is |
| :--- | :--- |
| [SPEC-REVIEW.md](SPEC-REVIEW.md) | A line-by-line audit of the original requirements spec, written **before any code existed**. It lists every place the spec was silent, ambiguous, or impossible as designed. |
| [prd-v2.1-review.md](prd-v2.1-review.md) | Pre-implementation review of the five advanced modules (habits, blind box, kickstart, hibernation, debrief). Flags 5 defects, 4 ambiguities, 5 disagreements — and how each was resolved. |
| [light-theme-plan.md](light-theme-plan.md) | The plan for adding a light theme, including the token-migration strategy and its acceptance criteria. |

---

## Why keep these?

Because the most useful part of a project is usually not the code — it is the list of things that looked fine and turned out not to be. Three examples that are documented here in full:

**1. A service worker that never registered, while 183 tests stayed green.**
A refactor added a comment containing `**/api/` to `public/sw.js`. The `*/` inside it terminated the block comment early, so the file was no longer valid JavaScript. Nothing caught it: the bundler never touches `public/`, the regression test only did string matching, and the sync end-to-end test passed *precisely because* the worker was not running. The fix was a test that parses every file in `public/` with a real JavaScript parser.

**2. The dark theme failed WCAG AA — and only a test could have found it.**
Contrast was assumed to be fine. Writing the assertion first (composite shell → panel → card, require 4.5:1) showed two text tokens had been failing since they were first written: `--text-faint` at **2.98:1** and `--tier-low` at **3.65:1** on cards. Both were corrected, which means the dark theme visibly changed — disclosed rather than quietly shipped.

**3. The light theme could not be an inversion.**
The dark accent is electric lime. On white it measures **1.24:1** — effectively invisible. Six of nine colour tokens were unusable on a light background, so the light theme had to be designed from scratch rather than derived.

A fourth, smaller one: a React `key` collision in the daily debrief that production builds do not warn about, so no automated check could have caught it either.

---

## Reproducing the numbers

Every claim in these documents is backed by a command you can run yourself:

```bash
npm test        # 305 unit tests
npm run build   # typecheck + script syntax guard + build
```
