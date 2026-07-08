/* MotionSpec WAAPI lowering (no GSAP) - generated artifact. Do NOT edit by hand. */
/* Spec: staggerReveal  Lowering: web-animations-api (no GSAP) */
(function () {
  if (!('IntersectionObserver' in window) || typeof Element === 'undefined' || !Element.prototype.animate) return; /* progressive enhancement: content stays visible */
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;  /* a11y: respectReducedMotion */
  /* cards-stagger (staggerReveal -> Web Animations API) */
  (function () {
    var els = document.querySelectorAll(".cards > *");
    if (!els.length) return;
    var index = 0;
    for (var i = 0; i < els.length; i++) {
      els[i].style.opacity = "0";
      els[i].style.transform = "translateY(20px)";
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        io.unobserve(el);
        var delay = (index++) * 120;
        var anim = el.animate(
          [
            { opacity: 0, transform: "translateY(20px)" },
            { opacity: 1, transform: 'none' }
          ],
          { duration: 600, delay: delay, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)", fill: 'both' }
        );
        anim.onfinish = function () { el.style.opacity = ''; el.style.transform = ''; };
      });
    }, { rootMargin: "0px 0px -15% 0px", threshold: 0 });
    for (var j = 0; j < els.length; j++) { io.observe(els[j]); }
  })();
})();
