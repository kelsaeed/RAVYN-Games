# RAVYN Games — Website

## Project

Building a website for **RAVYN Games**. Greenfield — nothing built yet as of 2026-09-02.

Stack: **not decided yet.** Ask before scaffolding. Candidates discussed: plain HTML/CSS/JS,
Next.js, or WordPress (custom theme).

## Direction

The visual target is high-end agency work driven by **scroll-choreographed motion** — pinned
sections, scrubbed reveals, layered typography. Two reference sites were analyzed in detail;
the findings live in [docs/scroll-effects.md](docs/scroll-effects.md). **Read that file before
implementing any scroll animation on this project.**

References analyzed:
- `goats.com.pl` — WordPress + ACF blocks; GSAP ScrollTrigger + Lenis
- `pxpush.com` — Nuxt; pure-CSS layered wordmark driven by one variable

Effects we want to build (all documented with working implementations in the doc):
1. **Hero reveal** — sticky screen, text scrubs in as you scroll
2. **Panel from right** — held section, then a panel slides in to fill the viewport
3. **Scroll-scrubbed video** — scroll position drives `video.currentTime`, works in reverse
4. **Layered wordmark** — stacked copies of the logo fanning out on scroll (footer)

## Ground rules

- **Build fresh, don't copy.** The reference sites' themes are their proprietary work. We
  reproduce *techniques*, never their source, markup, assets, or copy.
- RAVYN Games needs its own identity — do not carry over the references' colors, type, or wording.

## Working notes

- Owner: Khaled (hmsasmahmd@gmail.com)
- Language: Khaled writes in Egyptian Arabic and English interchangeably — reply in whichever
  he used. Technical terms stay in English either way.
