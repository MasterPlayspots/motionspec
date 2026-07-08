/* MotionSpec WAAPI lowering (no GSAP) - generated artifact. Do NOT edit by hand. */
/* Spec: scaleOnScroll  Lowering: web-animations-api (no GSAP) */
(function () {
  if (!('IntersectionObserver' in window) || typeof Element === 'undefined' || !Element.prototype.animate) return; /* progressive enhancement: content stays visible */
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;  /* a11y: respectReducedMotion */
  /* zoom-card (scaleOnScroll -> scroll + requestAnimationFrame, no GSAP) */
  /* scale 0.8 -> 1 across the scroll progress */
  (function () {
    var els = document.querySelectorAll(".case .visual");
    if (!els.length) return;
    var ALPHA = 0.1429;
    var states = [];
    for (var i = 0; i < els.length; i++) states.push({ cur: 0 });
    function progressOf(el) {
      var r = el.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight;
      /* 0 when element top hits viewport bottom, 1 when it reaches center */
      var p = (vh - r.top) / (vh - vh / 2 + r.height / 2);
      return Math.max(0, Math.min(1, p));
    }
    var ticking = false;
    function update() {
      ticking = false;
      var moving = false;
      for (var k = 0; k < els.length; k++) {
        var target = progressOf(els[k]);
        var st = states[k];
        st.cur += (target - st.cur) * ALPHA;
        if (Math.abs(target - st.cur) > 0.001) moving = true;
        var p = st.cur;
        var sc = 0.8 + p * (1 - 0.8); els[k].style.transformOrigin = "center center"; els[k].style.transform = 'scale(' + sc + ')';
      }
      if (moving) requestAnimationFrame(update);
    }
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update();
  })();
})();
