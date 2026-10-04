# Meridian Studio — v4

**Rank anything, and know why.** You build your own ranking: list your options, pick what matters, say how much and which way is better, and add must-haves and formulas if you need them. Every score breaks down into the points behind it, and a plain-language "Can I trust this?" panel says where the ranking is fragile.

## What it is about (the v4 answer)
Earlier versions were a box of equations: queues, staffing and capacity, all shown at once. v4 starts from one job that everyone has: **I have options and I need to pick one, for reasons I can explain.** Equations still matter, but they are now a tool you reach for, not where you start:

```
Options      the rows: laptops, flats, staffing plans, architectures …
What matters columns you score on, each with an importance (0–10) and a direction
Must-haves   rules that rule an option out before scoring
Formulas     worked-out columns, like a spreadsheet: [Rent] / [Size], wait(…), pick(…)
Settings     numbers that apply to every option: budget, order size, patients per hour
Situations   saved settings (calm morning, viral month) with the winner in each
```
Score = Σ importance share × points (0–10), out of 100. A Balanced method penalises weak spots.

## Done in v4
- **Four tabs in plain words**: What matters · Must-haves · Formulas · Options. A ranking that updates live sits beside them.
- **What matters**: an importance slider (Ignore … Crucial) with its real % share, More/Less is better, five curves (every bit counts, first steps count most, only the top end counts, good enough is enough, sweet spot) with a live chart that shows every option as a dot. Text columns get points per answer.
- **Must-haves**: a simple builder (column / at most / value or setting). You can switch to a formula. Each rule says which options it rules out.
- **Formulas that forgive**: `×` `÷` `−` `≤` `≥` `≠`, `=` for equals, `and/or/not`, `15%`, names with spaces in `[brackets]`, case-insensitive. Errors are human: "I don't know 'pirce'. Did you mean Price?", with the bad part highlighted. Each formula shows itself **worked out for one option with the real numbers plugged in**. Click-to-insert name chips; a built-in function guide. Circular formulas are caught. Renaming a column rewrites every formula.
- **Functions**: if, min, max, sum, avg, abs, round, floor, ceil, sqrt, log/ln, log2, log10, exp, pow, clamp, **pick** (lookup), **wait / within / erlangc** (M/M/c queues), **runway**, **avail**.
- **Settings**: a slider plus a typed value, groups that fold for big models, a filter box, and a **who-wins strip** under every setting showing switch points ("$1,350: Borealis 14 takes over").
- **Situations**: chips with the winner of each. Click one to apply it; change a setting to get "Save as situation" or "Make baseline"; a summary says whether one option wins everywhere.
- **Why panel**: value → points of 10 → share → points added for any option, the worked-out formulas for that option, and **what it would take** to win or lose first place (click to try it; Ctrl+Z undoes).
- **Can I trust this?**: close calls, sensitivity to one importance ("set Battery to 3 and Borealis wins"), one-trick winners, options that can never win, two criteria saying the same thing, blanks, broken formulas, and settings near a switch point, each with a **Show me** link.
- **Options table**: type over values (`$1,299`, `12 kg` understood), yes/no checkboxes, text suggestions, Enter moves down, worked-out cells fill in. Paste from Excel, Sheets or CSV: types and units are detected and "less is better" is guessed from names like price, time and distance.
- **Guided tours**: every example has a 4–7 step tour that switches tab, spotlights the right card and gives one "Try it" task.
- **Save & share**: autosave, a share link (`#m=`), and export as a plain-text summary, spreadsheet CSV, JavaScript (tested to give the same scores as the app) or a JSON file. Open file loads JSON or CSV.
- **Design**: milky lavender-white, one brand hue (300) at low chroma, soft criterion tints, Fraunces italic for titles, mono numbers. A new light favicon (`favicon.svg`).
- **Responsive**: Build/Ranking switch on phones. The ranking panel uses container queries, so rows reflow (name on top, bar below) whenever the panel is narrow. This fixes the clipped "Borea…" names. Situation chips wrap on phones.

## Done in v4.1: Go further
All four live in a **Go further** panel under the ranking, use the same engine (overrides, no copies of the model) and explain themselves in plain words.
- **Find the best option** (`M.plan.find`): start from an option, tick the columns to vary, type the values to try. Every combination is scored with the full ranking (formulas, must-haves, importances). You can judge on the current settings, on every situation or on the whole day, and rank by average or worst case. Up to 4,096 combinations (60,000 runs) are all tried; bigger spaces use a step-by-step search from many starts. The result says which method it used and how many plans it checked, compares the best with your best listed option, flags combinations already in your list, and **Add** puts a found plan into Options. Pharmacy: all 625 role splits in well under a second.
- **Compare situations** (`M.plan.matrix`): every option × Now, Baseline and each situation, with the winner in bold, "out" where a must-have fails, worst, average and wins, plus the **safest all-round** (best worst case) and the best average when they differ.
- **Day plans** (`model.day`, `M.plan.dayRun`): one setting changes hour by hour (type the values or fill them from a shape). A second setting can follow it from the quietest hour to the busiest, and a worked-out column can **carry over** into a setting for the next hour, separately for each option (pharmacy: people still waiting → next hour's backlog). The strip under Situations shows the best option per hour, striped where a queue is carried. The plan only switches for a gain of at least N points, and one plan is named for the whole day. Click an hour to load its settings; **Save hours as situations** turns them into chips.
- **Teach it my taste** (`M.plan.fit`): add "I'd pick A over B" pairs. It shows how many the ranking agrees with, then suggests importances (0–10 steps) that agree with as many pairs as possible while changing as little as possible. If no importance change fixes a pair, it says so and suggests what else might be driving the choice. Pairs are saved with the ranking.
- **Soft must-haves**: each must-have can either **rule it out** or **take off points**. A soft miss shows as a −N tag in the ranking and as a line in the Why panel, is included in the exported JS, and is described in the summary.
- Examples updated: pharmacy and coffee shop have day plans (pharmacy with queue carry-over), the flat has a soft balcony wish, and the RICE example has two saved pairs. Their guides cover the new tools.

## Done in v4.2
- **Runs in the background**: Find the best option, change-by-hour plans and Teach it my taste run in a Web Worker (`js/core/plan-worker.js` via `js/app/runner.js`), so the page never freezes. The finder shows a live progress bar, the number checked and the best so far, and has a **Stop** button. On `file://` or without workers it falls back to the main thread automatically.
- **Change by hour** (`M.plan.hourly`): under the day plan, “Best plan if you can switch every hour” finds the best sequence of options, one per hour, when each switch costs N points (editable, saved as `day.switchCost`). It is a dynamic-programming search over hours that includes queue carry-over (state = current option + carried queue level), so letting a line build up costs you later hours. It shows the plan as a coloured bar, the switch times, the number of switches, the gain over keeping one plan all day, and the queue at closing. Tested: free switching is at least as good as the best single plan, and a huge switching cost never switches.
- **Compare two versions** (`M.plan.compare`): **Pin this version**, change anything, and open Compare. It says whether the winner changed, lists what changed in plain words (importances, directions, curves, settings, must-haves, the combine method, how many values differ) and shows both rankings side by side with ▲/▼ moves. Options are matched by name. You can also **compare with a file** (a ranking JSON someone sent you), and **swap** to the pinned version without losing the current one. The pin is saved with the model but left out of share links.
- **Teach it my taste fits curves too** (`M.plan.fitAll`): when importances alone can't agree with your choices, it also tries each number column's curve (every bit counts, first steps count most, only the top end counts, good enough) and fits the importances again. Suggestions name both kinds of change. Tested: with options A (5,5), B (10,0) and C (0,10) and “A over B, A over C”, importances alone fail and a curve change fixes both.
- Section links (Show me, guide steps) now scroll with room for the sticky bars, so headings are never hidden under them. The app starts from `js/app/main.js` after every module has loaded.

## Done in v4.3
- **Plan by hour with new options** (`M.plan.hourlyFind`): in Find the best option, **Plan by hour** finds new options and the best one for each hour in one go. It collects the top two new combinations for every hour plus the overall best, adds them to your list as candidates (up to 30), then runs the change-by-hour search over all of them. The result marks which hours use a **new** option, and **Add** puts those options into your list.
- **Change by hour is exact**: the search no longer groups the carried queue into bands. For each option it keeps every plan that no other plan beats on both score so far and queue length, so it can't miss a better plan. A test checks it against brute force (every sequence of 3 options over 4 hours, with carry-over).

## Examples (11, all with guides)
| Everyday | Teaches |
|---|---|
| Pick a laptop (default) | importance, direction, sweet spot, must-haves, a budget setting |
| Find a flat | balanced vs add-up, "good enough" commute, points per neighbourhood |
| Choose a job offer | worked-out columns (real hourly pay), text points |
| Prioritise features | RICE as a formula, squashing big numbers |

| Planning | Teaches |
|---|---|
| Pharmacy staffing plan | 4 people × 5 roles, 39 settings in groups, 40+ chained formulas, M/M/c queue, 6 situations |
| News feed backend | capacity and bottleneck, pick(), text results, runway, availability, 5 situations |
| Event crowd control | safety must-haves first, gate queues, 4 situations |
| Coffee shop rush | two-step queue, the bottleneck as a word |
| Care routing | yes/no service rules, distance decay; Sarema General = 79.3, as in the original demo |
| Staff a shop shift | chained queue formulas with if() |
| Choose a supplier | a setting that flips the winner |

## Entry points
| Path | Purpose |
|---|---|
| `index.html` | The app. A first visit shows the example picker |
| `index.html#m=<base64url JSON>` | Opens a shared ranking |
| `index.html#ex=<id>` | Opens an example (`laptop, flat, job, rice, supplier, shift, pharmacy, feed, venue, cafe, care`); add `&view=ranking` to open on the ranking, or `&tour` to start its guided tour |
| `tests.html` | 206 engine tests (v4.3: plan by hour with new options, change-by-hour = brute force) (v4.2 adds finder progress, change-by-hour, curve fitting, version compare): parser, friendly errors, units, every example, exported JS = engine, queue functions, situations |
| `ui-check.html` | 61 checks (v4.2: progress bar, the finder really running in the worker, change-by-hour, pin + compare) driving the real app (results go to the console), including drag speed on the pharmacy |
| `preview-ranking.html` | Opens an example without the start screen, for layout checks (set `data-ex` / `data-view` on `<html>`) |

## Files
```
css/style.css
favicon.svg
js/core/util.js      escaping, number/unit parsing, table parsing, fuzzy suggestions
js/core/formula.js   tokenizer, parser, binder (names → ids, suggestions), evaluator, queue maths, printer, JS output
js/core/model.js     model shape, curves, name resolution, simple-rule ↔ formula
js/core/engine.js    compute (formulas → must-haves → points → score), overrides, sweeps, situations, what-it-takes, trace
js/core/insights.js  verdict and trust checks
js/core/export.js    summary, CSV, JavaScript, JSON
js/core/plan.js      finder (full + step-by-step, progress), situation matrix, day plan with carry-over, change-by-hour search, importance + curve fitting, version compare
js/core/plan-worker.js  Web Worker wrapper for find / hourly / fitAll
js/app/runner.js     runs jobs in the worker or falls back to the main thread
js/app/main.js       starts the app after all modules load
js/app/tools.js      Go further panel, day strip + change-by-hour, finder / matrix / day / pairs / compare dialogs, soft must-have controls
js/examples.js       everyday examples + guides
js/examples-ops.js   planning examples (ported from v3) + guides
js/app/*.js          store, render, setup (tabs), results, modals, guide, events
js/tests/*.js        engine tests, UI checks, helpers
```

## Data model
One JSON model, saved in `localStorage['meridian.studio.v4']`:
`name, question, about, method (add|balanced), columns[{id,label,type number|yesno|text,unit,formula,group,pct,choices}], rows[{id,label,v}], knobs[{id,label,value,min,max,step,unit,group,note}], base{knobId:value}, scenarios[{id,label,values}], rules[{id,label,formula,on,soft,penalty}], day{knob,start,values[],link{knob,lo,hi},carry{col,knob},sticky}, pairs[{a,b}], pinned{at,model}, day.switchCost, criteria[{id,col,on,weight 0–10,want more|less,curve,at,tol,points,range}], guide{level,teaches,steps[]}`.
No server and no table API are used.

## Not done yet
- Within an hour the queue is steady state (M/M/c); only the carried-over value links hours. A minute-by-minute simulation isn't modelled.
- Plan by hour considers the best new options per hour, not every combination in every hour. For spaces over 4,096 combinations, it uses only the overall best ones.

## Suggested next steps
1. Compare more than two versions (a version history with named checkpoints).
3. Let soft must-haves and sweet-spot positions be fitted from your choices too.
