---
name: The Unfinished Tapestry
description: A living wool-crewel hanging on undyed linen, walked along, in a cold stone hall.
colors:
  linen: "#c8c0aa"
  linen-panel: "#d5cdb8"
  linen-panel-deep: "#c6bda6"
  stone: "#4a5358"
  stone-deep: "#3c4448"
  stone-night: "#1b1f22"
  ink-on-stone: "#efece2"
  ink-on-stone-dim: "#ddd8cb"
  ink-on-linen: "#1f2c3a"
  ink-on-linen-2: "#463d30"
  madder: "#a4442d"
  madder-ui: "#b5553a"
  madder-ink: "#86351f"
  madder-pale: "#c47f6b"
  woad: "#3d5a78"
  woad-pale: "#85a0b3"
  weld: "#cfa23a"
  weld-ui: "#dcb34e"
  sage: "#7e8d58"
  sage-dark: "#56633b"
  walnut: "#6a4d34"
  walnut-dark: "#3e2d20"
  cream-wool: "#dfd2b4"
  grey-wool: "#948e82"
typography:
  display:
    fontFamily: "Stitched stroke capitals (drawn in thread in code); no web font"
    fontWeight: 400
    letterSpacing: "0.26em per letter, 0.62em per word with an interpunct knot"
  body:
    fontFamily: "Alegreya, Iowan Old Style, Georgia, serif"
    fontSize: "1.02rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Alegreya Sans SC, sans-serif"
    fontSize: "0.98rem"
    fontWeight: 500
    letterSpacing: "0.05em"
  latin:
    fontFamily: "Uncial Antiqua, serif"
    fontSize: "0.98rem"
    fontWeight: 400
    letterSpacing: "0.02em"
  scale:
    xs: "0.78rem"
    label: "0.86rem"
    small: "0.92rem"
    body: "1.02rem"
    lead: "1.12rem"
    h2: "1.5rem"
    h1: "2.4rem"
    display: "clamp(2rem, 4vw, 3rem)"
rounded:
  none: "0"
spacing:
  gutter: "clamp(16px, 3.2vw, 44px)"
  floor: "132px"
components:
  needle-button:
    backgroundColor: "{colors.linen-panel}"
    textColor: "{colors.ink-on-linen}"
    rounded: "{rounded.none}"
    padding: "6px 16px 6px 12px"
    height: "52px"
  needle-button-stayed:
    backgroundColor: "{colors.madder-ui}"
    textColor: "#fbf4e6"
  tool:
    textColor: "{colors.ink-on-stone}"
    typography: "{typography.label}"
    height: "44px"
  tool-pressed:
    textColor: "{colors.weld-ui}"
  panel:
    backgroundColor: "{colors.linen-panel}"
    textColor: "{colors.ink-on-linen}"
    rounded: "{rounded.none}"
  selvedge:
    backgroundColor: "{colors.linen-panel-deep}"
    textColor: "{colors.ink-on-linen}"
    height: "36px"
---

## Overview

One object in one room. The hanging is undyed linen worked in wool with natural dyes (madder, woad, weld, overdyed sage, walnut, undyed cream and grey); it hangs from a wooden rod in a cold slate-stone hall that darkens with the visitor's real night. Everything alive on the cloth is drawn in code from stitches (stem, split, running, satin, laid-and-couched, French knots) so it can change and be restitched. The interface is the hall: a label on the wall, captions under the cloth, a floor with the needle control and a woven selvedge for finding one's way. The work leads; the interface recedes.

It is not engraving, parchment, brass, glass or lacquer, and it is not a game map.

## Colors

- **Back of the cloth**: kin walnut (dimmed), husband and wife rose, walking out weld, friends sage, grudges madder with knots, talk of you woad dashes.
- **Linen** is the ground and the sky. Most of the cloth is bare linen; colour goes into figures, trees, buildings and lettering, never into large fills of "sky" by day.
- **Dyes** are only the natural ones above, each as three shades (light, mid, dark) that every strand is shaded from, with per-stitch unevenness. Words in the inscriptions alternate woad, madder, sage-dark and walnut.
- **Night** is laid woad thread across the sky (a second set of tiles), stars as cream knots, and a multiply dimming of the whole cloth with warm rushlight glows where people are awake. The hall's stone mixes toward `stone-night` by the same clock (`--night`).
- **UI accents**: weld for focus rings, pressed tools and the selected villager's name; madder for the stayed needle. Text on linen panels uses `ink-on-linen`; madder as text on linen must be `madder-ink`.
- Contrast: every text pairing is at least 4.5:1 by day and by night, in both colour schemes.

## Typography

- The cloth's lettering is a single-stroke capital alphabet stitched in stem stitch (`src/loom/letters.ts`); the title on the wall uses the same alphabet as SVG thread. Latin is shown with U, not V, for legibility.
- Alegreya for all reading (the keeper's note, captions in italic, biographies, the roll); Alegreya Sans SC for labels and controls; Uncial Antiqua only for Latin set in type (mobile captions, biography Latin names, the roll's lower-border column).
- One ramp, as CSS tokens `--fs-xs` to `--fs-display`: xs 0.78rem (selvedge on phones), label 0.86rem (tags, signatures), small 0.92rem (hints, tools, captions on phones), body 1.02rem, lead 1.12rem, h2 1.5rem (sheets), h1 2.4rem (the roll), display clamp(2rem, 4vw, 3rem).
- The capitals are laid by hand: each letter a little its own in width, lean and baseline, long strokes slightly bowed, with a short cross-stitch serif at the head and foot of every upright or slanting stroke.
- No em-dashes anywhere. Latin is simple and checked; every Latin line has its English gloss. Lower-border vignettes show their English on hover or tap.

## Layout

- The walk: a tall section with a sticky, full-height stage. Scroll distance equals distance along the cloth; the band is scaled to fill the height between a rod strip above and the floor below (desktop scale is capped around 11 to 12.5 px per cloth unit).
- The wall label sits left of the hem and moves with the cloth; at the start it takes about a third of a desktop view, half on tablet, and nearly the whole first screen on a phone.
- Captions sit under their inscriptions on desktop, following them by transform; on phones the band is cropped to the main field and lower border, and the current inscription is set above it in Latin and English.
- The floor: controls in one row (needle, hasten; then tools), the selvedge beneath at full width with scene names proportional to their length on the cloth (short names below 1100px).
- The parish roll follows the walk as a large linen panel with three columns of registers (one on phones).

## Elevation & Depth

- The cloth is flat; depth on it comes only from stitches (each strand casts a small shadow and puckers the linen) and from the long soft folds of the hanging.
- Panels (biography, dialogs, the roll, the legend, the glass's hint) are pieces of linen above the stone: a soft dark shadow (black at 0.3 to 0.5 alpha, the one neutral outside the dyes) and a dashed stitched line inset from the edge.
- Tags on the cloth: "you" in linen, the chosen villager in weld, whoever the pointer rests on in deep stone (names in small caps, glosses in italic).
- The glass (lens) is a round magnifier with a walnut rim and a shadow.

## Shapes

- Square corners everywhere; no pills, no rounded cards. The only curves are in drawn objects (the needle's point, the thread through its eye, a thread-end swatch, knots), never on UI containers. Edges are stitched: dashed outlines, running-stitch rules, knots.
- Icons are not used; controls are words. The needle control carries a small drawn needle and thread, part of the object world.

## Components

- **Needle control**: the most prominent control, a linen tab with madder running-stitch rules; pressed it turns madder ("The needle is stayed").
- **Tools**: small-caps words underlined in a dashed thread; pressed turns weld with a solid underline.
- **Selvedge**: a woven tape with woad and madder edge stripes; a weld window shows where you stand, a grey knot where the stranger is, a weld knot below for the chosen villager.
- **Biography**: linen panel (bottom sheet on phones) with the Latin name, name, age and trade, "Now", the stitched life, kin, friends, grudges, what they have heard, and Follow.
- **Captions**: italic Alegreya glosses under inscriptions; they fade in and out as slots come into view.
- **Registers**: real tables with small-caps headers and dashed stitched rules between rows.

## Do's and Don'ts

- Do draw anything that can change as a patch the needle can restitch; do reveal new work in stitching order.
- Do keep figures in profile with the long proportions of narrative embroidery; faces and hands stay bare linen with a stem outline and a knot eye.
- Do keep linen as the sky; add clouds, birds and horizon trees sparingly.
- Don't use gradients as decoration, glass, neon, pills, parchment, blackletter, brass or dark lacquer.
- Don't introduce colours outside the dye list, and never pure black or pure white.
- Don't add React state per frame or scroll listeners; move DOM overlays by transform in the frame loop.
