# Meridian Studio

A general-purpose sandbox for building **honest scoring equations**: you rank a set of options (laptops, job offers, features, facilities…) with rules plus weighted criteria. Every number can be traced, and the tool **tells you where your equation is weak** instead of claiming it is "perfect".

```
Score(row) = Rules(row) × Combine( s₁…sₙ , w₁…wₙ ) × 100
Rules(row) = 1 if every enabled rule passes, else 0
sᵢ         = Shape( Direction( Normalize( Raw_i(row) ) ) )  ∈ [0,1]
wᵢ         = weightᵢ / Σ weights
```

## What makes it honest (the "gaps" layer)
The **Honesty check** runs after every change and lists, in plain sentences:
- **Ties**: the top two are under 2 points apart.
- **Fragile weights**: moving one share by ≤5 points changes the winner (from a weight sweep of every criterion).
- **Dead criteria**: turning a criterion off would not change the order.
- **Double counting**: two criteria that move together (r > 0.9).
- **No-effect criteria**: every option has the same value.
- **Missing data**: options scored 0 because a value is missing, and options ruled out because a rule *could not be checked*, not because they failed it.
- **Dominance**: one criterion carries over 50% of the weight.
- **Clipping**: values outside a fixed range.
- **Method caveats**: Weakest link ignores weights, Multiply zeros out anything at the bottom of one criterion, and auto ranges make scores relative.
- **Formula errors**: shown in place. A broken item is skipped and never crashes the page.

- **Weight-free check**: 2,000 random weightings. "Birch Pro 14 wins under 39% of all possible weightings", which tells you whether the data or your weights produce the winner.
- **Uncertainty**: set a ± error margin on any criterion ("How sure are these numbers?"). A seeded simulation gives each option a chance of coming first and a likely rank range, shown in the ranking.
- **Rank reversal**: removing an option that isn't the winner changes the winner (because auto ranges are relative), with fixed ranges suggested as the fix.
- **Missing-value policy for each criterion**: count as worst, middle or best, or rule the option out. The trace, the honesty text and the exported JS all follow the choice.

A verdict tag sums these up: *Holds up* / *Check before trusting* / *Has errors*.

**What would change first place** (Add up mode) works out, for the next three options, the single value change that would put each one on top, e.g. "Fjord 14 would pass Birch Pro 14 if Price were 1,220 instead of 1,249".

## Features
- **Simple mode**: rules as sentences (`Price ≤ 1800`), criteria with weight sliders and live shares, and three combine methods: Add up, Multiply and Weakest link.
- **Advanced switch** (same screen, adds fields where they belong): expressions, fixed ranges, numeric shape inputs in raw units, parameters, a custom combine formula, robustness strips and per-criterion formula lines.
- **Inspector**: criterion editor (source, direction, 5 shapes plus per-category points, a live chart with each option as a dot, and weight), rule/parameter/formula editors, and a **row trace**: raw → normalized → direction → shape → × share → combine → final.
- **Equation** with colour chips. Selecting a row shows its numbers plugged into the equation.
- **Ranking** with stacked contribution bars, FLIP re-ordering, and a "Ruled out" list with reasons.
- **Data view**: editable table (number / category / boolean columns, units, ids in Advanced), add/remove rows and columns, CSV paste with type inference.
- **Export**: JSON model, standalone JavaScript `score(r)` generated from the AST, plain-text formula, CSV of results. Share link (`#m=` base64url), JSON import.
- Undo/redo (Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z; 100 steps; a slider drag counts as one step), autosave to localStorage, Esc closes the modal and then the inspector.
- **Themed controls, no browser popups**: every dropdown is an app-styled list (keyboard: arrows, Home/End, type-ahead, Enter, Esc; flips upward near the bottom edge; stays on screen on mobile). `confirm()` is replaced by an in-app dialog. Removing a criterion, rule, parameter, row or column, or loading a template, shows a toast with **Undo**.
- Favicon set: `favicon.ico`, `favicon.svg`, `favicon-32.png` and `apple-touch-icon.png` (a compass mark in #553f83).
- Safe expression language: a recursive-descent parser. There is **no `eval` / `new Function`**.

## Entry points
| Path | Purpose |
|---|---|
| `index.html` | The app |
| `index.html#m=<base64url JSON>` | Opens a shared model |
| `ui-check.html` | Drives the real app: dropdown open/pick, keyboard, confirm, cancel, toast undo (17 checks, printed to the console) |
| `tests.html` | Engine acceptance tests (40 checks, including codegen ≡ engine, Sarema General = 79.3, missing-value policies and seeded simulations) |

## Templates
Pick a laptop (default), Choose a job offer (curve, S-curve, target, category map, boolean rule), Prioritize features (RICE expression + parameter rule), Care routing (ported demo structure), Blank.

> **Care routing:** the 18 facilities are copied exactly from the original demo (`docs/demo.html`), with the patient fixed at Sarema (x=34, y=30). Sarema General scores **79.3**, which matches the demo; `tests.html` checks this. How the demo's extra logic was handled:
> - **Services** → included: 10 yes/no columns plus the rules "Offers cardiology" and "Offers lab work" (the patient is Ada: cardiology + lab).
> - **Urgency** → included as a parameter (0–2) that shrinks the reach rule by 15% per level, as in the demo: `distance_km <= reach * (1 - 0.15 * urgency)`.
> - **Urgency boost to the distance weight** → left out. Weights stay visible and user-set; a hidden weight change would undercut the honesty goal.
> - **Public-first lock, split plans, overrides, cohort simulation** → left out. These are routing policy rather than scoring, and they match the v1 exclusions in the audit.
>
> Ideas taken from `docs/rubric.html`: missing-value policies, seeded Monte Carlo uncertainty, the weight-agnostic win share and the rank-reversal check.

## Files
```
index.html, tests.html
css/style.css          design tokens (milky lavender, hue 300) + app styles
js/core.js             util, expr parser, shapes, engine, trace, sensitivity, honesty, flips, codegen
js/templates.js        starter models
js/ui.js               themed dropdowns, menus, confirm dialog (wraps native <select> so app code is unchanged)
js/ui-check.js         UI interaction checks
js/app.js              state/history, rendering, inspector, data view, export, events
js/engine-tests.js     acceptance tests
docs/audit-spec.txt    the original build spec / audit
```

## Data model
A single JSON `Model` (`version, name, columns, rows, params, gates, criteria, combine`) is the only source of truth. It is stored in `localStorage['meridian.studio.v1']`. No server and no tables API are used.

## Not in v1 (on purpose)
- Fitting weights from examples the user ranks by hand
- Comparing two models side by side
- Cohort simulation
- A dark theme

## Suggested next steps
1. Weight helpers adapted from Rubric: rank-order weights (sort criteria, get weights) and pairwise comparison with a consistency check.
2. Soft rules (a points penalty instead of ruling an option out).
3. Pairwise "I prefer A over B" checks that point out where the model disagrees with the user's intuition.
4. A model comparison view.
