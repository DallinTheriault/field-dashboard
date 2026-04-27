# Field Brand Kit

The official logo, color, and typography assets for Field.

## What's in here

```
01-mark/                  The mark on its own (no wordmark)
02-lockup-horizontal/     Mark + field wordmark, side by side
03-lockup-stacked/        Mark + field wordmark, stacked vertically
04-wordmark/              field wordmark only (no mark)
05-app-icon/              Square + rounded icon for iOS / Android / desktop apps
06-favicon/               Browser tab favicon (multiple sizes)
07-social/                Square social media avatars (Twitter, LinkedIn, etc.)
08-palette/               Color palette reference
brand-guidelines.html     Visual usage guide — open in a browser
```

Each folder contains an `svg/` subfolder (vector source — preferred) and a `png/` subfolder (transparent backgrounds, multiple sizes).

## Picking the right file

**On a dark background?** Use a `-bone` file (off-white mark).
**On a light background?** Use an `-ink` file (off-black mark).
**Single-color print, embroidery, embossing?** Use a `-mono` file (no salmon/lime poles).
**Anywhere else?** Use the default file (with the colored poles).

## File naming

- `mark-bone.svg` — mark only, off-white curves, salmon + lime poles (use on dark backgrounds)
- `mark-bone-mono.svg` — mark only, off-white, no color (mono, on dark)
- `mark-ink.svg` — mark only, off-black curves, salmon + lime poles (use on light backgrounds)
- `mark-ink-mono.svg` — mark only, off-black, no color (mono, on light)
- `lockup-h-bone.svg` — horizontal lockup, light variant (for dark backgrounds)
- `lockup-h-ink.svg` — horizontal lockup, dark variant (for light backgrounds)
- `lockup-s-bone.svg` — stacked lockup, light variant
- `lockup-s-ink.svg` — stacked lockup, dark variant
- ...and so on.

## SVG vs PNG

**Use the SVG** whenever possible. SVGs scale to any size without losing quality, are tiny, and ship with the wordmark already converted to paths (no font dependencies — General Sans does not need to be installed).

**Use the PNG** when SVG isn't supported (legacy email clients, certain CMSes, social media uploads). PNGs are at 256, 512, 1024, and 2048 px depending on the asset.

## Colors

```
Ink (off-black):   #0a0a0a
Bone (off-white):  #f7f5f0
Salmon (primary):  #FF6B6B
Lime (offset):     #BEF264
```

Full palette in `08-palette/`. The system rules:

- **Salmon-500 (#FF6B6B) is the brand color.** It dominates wherever color appears.
- **Lime-500 (#BEF264) is the offset accent.** Used sparingly — at the right pole of the mark, at hover/active states, on accent ticks. Never as a primary brand element.
- Don't introduce a third accent color.
- Reserve red for UI errors and yellow for UI warnings — both are conventional and shouldn't compete with brand colors.

## Typography

Wordmark uses **General Sans Medium (500)** with letter-spacing applied (-0.025em). The wordmark is rendered as paths in all SVG files — you don't need General Sans installed to use them.

For body copy and UI: pair General Sans (any weight) with Inter at 14–16px. For lighter editorial moments, Inter Light (300) or ExtraLight (200) at large sizes.

## Don't

- Don't recolor the mark (salmon must stay #FF6B6B; lime must stay #BEF264; never substitute different shades)
- Don't add gradients, shadows, glows, or 3D effects
- Don't put the mark on a busy photo background — use bone or ink only
- Don't squish, stretch, rotate, or skew the lockup
- Don't introduce a third accent color
- Don't capitalize the wordmark — it's "field" lowercase, always
- Don't use lime as a primary color — it's the offset, not the brand
- Don't recreate the mark from scratch — use the supplied SVG (the asymmetric curve placements are tuned)

## The brand concept (one paragraph)

Field is named for the physics concept — the invisible region of force around a charge, visualized with curved field lines. The mark is an asymmetric magnetic dipole: two charged poles (salmon, lime) connected by four field lines that bend through the space between them. The asymmetry is intentional: real field lines aren't perfect mirror images, and neither is ours.

See `brand-guidelines.html` for visual examples and full usage guidance.
