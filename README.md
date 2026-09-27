# The Unfinished Tapestry

*The Hanging of Ashcombe, begun in the year 1382 and still being stitched.*

A long wool-on-linen embroidery of one fictional English village, which you walk along. The village on the cloth is alive: about a hundred named people, their flock, their geese, their pigs and oxen and dogs, living by your real clock and your real season, running in a Web Worker beside the page. Whatever happens is stitched into the linen as it happens, and the hanging is never finished. You are stitched in too, as a small grey pilgrim.

Ashcombe, its people, its keeper and its hanging are fiction. Nothing here is offered as history, and it is not a copy of any real hanging.

## Run

```bash
npm install
npm run dev          # http://localhost:3000
npm run check        # lint, type-check, unit tests, static export, browser tests
```

Separately: `npm run lint`, `npm run typecheck`, `npm test` (headless simulation tests, Vitest), `npm run build` (static export into `out/`), `npm start` (serves `out/` on port 3262 with a tiny dependency-free server), `npm run test:e2e` (Playwright against that server; build first).

The site is a static export: no database, no API routes, no server actions, no requests at runtime. Fonts are self-hosted by `next/font`.

### Parameters for testing and demonstration

None are needed in ordinary use.

| Parameter | Effect |
|---|---|
| `?fresh` | Begin a new hanging (clears the saved village). |
| `?seed=7` | Found the village from a fixed seed (deterministic). |
| `?clock=2026-12-21T22:00`, `?clock=+3d`, `?clock=-19h` | Move the village's clock (day, night, season, absence). |
| `?tz=Australia/Sydney` | Pretend to be elsewhere (the year turns the other way in the south). |
| `?weather=rain` / `dry` / `spate` / `snow` | Force the weather (`spate` starts with the river high). |
| `?sky=comet` / `meteors` | A hairy star, or falling stars, after dark. |
| `?speed=0` / `1` / `6` | Start stayed, ordinary, or hastened. |
| `?x=930` | Start standing at that point on the cloth (units; the cloth is 1680 long). |
| `?still` | Still pictures (the reduced-motion presentation). |
| `?debug` | Frame rate, detail tier, figures drawn, cache. |
| `?persist=0` | Do not save. |

## What "alive" means here

- **Autonomy.** Nobody is scripted. Each villager chooses what to do from the hour (sleep, meals, work, the evening), the week (mass on Sundays and holy days), the month's labour, the weather, their trade, age, needs and people. Leave the tab open and they carry grain to the mill, gather firewood, chase an escaped goose, argue across the green, go to the alehouse, go to bed.
- **Emergence.** Meetings happen where people are near each other. Talk warms ties and carries rumours, which can change in the telling; quarrels sour ties and become rumours of their own. Courtship arises from fondness between the unmarried, becomes betrothal, a wedding at the church door, a feast, a new household (and, if no house is free, a new cottage stitched into the unfinished linen). The priest, the reeve and the alewife become the village's crossroads because their work puts them among people; a test checks that they meet more people than most.
- **Needs and consequences.** Villagers eat from household stores, ground at the mill for a toll; strips are ploughed, sown, reaped and carted only when someone does the work; the harvest's quality follows that year's growing weather. A poor harvest empties the stores in winter: hunger, alms from the manor, the odd theft, more sickness. People fall sick and recover or die; a death rings the passing bell, and a procession carries the bier to the churchyard, where a grave is stitched.
- **Memory.** The village is saved in IndexedDB (versioned; an old or broken save founds a new village). Come back and a bounded absence model advances it by the real time away (hour steps for a fortnight, three-hour steps after, at most 120 days), using the same rules for lives, labour, weather, talk and the sky. What happened is stitched into the lower border as it would have been, marked as done while you were away, and the keeper leaves you a note.
- **Real time and place.** The real date sets the month's labour (feasting, pruning, sowing, lambing, weeding, haymaking and shearing, harvest, threshing, ploughing, pannage, slaughter); the real clock sets the day; bells ring the hours; your time zone decides the hemisphere. One year of a villager's life passes in four real days, so a season of visits sees a generation marry, bear and bury.
- **Individuality.** Everyone has a name (the kind a fourteenth-century village gave), a byname, a household, a trade, kin, friends, grudges with their causes, what they have heard, and a biography built only from what is recorded of them.

## The stranger (you)

When you arrive, the needle stitches a small grey pilgrim at the hem of the cloth, and a tag says *you*. It walks to wherever you stand as you walk; if you jump far along the cloth it is unpicked and stitched anew. It is an agent in the village: villagers see it and react by their natures and by what they have heard. Children follow it, the priest greets it, the reeve watches it, the alewife calls it in, dogs bark; the first to see it starts the talk, and word of the stranger passes from person to person (you can follow the threads on the back of the cloth). They remember you between visits, may grow fond or wary, may blame you for a sick ewe, and may name a child after you. Nothing about you is used but the fact and timing of your visits.

## Three more surprises

1. **Turning the cloth over.** The back of the hanging shows the ghost of the scene in reverse, and over it the threads that are the village's real ties: kin in walnut, marriages and courtships in rose, friendships in sage, grudges knotted in madder, and the talk of you in woad, each thread from teller to hearer. Pick a figure to see only theirs.
2. **The river in spate.** Rain from the real date and chance raises the river. Over a threshold it floods the meadow, damages the corn nearest the water, races the mill wheel and stops the stones; at a higher one it may carry off the footbridge. The village turns out to drive the flock to high ground (and a sheep may be lost if nobody comes); people wade the ford until the carpenter mends the bridge, and shared work in the flood mends old quarrels.
3. **The hairy star.** On the real nights of the annual meteor showers, and on a few comet nights a year (deterministic per village), the sky is stitched with falling stars or a hairy star. People stay up to look ("ISTI MIRANTUR STELLAM"), the pious pray, a rumour of omens runs round (and can turn against the stranger), the priest preaches on it next morning, and a wedding due in the next days is put off.

## The hanging

Scroll is walking. The page scrolls normally; a tall section holds a sticky stage, and how far you have scrolled is how far along the cloth you stand. Horizontal wheel and trackpad gestures, arrow keys (Shift for long steps), horizontal swipes and the woven selvedge strip all move that same scroll position, so nothing is hijacked. Below the walk is the parish roll.

The cloth has an upper border of stitched inscriptions saying what is happening in each scene (simple Latin with an English gloss beneath, generated from events and activities), the main field, and a lower border that is the chronicle. The scenes run from the forest edge through the open fields, the river and the mill, the green with the church and the alehouse, the manor, and the common and the fold, to the unfinished end: bare linen with ink underdrawing, a threaded needle at work, loose strands and the roll of linen not yet worked.

Resting the pointer on a villager names them and offers them (click for their life); resting it on, or tapping, a lower-border vignette shows its English. The glass stitches the patch under it afresh at its own magnification, in small cells, so it stays sharp without re-stitching whole tiles.

## Architecture

| Concern | Where |
|---|---|
| Simulation core (pure, headless, seeded) | `src/sim/` (`sim.ts` the step and movement; `schedule.ts` the day; `social.ts` meetings, gossip, quarrels, courtship; `life.ts` births, sickness, deaths, funerals, weddings, households, trades, the reeve; `economy.ts` strips, harvest, mill, stores, hunger; `elements.ts` river and sky; `stranger.ts`; `inscriptions.ts`; `chronicle.ts`; `catchup.ts` the absence model; `persist.ts`; `census.ts` roll, biographies, "what is happening now"; `calendar.ts` clock, hemisphere, labours, feasts, weather, showers and comets; `founding.ts`; `geography.ts`) |
| Worker bridge and protocol | `src/worker/` (fixed-step loop at four steps a second, hastening bounded to an hour ahead of the real day, packed positions in transferred buffers with a return pool, IndexedDB, hidden-tab pause and catch-up) |
| Embroidery renderer | `src/loom/` (`strand.ts` wool strand sprites, knots, linen weave, couched fill patterns; `stitches.ts` stem, split, running, satin, laid-and-couched, French knots, seed stitch; `letters.ts` the stitched capitals; `scenery.ts` landscape, buildings, borders, night sky, the unfinished end; `patches.ts` everything that changes; `loom.worker.ts` stitches tiles and patches in OffscreenCanvas; `cache.ts`; `needle.ts` stitch-in jobs and the needle; `figures.ts` people and beasts drawn live; `atmosphere.ts` night light, rushlights, rain, snow, falling stars, birds, the mill wheel, the bell; `renderer.ts` composition and the back of the cloth) |
| Event and inscription grammar | `src/text/latin.ts` (Latin with glosses), `src/text/keeper.ts` (the keeper's voice) |
| Stage, input, accessibility behaviour | `src/client/stage.ts` (scroll as walking, frame loop reading scroll each frame, keyboard, wheel, touch, lens, flip, stills, follow, test hooks), `village-client.ts`, `store.ts`, `perf.ts`, `params.ts` |
| Editorial UI | `src/components/` (the hanging and the wall label, captions, the floor with the needle control and the selvedge, biography, "what is happening now", the keeper's return note, the back-of-cloth legend, the parish roll, the colophon) |

No per-frame values live in React state and nothing listens to scroll events for per-frame work; the loop reads `scrollY` each frame. Stitch geometry is cached: static tiles and changing patches are stitched once in the loom worker and only re-stitched when something changes, which the needle then reveals row by row or letter by letter.

## Accessibility

- A prominent **Stay the needle** control stops the simulation and all motion (WCAG 2.2.2): the renderer keeps its own animation clock, which stands still while the needle is stayed, so rain, snow, birds, falling stars, the needle's dip, the bell, the mill wheel and every figure's pose freeze with the village, and the page stops redrawing. A bounded **Hasten** runs it a little faster.
- **Still pictures** (on under `prefers-reduced-motion`, and a setting for anyone): the village keeps living, but the cloth shows a new still every four seconds, the needle stitches by fading, following a villager becomes an occasional jump, and there are no birds, rain streaks or falling stars in motion. Each still holds one pose per figure (figure time is held with the still), so nothing moves between stills.
- Keyboard: every control is a button or link; arrow keys walk; the selvedge jumps to scenes; a "People in view" list (revealed on focus) lets you pick any villager without a pointer; the glass moves with arrow keys.
- Screen readers: the canvas has a description; "What is happening in Ashcombe now?" gives a written account from the simulation's state; a polite, rate-limited live region announces notable events (can be turned off); every Latin line has its English gloss; the parish roll is real tables.

## Performance

The simulation costs about 0.1 to 0.3 ms a step (four steps a second) for about 100 villagers and 45 animals, off the main thread. The absence model runs a week in about 0.1 s and its 120-day cap in about 0.5 s. Rendering is budgeted: the renderer's own work is about 1 ms a frame on a desktop and about 11 ms for the busiest scene with the CPU throttled four times. Detail steps down by device class and sustained frame time (two-second windows, 90th-percentile interval): the stem-stitch sheen on figures, then device pixels, then a 30 fps cap and a reduced-resolution canvas.

Measured on the production build in Chromium with GPU acceleration (RTX 4070 laptop), village at seed 7 on the green in mid-afternoon, about 145 agents:

| Viewport | CPU | Frame rate | p90 frame | Figures drawn |
|---|---|---|---|---|
| 390 × 844 | 1× / 4× | 60 / 60 | 18 / 17 ms | 9 |
| 768 × 1024 | 1× / 4× | 60 / 60 | 18 / 18 ms | 13 |
| 1440 × 900 | 1× / 4× | 60 / 60 | 18 / 18 ms | 25 |
| 2560 × 1440 | 1× / 4× | 60 / 60 | 18 / 18 ms | 26 |
| 1440 × 900, comet night, whole village on the green | 4× | 57 | 20 ms | 72 |
| 1440 × 900, back of the cloth | 4× | 56 | 19 ms | 28 |

Without GPU acceleration (software rasterisation), 1440 × 900 runs at 60 fps unthrottled; with the CPU throttled four times the adaptive tiers settle at about 23 fps (reduced-resolution canvas, 30 fps cap). While the view stands still, the stitched background is kept as one cached layer and only what moves is redrawn. Hidden tabs stop both the frame loop and the worker; a stayed, still view redraws only when something changes.

`node scripts/perf.mjs` re-measures (needs the static server running).

## Dependencies

Only what the stack requires: Next.js 16.3.6 (App Router, static export), React 19.2.8 as pinned by that release, Tailwind CSS 4, TypeScript. Development only: Vitest (headless simulation tests in Node) and Playwright (behavioural browser tests). Typefaces, self-hosted through `next/font`: Alegreya (book text), Alegreya Sans SC (labels), Uncial Antiqua (Latin set in type); the cloth's own lettering is a stroke alphabet stitched in code.

## Art direction references

Four reference frames were generated before building (the green at haymaking, a winter night by rushlight, a close study of the stitches, the unfinished end with the needle) and kept out of the build in `.design/reference/`. Principles taken from them: the linen is the sky and most of the ground; colour goes into figures, trees and buildings standing on ground lines; night is laid woad thread, not a tint; fills have strong direction and outlines are darker than fills; faces are bare linen with a knot for an eye; water is satin stitch in two or three blues; the unfinished end is a ragged frontier, sparse underdrawing and loose strands.
