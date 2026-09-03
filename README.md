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
src/logo3d.js       Effect 5b — the extruded chrome raven that docks into the nav
src/effects.js      Effects 1, 2, 4, 6, the watch section, the marquee, the raven
assets/ravyn-bird.svg   traced from KROW_LOGO.svg — #body, #wing, #facets, #pivot-wing
assets/standing-raven.webp  section 1's bird, cut out; .png beside it is the master
assets/flowers/     11 blooms cut to petals only, served as webp
assets/favicon/     the icon set, cut out of Krow.PNG
assets/works/       14 generated placeholders
docs/scroll-effects.md the technique reference every effect is built from
```

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

`black-rose` and `black-cosmos` are cut and sitting in `assets/flowers/` but are
left out of the rotation in `main.js` — against `--bg` they are a silhouette of
nothing. The flower list there is ordered so no two neighbours share a hue.

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
