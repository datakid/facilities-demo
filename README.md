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
| `tests.html` | 166 engine tests: parser, friendly errors, units, every example, exported JS = engine, queue functions, situations |
| `ui-check.html` | 46 checks driving the real app (results go to the console), including drag speed on the pharmacy |
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
js/examples.js       everyday examples + guides
js/examples-ops.js   planning examples (ported from v3) + guides
js/app/*.js          store, render, setup (tabs), results, modals, guide, events
js/tests/*.js        engine tests, UI checks, helpers
```

## Data model
One JSON model, saved in `localStorage['meridian.studio.v4']`:
`name, question, about, method (add|balanced), columns[{id,label,type number|yesno|text,unit,formula,group,pct,choices}], rows[{id,label,v}], knobs[{id,label,value,min,max,step,unit,group,note}], base{knobId:value}, scenarios[{id,label,values}], rules[{id,label,formula,on}], criteria[{id,col,on,weight 0–10,want more|less,curve,at,tol,points,range}], guide{level,teaches,steps[]}`.
No server and no table API are used.

## Not done yet
- Day plans and queue carry-over between hours (v3) are not in v4; situations cover the main use.
- The plan finder (trying every role split automatically) is not in v4.
- No fitting of importances from options you rank by hand, and no side-by-side comparison of two rankings.

## Suggested next steps
1. "Find the best option": generate combinations of column values (the old plan finder), using the new engine's overrides.
2. A matrix of every option × every situation, with "safest all-round" picked out.
3. Learn importances from a few pairs the user compares ("I'd pick A over B").
4. Soft must-haves: a penalty instead of ruling an option out.
