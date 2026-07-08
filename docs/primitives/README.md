# Primitive reference

MotionSpec ships a fixed catalog of **40 primitives**. Each one is a
schema-validated motion spec the deterministic compiler lowers into GSAP or native CSS,
with an enforced reduced-motion fallback and a performance budget.

These pages are generated from `primitives/*.json` by `bin/catalog-docs.js`.
Do not edit them by hand — regenerate instead.

| Primitive | Output | Engine | Reduced-motion fallback | Purpose |
| --- | --- | --- | --- | --- |
| [`bounceLoop`](./bounceLoop.md) | `css` | `native-css` | `static` | Endless bouncing — the element springs up and falls back (translateY, 0-50-100 keyframes with ease-out; compositor-friendly). |
| [`breatheLoop`](./breatheLoop.md) | `css` | `native-css` | `static` | Gentle, slow breathing — continuous fading of opacity in and out (opacity only, compositor-friendly; deliberately slow). |
| [`counterUp`](./counterUp.md) | `js` | `gsap.ScrollTrigger` | `instant-visible` | A number counts up from 0 to its target value as it enters the viewport. |
| [`cssTransition`](./cssTransition.md) | `css` | `native-css` | `none-needed` | Simple hover micro-interaction with no JavaScript at all. |
| [`fadeOnScroll`](./fadeOnScroll.md) | `js` | `gsap.ScrollTrigger` | `instant-visible` | Opacity tied to scroll progress — the element softly fades out or in as you scroll (scrubbed). |
| [`flipLoop`](./flipLoop.md) | `css` | `native-css` | `static` | Endless 3D coin flip — continuous rotation around the Y axis (rotateY, GPU-accelerated). |
| [`flipReveal`](./flipReveal.md) | `js` | `gsap.ScrollTrigger` | `instant-visible` | 3D flip on entering the viewport — the element swings open from a tilted position and fades in (fade + rotateX, GPU-accelerated). |
| [`floatLoop`](./floatLoop.md) | `css` | `native-css` | `static` | Gentle, endless floating for decorative elements — continuous looping motion along one axis (compositor-friendly). |
| [`glideLoop`](./glideLoop.md) | `css` | `native-css` | `static` | Endless diagonal gliding — continuous drifting along both axes (translate X+Y; compositor-friendly). |
| [`hoverExpand`](./hoverExpand.md) | `css` | `native-css` | `static` | Hover micro-interaction — the element lifts and scales up on hover (translateY + scale; transform only). |
| [`hoverFlip`](./hoverFlip.md) | `css` | `native-css` | `static` | Hover micro-interaction — the element flips in 3D on hover (rotateY; GPU-accelerated). |
| [`hoverGrow`](./hoverGrow.md) | `css` | `native-css` | `static` | Hover micro-interaction — the element scales up gently on hover (transform only). |
| [`hoverLift`](./hoverLift.md) | `css` | `native-css` | `static` | Hover micro-interaction — the element lifts slightly on hover (translateY upward; transform only). |
| [`hoverRotate`](./hoverRotate.md) | `css` | `native-css` | `static` | Hover micro-interaction — the element tilts slightly on hover (rotate; transform only). |
| [`hoverSink`](./hoverSink.md) | `css` | `native-css` | `static` | Hover micro-interaction — the element sinks slightly on hover (translateY downward; transform only). |
| [`hoverSkew`](./hoverSkew.md) | `css` | `native-css` | `static` | Hover micro-interaction — the element skews slightly on hover (skewX; transform only). |
| [`hoverSpin`](./hoverSpin.md) | `css` | `native-css` | `static` | Hover micro-interaction — the element spins a full turn on hover (rotate 360; transform only). |
| [`jelloLoop`](./jelloLoop.md) | `css` | `native-css` | `static` | Endless, soft wobbling — continuous skew distortion on both axes (jello effect, compositor-friendly). |
| [`kenBurns`](./kenBurns.md) | `css` | `native-css` | `static` | Slow Ken Burns effect — continuous, gentle zooming and drifting (for hero images/backgrounds; transform only). |
| [`marquee`](./marquee.md) | `css` | `native-css` | `static` | Endlessly scrolling horizontal marquee — author the content as TWO identical groups (seamless loop). |
| [`marqueeVertical`](./marqueeVertical.md) | `css` | `native-css` | `static` | Endless vertical marquee — content scrolls steadily upward (ticker, testimonials). Expects duplicated content for a seamless loop. |
| [`parallaxLayer`](./parallaxLayer.md) | `js` | `gsap.ScrollTrigger` | `instant-visible` | Depth offset: the layer moves slower or faster than the rest as you scroll. |
| [`parallaxX`](./parallaxX.md) | `js` | `gsap.ScrollTrigger` | `static` | Horizontal parallax — the element shifts sideways tied to scroll progress (depth, scrubbed). |
| [`pinnedSection`](./pinnedSection.md) | `js` | `gsap.ScrollTrigger` | `instant-visible` | Pin a section in place while its content scrolls through. |
| [`pressShrink`](./pressShrink.md) | `css` | `native-css` | `static` | Press feedback — the element briefly shrinks on activation (:active) and springs back (transform only). |
| [`pulseLoop`](./pulseLoop.md) | `css` | `native-css` | `static` | Gentle, endless pulsing — continuous scaling between rest and target (compositor-friendly, e.g. a subtle attention pulse on CTAs). |
| [`revealScale`](./revealScale.md) | `js` | `gsap.ScrollTrigger` | `instant-visible` | Pop-in on entering the viewport — the element fades in while scaling from slightly reduced up to 1 (fade + scale). |
| [`rotateOnScroll`](./rotateOnScroll.md) | `js` | `gsap.ScrollTrigger` | `static` | Rotation tied to scroll progress — the element rotates as it scrolls through the viewport (scrubbed). |
| [`scaleOnScroll`](./scaleOnScroll.md) | `js` | `gsap.ScrollTrigger` | `instant-visible` | The element scales in proportion to scroll progress (GSAP ScrollTrigger scrub). |
| [`scrollReveal`](./scrollReveal.md) | `js` | `gsap.ScrollTrigger` | `instant-visible` | The element fades in as it enters the viewport. |
| [`skewOnScroll`](./skewOnScroll.md) | `js` | `gsap.ScrollTrigger` | `static` | Skew tied to scroll progress — the element skews (skewY) as it scrolls through the viewport (scrubbed). |
| [`spinLoop`](./spinLoop.md) | `css` | `native-css` | `static` | Endless, uniform rotation — continuous 360-degree spinning (compositor-friendly, e.g. a loader or decorative element). |
| [`squashLoop`](./squashLoop.md) | `css` | `native-css` | `static` | Endless squash and stretch — non-uniform scaling (wider + flatter; the squash-and-stretch principle, compositor-friendly). |
| [`staggerReveal`](./staggerReveal.md) | `js` | `gsap.ScrollTrigger` | `instant-visible` | Fade in multiple child elements one after another, staggered. |
| [`stretchLoop`](./stretchLoop.md) | `css` | `native-css` | `static` | Endless horizontal stretching — continuous, non-uniform scaling of the width (scaleX; compositor-friendly). |
| [`swayLoop`](./swayLoop.md) | `css` | `native-css` | `static` | Gentle, endless swaying — continuous back-and-forth tilting through a small angle (compositor-friendly, decorative). |
| [`swingLoop`](./swingLoop.md) | `css` | `native-css` | `static` | Endless swinging — continuous pendulum motion around a top pivot (transform-origin top, compositor-friendly). |
| [`teeterLoop`](./teeterLoop.md) | `css` | `native-css` | `static` | Endless teetering around a bottom pivot — continuous tipping as if on a base (transform-origin bottom). |
| [`tiltLoop`](./tiltLoop.md) | `css` | `native-css` | `static` | Endless tilting with a pulse — continuous tilting combined with gentle scaling (rotate + scale; compositor-friendly). |
| [`wobbleLoop`](./wobbleLoop.md) | `css` | `native-css` | `static` | Endless wobbling — continuous back-and-forth of translation and rotation (translateX + rotate; compositor-friendly). |
