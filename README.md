# Meridian Studio

A workbench for building **equations you can trust**: planning and ranking models made from knobs, step-by-step calculations, rules and weighted criteria. Every number can be traced, and an honesty check says where the model is weak instead of calling it "perfect".

```
Knobs        the situation: arrivals/hour, users, pressure, budget …
Calculations k₁ = f(knobs, columns), k₂ = g(k₁, …) …   (queues, capacity, cost …)
Score(row)   = Rules(row) × Combine( s₁…sₙ , w₁…wₙ ) × 100
sᵢ           = Shape( Direction( Normalize( column | calculation | expression ) ) )
```

## What changed in v2
- **Knobs** (old "parameters"), grouped and always visible: sliders with units and help text.
- **Calculations layer**: named formulas evaluated in order per option. Each one can use knobs, columns and earlier calculations. Rules and criteria can use them too. Click one to see the values plugged in.
- **Formula blocks**: 26 ready-made pieces in 6 groups (Queues, Staffing, Capacity, Reliability, Crowds, Money). Inputs are guessed from the names already in the model.
- **Queue maths built in**: `erlangc`, `wait` (M/M/c), `within` (service level), `runway`, `avail`, plus `pick`, `sum`, `avg`, `ceil`, `floor`, `log2`.
- **Scenarios**: saved knob settings, each re-scored, with the winner shown per scenario ("Calm morning → …, Evening peak → …").
- **Stress test**: sweeps a knob from min to max and shows who wins along the way. The honesty check warns when you are close to a switch point.
- **Key figures**: pinned calculations shown as cards and on each ranking row.
- New rounded, low-chroma design (same hue-300 palette). Mobile gets a Setup/Results switch and a bottom-sheet inspector.
- The code is split into small files with no comments, as requested.

## v2.1: Plan finder, day plan, scenario builder
- **Plan finder** (`js/core/plan.js` → `generate`). Tick the columns to vary and list the values to try; every combination becomes a candidate row. Candidates are scored with the full equation (calculations, rules, criteria) on the current knobs, on every scenario, or on every hour of the day, and ranked by **average** or **worst case**. Duplicates of existing rows are skipped. The finder compares its best result with your best current option, and **Add** puts found plans into the data. There are hard limits of 4,096 combinations and 60,000 option-runs, and the estimate is shown before you run. Pharmacy: all 625 role splits × 14 hours take about 0.7 s.
- **Day plan** (`model.day`). One knob changes by hour (typed in or filled from a shape: flat, morning, midday, evening, two peaks). A second knob can follow it (for example, pressure 0.1 → 0.85 from the quietest hour to the busiest). The strip shows the best option per hour and when to switch; it only switches for a gain above a threshold (3 points by default) so near-ties don't flicker. It also names the single plan that holds up best all day. Click an hour to apply its knobs. **As scenarios** turns the hours into scenarios.
- **Scenario builder**. Pick up to 3 knobs × value lists; every combination becomes a scenario (keep or replace existing ones, limit 24). Each scenario opens in the inspector, where you can rename it, edit or remove its knob values, set more knobs, duplicate it, apply it or remove it.
- Architecture: one pure core module (`plan.js`: generate, grid, shape, day, judge) and one UI module (`app/plan.js`). They plug into small registries (`R.modals`, `R.inspectors`, `M.app.actions`), so no existing module grew beyond a hook.

## v2.2: Step-by-step search, queue carry-over, speed
- **Step-by-step search** (`plan.generate`, method `search`). Used automatically when a space is too big to try in full (over 4,096 combinations or 60,000 option-runs), or when forced with *Always search*. It starts from each of your options, then from random plans and small changes to the best plan found so far. From each start it checks every one-column change and moves to the best one while the score improves. Scores use fixed normalisation ranges taken from a sample, so every candidate is scored on the same scale. Ties are broken by passes, then the raw score, then a smaller backlog. Budget: 240,000 option-runs or 4 s. Results say how many plans were checked and from how many starts. Checks: 8 columns × 10 values (100 million combinations) finds the exact best; forcing search on the pharmacy matches the full search.
- **Runs off the main thread** (`js/core/plan-worker.js`). The finder runs in a Web Worker with a live progress bar and the best plan so far. The worker is started when the finder opens. It falls back to the main thread when workers aren't available (for example on `file://`).
- **Queue carry-over** (`model.day.carry = { knob, calc }`). The value of a calculation at the end of one hour becomes a knob in the next, separately for each option. Pharmacy: `left` (people still waiting = arrivals × wait, or the excess when overloaded) goes into `backlog`, which adds to the next hour's patients. The day strip shows the carried queue as red stripes and reports the queue at closing. The finder and the day summary judge whole-day plans with the carry-over included, so a plan that lets the line build up is penalised in later hours.
- **Speed**: parsed formulas are cached; the model is compiled once per search, day, stress test or scenario set; `pick()` no longer creates closures. The full 625 × 14-hour pharmacy search takes about 0.46 s in the engine.

## Built-in templates
| Template | What it models |
|---|---|
| **Pharmacy staffing** (default) | 4 staff: Maya (manager), Omar, Lina and Sam (part-time). Each has their own speed and accuracy, normally and in a rush, plus share of the day and days per week. There are **three tasks**: filling at a window, typing missed-item prescriptions, and **recording**. Each task is either done at the window (multitasking: extra minutes per patient, a switching cost, extra slips) or by a dedicated person. Also covered: people vs windows (3 on 2 ≠ 3 on 3, via "value of an extra person"), manager overhead, a surge knob and an M/M/c queue. Nine staffing plans are ranked on wait, on-time share, slips, load on the busiest station, and the manager's free time. Six scenarios, including peak + surprise and Lina off / Sam off. |
| **News feed backend** | Server type (VM, containers, bare metal, serverless), app nodes, cache (none, Memcached, Redis, DAX), database (Postgres, Cassandra, DynamoDB), read replicas, shards, feed build (pull, push, hybrid fan-out), backup interval and regions. Knobs cover daily users, the read/write mix, peak factor, followers, growth, required runway, data-loss limit and budget. The model finds what runs out first, the growth runway, availability, downtime, latency and cost. |
| **Event crowd control** | Gates × lanes queue, screening time, exit width → clearance time, density, steward cover. Safety rules come first, comfort and cost second. |
| **Coffee shop rush** | A two-step queue (register, then bar). The smallest example. |
| Care routing, Pick a laptop, Choose a job offer, Prioritize features, Blank | Kept from v1. Care routing still gives Sarema General = 79.3. |

### Pharmacy equation, in short
```
presence_i  = share_of_day_i × days_i / days_open
speed_i     = speed_i × (1 − pressure × (1 − kept_in_rush_i)) × presence_i  [× (1 − manager_load) for the manager]
jug         = (typing not dedicated) + (recording not dedicated)
min/patient = fill + [q_miss × type if not dedicated] + [record if not dedicated] + jug × switch
useful      = window speed, reduced if people > windows: × (windows + help × extra) / people
μ           = 60 / min_per_patient × useful / windows_in_use
wait        = M/M/c wait(arrivals × (1 + surge), μ, windows_in_use)
back load   = arrivals × (q_miss × type + record) / 60 ÷ back-office speed
slips       = window errors + jug × juggling error + missed-item typing errors
```

## Honesty check
Covers errors, unbounded queues, missing data, rules that couldn't be checked, ties, fragile weights, knob switch points, the winner by scenario, weight-free win share, uncertainty, rank reversal, dead or duplicate criteria and dominance.

## Entry points
| Path | Purpose |
|---|---|
| `index.html` | The app |
| `index.html#m=<base64url JSON>` | Opens a shared model |
| `tests.html` | 84 engine tests (search, carry-over, worker, compile reuse, plus): queue maths, calculations, templates, plan finder, day plan, scenario grid, codegen = engine for laptop, pharmacy and feed |
| `ui-check.html` | 31 UI checks driving the real app, including finder timing, forced search and carry-over (results go to the console) |

## Files
```
css/style.css
js/core/expr.js       parser, evaluator, queue functions, JS runtime for export
js/core/shapes.js     shape functions
js/core/engine.js     compute (calcs → rules → criteria → combine), sweeps, scenarios, trace
js/core/honesty.js    honesty report, "what would change first place"
js/core/codegen.js    JSON / JS / formula / CSV export
js/core/blocks.js     formula block library
js/core/plan.js       plan finder (full and step-by-step), scenario grid, day shapes, day timeline with carry-over
js/core/plan-worker.js  Web Worker wrapper for the finder
js/templates/*.js     pharmacy, news feed, crowd control, coffee shop
js/templates.js       registry + classic templates
js/ui.js              themed dropdowns, confirm dialog
js/app/*.js           store, render, recipe, result, inspector, views, events
docs/                 original spec, demo and rubric
```

## Data model
One JSON model: `version, name, note, columns (optional choices), rows, params (knobs), calcs, gates, criteria, combine, scenarios, stress, day {knob, start, values[], link {knob, lo, hi}, sticky, carry {knob, calc}}`. It is saved in `localStorage['meridian.studio.v2']`. No server and no table API are used.

## Not done yet
- Within each hour the queue is still steady state (M/M/c); only the backlog carries between hours. Minute-by-minute simulation is not modelled.
- Step-by-step search can miss the best plan in unusual spaces where the best plan can only be reached through worse ones. Results say so.
- Fitting weights from examples ranked by hand, and comparing two models side by side.

## Suggested next steps
1. Search plans that change by hour (a different role split per hour, with a cost for switching).
2. Soft rules (a penalty instead of ruling an option out).
3. A side-by-side model comparison.
