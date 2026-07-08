/* MotionSpec-Compiler vX - generated artifact. Do NOT edit by hand; the spec is the source. */
/* Spec: showcase  Target: vanilla-gsap */
(function () {
  if (typeof gsap === 'undefined') { console.warn('[motion] GSAP not loaded.'); return; }
  gsap.registerPlugin(ScrollTrigger);
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;  /* a11y: respectReducedMotion */
  /* zoom-card (scaleOnScroll) */
  gsap.fromTo(".case .visual", { scale: 0.7, transformOrigin: "center center" }, { scale: 1, transformOrigin: "center center", ease: "none", scrollTrigger: { trigger: ".case .visual", start: "top bottom", end: "center center", scrub: 1 } });
  /* kpi-counter (counterUp) */
  document.querySelectorAll(".kpi .num").forEach(function(el){ var end=parseFloat(el.getAttribute('data-count')||el.textContent); if(!isFinite(end)) end=0; var o={v:0}; gsap.to(o,{v:end,duration:2,ease:"power1.out",snap:{v:1},onUpdate:function(){el.textContent=o.v.toLocaleString("de-DE")},scrollTrigger:{trigger:el,start:"top 85%",once:true}}); });
})();
(function () {
  /* pauseControls: WCAG 2.2.2 pause/stop toggle (auto). Not rendered under prefers-reduced-motion: reduce. */
  (function () {
    if (document.querySelector('.ms-pause-toggle')) return;  /* single toggle */
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var PAUSE_LABEL = "Pause animations", PLAY_LABEL = "Play animations";
    var root = document.documentElement;
    var style = document.createElement('style');
    style.textContent = '.ms-pause-toggle{position:fixed;right:1rem;bottom:1rem;z-index:2147483647;min-width:24px;min-height:24px;padding:.5rem .75rem;font:inherit;line-height:1;cursor:pointer;border:1px solid currentColor;border-radius:6px;background:Canvas;color:CanvasText}.ms-pause-toggle:focus-visible{outline:3px solid Highlight;outline-offset:2px}';
    document.head.appendChild(style);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ms-pause-toggle';
    var stored = null;
    try { stored = window.localStorage.getItem('ms-paused'); } catch (e) {}
    var paused = stored === '1';
    function sync() {
      if (paused) { root.setAttribute('data-ms-paused', ''); } else { root.removeAttribute('data-ms-paused'); }
      btn.setAttribute('aria-pressed', paused ? 'true' : 'false');
      btn.textContent = paused ? PLAY_LABEL : PAUSE_LABEL;
    }
    btn.addEventListener('click', function () {
      paused = !paused;
      try { window.localStorage.setItem('ms-paused', paused ? '1' : '0'); } catch (e) {}
      sync();
    });
    sync();
    document.body.appendChild(btn);
  })();
})();
