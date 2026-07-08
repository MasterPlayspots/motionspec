/* MotionSpec-Compiler vX - generated artifact. Do NOT edit by hand; the spec is the source. */
/* Spec: hero  Target: vanilla-gsap */
(function () {
  if (typeof gsap === 'undefined') { console.warn('[motion] GSAP not loaded.'); return; }
  gsap.registerPlugin(ScrollTrigger);
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;  /* a11y: respectReducedMotion */
  /* hero-headline (scrollReveal) */
  gsap.from(".hero h1", Object.assign({"opacity":0,"y":48}, { duration: 0.8, ease: "power3.out", stagger: 0.08, scrollTrigger: { trigger: ".hero h1", start: "top 80%", once: true } }));
  /* feature-cards (staggerReveal) */
  gsap.from(".features .card", Object.assign({"opacity":0,"y":32}, { duration: 0.6, ease: "power2.out", stagger: 0.12, scrollTrigger: { trigger: ".features .card", start: "top 85%", once: true } }));
  /* hero-bg (parallaxLayer) */
  gsap.to(".hero .bg", { yPercent: -25, ease: 'none', scrollTrigger: { trigger: ".hero .bg", start: "top bottom", end: "bottom top", scrub: 1 } });
  /* showcase (pinnedSection) */
  ScrollTrigger.create({ trigger: ".showcase", start: "top top", end: "+=120%", pin: true, pinSpacing: true });
})();
