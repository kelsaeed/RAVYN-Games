# RAVYN Games — prototype

```
node serve.js        →  http://localhost:8080
```

Must be served over http. The page uses ES modules and fetches the logo SVG, so
opening `index.html` from disk will fail on CORS.

## Stack

Deliberately none. Plain HTML + CSS + ES modules, with three.js, GSAP/ScrollTrigger
and Lenis from CDN. Nothing here is framework-specific, so `src/logo3d.js` and
`src/effects.js` drop into Next.js (call them from `useEffect`) or a WordPress theme
(`wp_enqueue_script` with `type="module"`) unchanged. Pick the stack later.

## Layout

```
index.html          markup + CDN tags + importmap
privacy.html        standalone, deliberately loud, honest placeholder
styles.css          identity tokens and all layout
src/main.js         Lenis↔GSAP bootstrap, wiring, asset list
src/logo3d.js       Effect 5b — the extruded mark that turns, and docks into the nav
src/effects.js      Effects 1, 2, 4, 6, the watch section, the marquee, the raven
assets/krow-mark.svg    the mark's outer silhouette, solid, no holes
assets/krow-mark-face.webp  the artwork, cropped to that viewBox, mapped on the caps
assets/ravyn-bird.svg   superseded by krow-mark.svg, kept for reference
assets/standing-raven.webp  section 1's bird, cut out; .png beside it is the master
assets/flowers/     19 blooms cut to petals only, served as webp; 17 in rotation
assets/favicon/     the icon set, rendered from krow-mark.svg in --accent
assets/works/       14 generated placeholders
docs/scroll-effects.md the technique reference every effect is built from
```

## Section names

Sections are named by one big word each, not by a numbered index. The
interrogative carries the accent, the rest is a pale grey ground:

| section | word |
|---|---|
| `#studio` back | **What** we do |
| `.reveal__panel` | **Why** choose us |
| `#work` | **How** we play |
| `#team` | **Who** are we |
| `#contact` | **Where** to find us |

Three things about `.bigword`:

- **It is a ground, not a heading.** `aria-hidden`, `pointer-events: none`, and
  the real heading is still the `h2` above it. The accent half is `--accent` at
  70% rather than flat: at 176px a solid `#f03902` stops being a ground and
  starts competing with the copy it sits under.
- **`right: 0` puts the last letter on the screen edge**, not on the 1600 wrap.
  No compensation needed — `letter-spacing` is negative, so the text box already
  ends short of the final glyph's advance by about its side bearing.
- **A placed word owns the floor of its section.** `.section--floor` and the
  padding on `.watch__screen` exist to keep the content above it off — without
  them the contact button and the team captions land on the letterforms. The
  watch needs padding at the *top* as well, because that screen centres its
  contents and bottom padding alone lifts them into the fixed nav.

`#work` is the exception: its gallery runs to the bottom of the section, so
there the word is `.bigword--flow` — in normal flow between the paragraph and
the gallery, still hard right against the screen.

## The courier, and the contact form

`#contact` is a four-frame animation of a raven getting a message out of a
bottle, plus the form. `assets/email-raven/` holds the frames.

- **They are cropped to a shared box**, not each to its own. Crop them
  individually and the bird jumps a few pixels sideways every time the frame
  changes. Regenerate all four together or not at all.
- **The frames snap; the CSS fade blends them.** Scroll picks an index and the
  90ms transition does the rest. Scrubbing opacity continuously instead turns
  the sequence into a smear of two ravens at once rather than one bird moving.
- **`show()` sets the class on all four**, rather than moving it off the one it
  thinks is showing. Tracking only the current index means anything else that
  touches the class leaves two frames stacked on top of each other.
- Cutting these out was the usual edge-gated fill, but the **glass bottle** is
  nearly the same white as the paper. What saves it is its drawn outline: the
  fill walks the paper, stops at the line, and the bottle's interior is simply a
  region it never reached.

The bubble is `:hover` and `:focus-within` on desktop, and a class toggled by
tap on touch. It is anchored by its *right* edge so the tail lands near the
bird's head instead of out over its tail feathers.

**The form has no backend.** It validates, then hands off to `mailto:`. That
works on a static host but opens the visitor's mail client, which plenty of
people do not have set up — swap it for a real endpoint (Formspree, a worker,
anything) before launch. The textarea is grown by script rather than
`field-sizing: content`, which is not everywhere yet.

## The mark

`assets/krow-mark.svg` is traced from `colored raven logo.svg`. That file is a
**jpeg inside an SVG wrapper** — one `<image>` element, no paths — so there was
no geometry in it to extrude. The trace thresholds on saturation, cleans the
jpeg ringing off the mask, walks the contours and simplifies hard, which snaps
the wobble back onto the straight lines the artwork was drawn with. 251 points.

It comes in two halves that **must be regenerated together**: `krow-mark.svg` is
the outer silhouette and `krow-mark-face.webp` is the artwork, cropped to exactly
that SVG's viewBox. Change one without the other and the art slides off the bird.

- **The slab is solid. No holes.** An earlier pass traced the white facets as
  enclosed contours and extruded them as voids you could see through — the eye,
  the wing slots, the gap between the legs. Khaled's call was that it read as
  weird and gappy, so the interior is cream *surface* now, carried on a texture
  mapped to the caps rather than cut out of the geometry.
- **Separating bird from backdrop is a saturation test.** The backdrop is a
  transparency chequerboard baked into the jpeg and is perfectly neutral
  (saturation 0); the cream facets are warm (saturation ~24). Anything neutral
  and reachable from the border is backdrop, and the cream is walled in by the
  orange outline so the fill can never reach it.
- **The cap UVs are rebuilt by hand.** ExtrudeGeometry's own are raw model
  coordinates, and `flipY` mirrors the positions under them afterwards, so they
  are recomputed from the *final* positions. The side walls get nonsense UVs out
  of that, which costs nothing because the wall material carries no map.
- **Two materials, not one.** ExtrudeGeometry groups the caps as index 0 and the
  side walls as index 1, so the walls get the deep orange of the logo's own
  outline. Flat-coloured, the turn reads as a sticker rotating rather than a slab.
- **The lighting is deliberately soft.** This replaced a chrome mark, and those
  lights blew the cream facets out to flat white every time the face swung toward
  the key. Ambient does most of the work now so the colours stay the colours.

It turns slowly on its own, and you can grab it and throw it — the release
velocity is the last pointer sample, not an average over the gesture, because
what you feel on release is the flick at the end. A drag under 6px still counts
as a click. There is a fixed 0.09rad tilt on X so the quarter turn is not a
plain rectangle. A **drag to turn** label sits under it and retires the first
time you grab it; it also fades out over the first third of the dock flight,
past which the box is too small to render the label legibly anyway.

The old mark had a wing that lifted on scroll energy. That is gone: this
artwork is a single silhouette with no separable wing, and the turn replaces it.

## The raven's flower

Section 1 has a raven with a twig in its beak and a flower on the left end of
it. Hovering the bird rolls the flower; leaving stops it, and whichever bloom
is showing is the one that stays. A tap does the same on touch, focus does it
from the keyboard, and `prefers-reduced-motion` gets one flower per visit
rather than nine a second.

Two things to know before moving anything:

- **`--tip-x` / `--tip-y` are measured off the artwork**, not eyeballed: the
  twig's left end is pixel (97, 329) in a 1024×1536 frame. They only keep
  landing on the twig while the `.raven` box matches that aspect ratio exactly,
  which is why the bird is sized by height with `aspect-ratio` locked and is
  never allowed to letterbox.
- **Every flower sits in the DOM at once** and the roll just moves a class.
  Swapping `src` instead looked identical on a warm cache and dropped frames on
  a cold one.

19 blooms are cut; 17 are in the rotation. `black-rose` and `black-cosmos` sit in
`assets/flowers/` but are left out — against `--bg` they are a silhouette of
nothing. The list in `main.js` is ordered so no two neighbours share a hue,
including across the wrap from the last back to the first.

That rotation is **457KB**. If it needs to come down, drop `MAXSIDE` in the
cutting script rather than the quality — the bloom paints at about 90 css px, so
320 is already 2× on a retina screen.

## Loading and paint cost

Four rules here, all of them things that were got wrong once and are easy to
undo by accident:

- **Only the flower on show is fetched up front.** Seventeen at once is 457KB of
  parallel requests and it was starving the raven photograph, which turned up
  late or not until a reload. The rest load 250ms after `load`, and `start()`
  forces them in case you hover before that. The roll skips any image that has
  not decoded, so it can never blink a hole in the twig.
- **A plain timer, not `requestIdleCallback`.** rIC can be starved of an idle
  period and then the rest never arrive at all — measured, not guessed: 1 of 17
  still loaded long after `load`.
- **No CSS filters on the big images.** The grade on the section-1 bird
  (`saturate(.92) contrast(1.04)`) is baked into the webp — same pixels every
  paint, so the compositor had no business recomputing it on a 1024×1536 image.
  Re-bake with the script rather than re-adding the filter. The bloom's
  `drop-shadow` is gone for the same reason: it re-blurred a sprite nine times a
  second and against `--bg` you could not see it.
- **The mark waits for its texture.** Geometry and texture load together but
  nothing is added to the scene until both land. Adding the mesh on the SVG
  alone put an untextured white bird on screen until the texture arrived, which
  read as three separate loading states.

`krow-mark-face.webp` and `standing-raven.webp` are both `<link rel="preload">`ed
because neither is discoverable early: the texture only once the module graph has
parsed, the bird only once CSS has built the box it sits in.

The source images are stock photos of unknown licence. Clear the rights, or swap
in owned photography, before this goes anywhere public. (A watermarked Vecteezy
comp was among them and has been deleted.)

## Colour

From the supplied palette. All five are used; `--text` is the only derived value,
because the palette has no light tone and body copy needs one.

| token | value | job |
|---|---|---|
| `--bg` | `#0a0c12` | the ground. Load-bearing — Effect 4's occlusion and the gallery edge fades both read it |
| `--flood` | `#023661` | the loud ground. Used exactly twice: the panel that slides in, and the footer |
| `--line` | `#3f3a42` | rules and borders |
| `--muted` | `#76828e` | secondary copy, and the facet grooves on the 3D mark |
| `--accent` | `#db5227` | the sharp word, and nothing else |

The accent is brand furniture plus three sharp words, and nothing else:
**RAVYN** in the nav and the nav dot; **flight** in the headline, **odd** in the
contact line, and the **O** in the footer wordmark. Spend it anywhere else and it
stops being a signal. Accent words in headings are italic — on "flight" the slant
does half the work.

## Type

`--display` in `styles.css` drives the headline, the marquee and the footer
wordmark. That variable is the only place to change when the real face arrives;
the block of comments around it says what to check afterwards.

One thing to know before touching the footer wordmark: **the box is the plate.**
Each copy paints an opaque ground and the copy in front covers it, so only the
top slice of each shows above the main word. That needs the box hugging the
letters, which `text-box: trim-both cap alphabetic` does for any face. A tuned
`line-height` sits behind it as a fallback. Both are commented in place.

## What is real and what is placeholder

**Real** — every effect, and the logo geometry.

**Placeholder, replace before launch:**

- **Colours.** See the table above. Chosen, not briefed.
- **Type.** System stacks. The display face is the biggest single lever on how this
  looks; nothing else here comes close.
- **Gallery images.** `assets/works/*.png`, 1000px tall. Real spec is height 1400,
  variable width, WebP, 60–200KB.
- **Team frames** in the watch section — empty cards with two dots for eyes. Real
  portraits (or short loops) drop straight into `.watch__face`; the rotation rig
  does not change.
- **Social links** — LinkedIn, GitHub, Instagram, TikTok all point at `#` and are
  marked `data-placeholder`.
- **`privacy.html`** — the content is honest about a site that collects nothing, but
  it is not a lawyer's document. It says so at the top, in a colour you cannot miss.
  Rewrite it the day anything real starts collecting data.
- **Copy.** Written to have the right shape and length, not to be kept.
- **Effect 3 (scroll-scrubbed video)** is not wired up — there is no source clip yet.
  The doc has the technique and the ffmpeg line.

## Notes

- The hero headline is invisible at scroll 0 by design; it scrubs in over the sticky
  stage. If that reads as broken rather than deliberate, give the first line a small
  intro tween on load.
- `window.__skim` and `window.__lenis` are debug handles, not API.
- The raven is a **perched** pose, so the wing lifts rather than flaps. See
  *Effect 5b → Perched variant* in the doc for why, and what a flap would cost.
