/* MotionSpec WAAPI lowering (no GSAP) - generated artifact. Do NOT edit by hand. */
/* Spec: flipReveal  Lowering: web-animations-api (no GSAP) */
(function () {
  if (!('IntersectionObserver' in window) || typeof Element === 'undefined' || !Element.prototype.animate) return; /* progressive enhancement: content stays visible */
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;  /* a11y: respectReducedMotion */
  /* card-flip (flipReveal -> Web Animations API) */
  (function () {
    var els = document.querySelectorAll(".card");
    if (!els.length) return;
    for (var i = 0; i < els.length; i++) {
      els[i].style.opacity = '0';
      els[i].style.transformOrigin = 'center top';
      els[i].style.transform = "perspective(800px) rotateX(90deg)";
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        io.unobserve(el);
        var anim = el.animate(
          [
            { opacity: 0, transform: "perspective(800px) rotateX(90deg)" },
            { opacity: 1, transform: 'perspective(800px) rotateX(0deg)' }
          ],
          { duration: 700, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: 'both' }
        );
        anim.onfinish = function () { el.style.opacity = ''; el.style.transform = ''; el.style.transformOrigin = ''; };
      });
    }, { rootMargin: "0px 0px -20% 0px", threshold: 0 });
    for (var j = 0; j < els.length; j++) { io.observe(els[j]); }
  })();
})();
