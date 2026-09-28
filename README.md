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
| `tests.html` | 61 engine tests: queue maths, calculations, template checks, codegen = engine for laptop, pharmacy and feed |
| `ui-check.html` | 18 UI checks driving the real app (results go to the console) |

## Files
```
css/style.css
js/core/expr.js       parser, evaluator, queue functions, JS runtime for export
js/core/shapes.js     shape functions
js/core/engine.js     compute (calcs → rules → criteria → combine), sweeps, scenarios, trace
js/core/honesty.js    honesty report, "what would change first place"
js/core/codegen.js    JSON / JS / formula / CSV export
js/core/blocks.js     formula block library
js/templates/*.js     pharmacy, news feed, crowd control, coffee shop
js/templates.js       registry + classic templates
js/ui.js              themed dropdowns, confirm dialog
js/app/*.js           store, render, recipe, result, inspector, views, events
docs/                 original spec, demo and rubric
```

## Data model
One JSON model: `version, name, note, columns, rows, params (knobs), calcs, gates, criteria, combine, scenarios, stress`. It is saved in `localStorage['meridian.studio.v2']`. No server and no table API are used.

## Not done yet
- Automatic optimisation: search every role assignment for the best plan (the plans are listed by hand for now).
- Time-of-day simulation (hour by hour through a whole day).
- Fitting weights from examples ranked by hand, and comparing two models side by side.

## Suggested next steps
1. A "generate plans" button that lists every way to assign roles and keeps the top ones.
2. A day timeline: arrivals per hour → the best plan for each hour.
3. Soft rules (a penalty instead of ruling an option out).
