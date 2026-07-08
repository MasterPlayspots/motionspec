/* MotionSpec WAAPI lowering (no GSAP) - generated artifact. Do NOT edit by hand. */
/* Spec: counterUp  Lowering: web-animations-api (no GSAP) */
(function () {
  if (!('IntersectionObserver' in window) || typeof Element === 'undefined' || !Element.prototype.animate) return; /* progressive enhancement: content stays visible */
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;  /* a11y: respectReducedMotion */
  /* kpi-counter (counterUp -> requestAnimationFrame, no GSAP) */
  (function () {
    var els = document.querySelectorAll(".kpi .num");
    if (!els.length) return;
    var locale = "de-DE";
    var step = 1;
    function run(el) {
      var end = parseFloat(el.getAttribute('data-count') || el.textContent);
      if (!isFinite(end)) end = 0;
      var t0 = null;
      function frame(t) {
        if (t0 === null) t0 = t;
        var p = Math.min(1, (t - t0) / 2000);
        var eased = 1 - Math.pow(1 - p, 3);
        var v = Math.round((end * eased) / step) * step;
        el.textContent = v.toLocaleString(locale);
        if (p < 1) requestAnimationFrame(frame);
        else el.textContent = (Math.round(end / step) * step).toLocaleString(locale);
      }
      requestAnimationFrame(frame);
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        run(entry.target);
      });
    }, { rootMargin: "0px 0px -15% 0px", threshold: 0 });
    for (var j = 0; j < els.length; j++) { io.observe(els[j]); }
  })();
})();
