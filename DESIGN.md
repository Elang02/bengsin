# Bengsin — design system

World: **forecourt instrument**. A price board you read from a car window, crossed with
a receipt. Paper, ink, hairlines, tabular numbers, one oxblood accent. No cards, no
shadows, no rounded panels, no icons that are really emoji.

Everything lives in `public/`: `index.html`, `styles.css`, `app.js`, `fonts/`,
`favicon.svg`. No build step, no Tailwind CDN, no framework.

## Tokens

```css
--paper:    #e7e8e3   /* page ground: concrete, not cream */
--surface:  #f6f7f3   /* inputs, quiet fills */
--ink:      #1a1b17   /* body text, figures */
--ink-2:    #3f423a   /* secondary text */
--muted:    #636659   /* labels, meta, units (4.8:1 on paper) */
--line:     #d3d6cc   /* hairlines inside blocks */
--line-2:   #bbbfb2   /* section rules, group borders */
--brand:    #8b1538   /* oxblood: active tab, primary action, picked fuel */
--brand-2:  #6f0f2c   /* pressed */
--ok:       #2c6644   /* savings, positive delta */
--err:      #9d1d1d   /* errors */
--panel:    #1a1c17   /* readout panel ground */
--panel-ink:#f1f2ea   /* text and figures on the panel */
--hair:     rgba(241,242,234,.16)  /* hairlines on the panel */
--dim:      rgba(241,242,234,.68)  /* labels on the panel */
--r:        3px
--max:      1160px
--pad-x:    24px
```

The ground is a cool concrete grey, not warm cream: cream-and-terracotta is the most
worn-out "tasteful" AI surface, and a forecourt is concrete anyway. Placeholder text is
`#6a6f5f` (4.8:1 on `--surface`).

Colour rules: paper and ink carry the page; oxblood appears only on the active tab, the
one filled button per view, the picked fuel row, and the wordmark dot. `--ok` appears only
in the comparison delta. Nothing else is coloured.

## Type

One family: **Saira** variable (wght 100–900, wdth 50–125), self-hosted
(`public/fonts/saira-latin.woff2`, `saira-latin-ext.woff2`). No system display face, no
serif, no second family.

| Role | Setting |
| --- | --- |
| h1 | 2.875rem / 640 / wdth 84 / -0.035em |
| h2 (section) | 1.0625rem / 620 / -0.012em |
| body / lede | 0.9375–1rem / 380–420 / 1.55 |
| field label | 0.8125rem / 560 / ink |
| field meta, units | 0.75rem / 400 / muted |
| readout label | 0.6875rem / 560 / letterspacing .01em / dim |
| readout figure | 3.5rem / 580 / wdth 78 / tabular-nums / -0.025em |
| table figures | 0.875rem / tabular-nums |

Numbers are always tabular. Money is `Rp 303.448`; litres `30,3`; km/L `14,5`.

## Layout

- Page: `max-width: 1160px`, `--pad-x: 24px` (18 px under 420 px), sticky 60 px header
  with a 1 px rule.
- Hitung: intro (h1 + lede at 84 % of the text column), then a two-column layout —
  `minmax(0,1fr) 384px`, gap 56 px. The right column is a dark readout panel that sticks
  at 84 px while the form scrolls.
- Fields are separated by hairlines, never boxed. A field is: label + right-aligned meta
  on one baseline, control underneath, optional hint under that.
- Under the lede, a one-line ticker carries today's four cheapest prices for the city.
  It is a flat text row on desktop and a horizontally swipeable strip under 640 px.
- Price board: a real `<table>`, brand cells span their group with `rowspan`, prices
  right-aligned. Full width, below the fold.
- Garage: `380px minmax(0,1fr)` — vehicles left, ledger right. Sections carry a rule
  under their head, not a box.

## Components

- **Buttons**: `.btn` 40 px, radius 3, ink fill for primary, hairline `--line-2` for
  secondary (`btn--line`), bare text for `btn--quiet`. One filled button per view.
- **Segmented control**: radio labels, 1 px border, checked segment fills ink with
  `--panel-ink` text. Used for vehicle type, days per week, and auth mode.
- **Road**: the distance control. A transparent `<input type="range">` (1–60 km) sits over
  a dashed lane; the travelled part is solid ink, three ticks mark 25/50/75 %, and a
  48×20 car silhouette rides the lane. The car is the thumb, so dragging it changes the
  number; a 72 px number input underneath is the exact-value path (and the only path on
  reduced motion).
- **Slots**: vehicle A/B as a bordered chip with a letter key in a 18 px square and an
  × to clear.
- **Readout panel**: `--panel` ground, radius 3, 22 px padding. Contains label, vehicle
  name, figure, per-workday line, a `<dl>` chain (Jarak tempuh / Bensin / BBM),
  comparison block, and one hairline button.
- **Price table**: header in 0.75rem muted, rows separated by `--line`, groups by
  `--line-2`. The picked fuel row tints `#eef0e6` and its product line gets an oxblood
  "dipakai …" note. Incompatible fuels drop to 45 % opacity with a "tidak cocok" note.
  Every compatible row also prints what that fuel would cost this vehicle per month,
  under the price — the table doubles as the "what if I switch" answer.
- **Docket**: the signed-out garage explains itself as three hairline rows (Kendaraan /
  Riwayat / Ringkasan) beside the notice, never as a feature grid.
- **Toast**: fixed bottom center, ink ground, 2 s, `role="status"`.

## States

Every async surface has four: loading (four skeleton rows in the vehicle list, quiet
text in field meta), empty (a sentence and the next action), error (one sentence + a
retry link), filled. No spinners. Disabled primary buttons
keep their colour at 50 % opacity. `[hidden]` is global `display: none !important` so no
class can resurrect a hidden element.

## Responsive

Breakpoints: 1000 px (layout collapse), 900 px (garage), 560 px (form grid), 420 px
(header, table). Under 1000 px the readout becomes a fixed bottom bar: vehicle name +
"Rincian" toggle, figure, per-workday line; tapping expands a sheet with the chain and
the copy button over a scrim. The page reserves 112 px at the bottom. The brand column of
the price table hides under 420 px and each group gets a small brand line instead.

## Motion

One easing: `cubic-bezier(.22,.8,.2,1)`, and only transform/opacity move.

- 150 ms: the car slides along the lane when the distance changes, dash fill follows.
- 180 ms: page switch fades and lifts 4 px; a board row settles when the pick moves.
- 200 ms: auth sheet rises 8 px and scales 0.99, backdrop veils in.
- 240 ms: the figure ticks (`translateY` + opacity) when the number changes.
- 120–140 ms: press feedback (`scale(.988)` on buttons, `scale(.98)` on chips).

Nothing animates on load and nothing animates on scroll. `prefers-reduced-motion: reduce`
collapses every duration to 0.01 ms, which also disables the car's slide — the number
input remains the way to move it.

## Known detector exceptions

`impeccable detect` reports 12 `cramped-padding` warnings: ten on `.field` (measured gap
from the section rule to the label is 25 px, so the finding does not match the rendered
page) and two on `.seg` (a segmented control's segments are the border box; its text
carries 14 px horizontal padding). No other findings as of the last run.

## Do not

Cards as page structure, nested cards, eyebrow kickers, numbered sections, one-sided
border bars, hard offset shadows, gradient text, glass, emoji or unicode as icons, browser
`alert`/`confirm`, spinners, decorative illustration, a second typeface, rounded corners
above 3 px (only the auth dialog, at 6 px, is allowed).
