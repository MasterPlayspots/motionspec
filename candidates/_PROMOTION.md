# Welle A — Promotion in den Katalog (6 Primitive)

**Stand:** 6 Kandidaten gebaut + automatisch verifiziert, `verified:false`, **noch nicht** im Katalog.
Suite bleibt grün, weil `candidates/` nicht von `loadCatalog()` gelesen wird.

Neue Primitive (Familie / Lowering-Reuse):

| Primitive | output | Familie | WAAPI-Reuse |
|---|---|---|---|
| `pulseLoop` | css | CSS-Keyframe (wie floatLoop) | neuer Mini-Emitter |
| `spinLoop` | css | CSS-Keyframe | neuer Mini-Emitter |
| `swayLoop` | css | CSS-Keyframe | neuer Mini-Emitter |
| `rotateOnScroll` | js | Scroll-Scrub (wie scaleOnScroll) | `emitScrub` |
| `fadeOnScroll` | js | Scroll-Scrub | `emitScrub` |
| `revealScale` | js | Viewport-Reveal (wie scrollReveal) | Reveal-Engine |

**Schon automatisch verifiziert** (Skript-Lauf 2026-07-04): Meta-Schema (catalog.js), deterministischer GSAP-Compile, Reduced-Motion-Guard vorhanden, nur `transform`/`opacity`, Trust-Boundary weist Injection/Range/Unknown/Unsafe-Target ab.

**Einzige verbleibende menschliche Prüfung (dein Gate):** 60-Sek Device-Eyeball auf `out/wave-a-preview/index.html` (MS-02-Checkliste: ruckelfrei langsam+schnell, Mobile, `?rm=1` = sofort sichtbar ohne Bewegung). Danach ist Promotion frei.

---

## Schnellster Weg
Sag mir **„promote Welle A"** — dann mache ich alle Schritte unten in einem Rutsch und lasse die **volle Suite grün** laufen (inkl. `UPDATE_WAAPI_GOLDEN` + `catalog-lock`). Du committest/pushst am Kanon.

Katalog-Hash **nach** Promotion aller 6 = `951874ddfc911d78` (aktuell `33ee61fcc75431f7`).

---

## Manuelle Schritte (falls du selbst promotest)

Pro Primitiv:
1. `git mv candidates/<name>/<name>.json primitives/<name>.json`
2. In der JSON `performance.verified: true` + `verifiedAt: "2026-07-04"` setzen (erst NACH Device-Check).
3. WAAPI-Emitter in `src/compiler/lower-waapi.js` einfügen (Code unten), Name in `SUPPORTED` und einen `case` im `emitMotion`-switch ergänzen.
4. In `test/waapi-lowering.test.js`: Eintrag in `MOTIONS` + `EXT` ergänzen (unten).
5. Keyword-Regel in `src/compiler/keyword-map.js` einfügen — **vor** dem generischen `scrollReveal`-Eintrag (Reihenfolge = API).

Danach einmalig:
6. Zähler anpassen: `test/catalog-wave1.test.js` (`9`→`15`, „all 9 primitives"→„all 15") und `test/mcp.test.mjs` (`primitives.length, 9`→`15`).
7. Pin in `test/waapi-lowering.test.js` `specFor()` von `33ee61fcc75431f7` → `951874ddfc911d78`.
8. Golden erzeugen: `UPDATE_WAAPI_GOLDEN=1 node --test test/waapi-lowering.test.js`
9. Relock: `npm run catalog-lock`
10. Voll grün: `npm test`

---

## WAAPI-Emitter (fertig zum Einfügen in `lower-waapi.js`)

```js
/* --- Welle A: CSS-Keyframe-Familie (wie emitFloatLoop) --- */
function emitPulseLoop(m, prim) {
  const p = withDefaults(prim.paramSchema || {}, m.params);
  const target = cssRaw(m.target, "pulseLoop.target");
  const scale = cssRaw(num(p.scale), "pulseLoop.scale");
  const duration = cssRaw(num(p.duration), "pulseLoop.duration");
  const id = cssRaw(m.id, "pulseLoop.id");
  const rule =
    target + " { animation: motion-pulseLoop-" + id + " " + duration + "s ease-in-out infinite alternate; }\n" +
    "@keyframes motion-pulseLoop-" + id + " { from { transform: scale(1) } to { transform: scale(" + scale + ") } }";
  return { id: m.id, primitive: "pulseLoop", css: rule };
}

function emitSpinLoop(m, prim) {
  const p = withDefaults(prim.paramSchema || {}, m.params);
  const target = cssRaw(m.target, "spinLoop.target");
  const duration = cssRaw(num(p.duration), "spinLoop.duration");
  const direction = cssRaw(p.direction, "spinLoop.direction");
  const id = cssRaw(m.id, "spinLoop.id");
  const rule =
    target + " { animation: motion-spinLoop-" + id + " " + duration + "s linear infinite " + direction + "; }\n" +
    "@keyframes motion-spinLoop-" + id + " { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }";
  return { id: m.id, primitive: "spinLoop", css: rule };
}

function emitSwayLoop(m, prim) {
  const p = withDefaults(prim.paramSchema || {}, m.params);
  const target = cssRaw(m.target, "swayLoop.target");
  const angle = cssRaw(num(p.angle), "swayLoop.angle");
  const duration = cssRaw(num(p.duration), "swayLoop.duration");
  const id = cssRaw(m.id, "swayLoop.id");
  const rule =
    target + " { animation: motion-swayLoop-" + id + " " + duration + "s ease-in-out infinite alternate; }\n" +
    "@keyframes motion-swayLoop-" + id + " { from { transform: rotate(-" + angle + "deg) } to { transform: rotate(" + angle + "deg) } }";
  return { id: m.id, primitive: "swayLoop", css: rule };
}

/* --- Welle A: Scroll-Scrub-Familie (reuse emitScrub) --- */
function emitRotateOnScroll(m, prim) {
  const params = withDefaults(prim.paramSchema || {}, m.params);
  const degrees = typeof params.degrees === "number" ? params.degrees : 15;
  const progressExpr = "1 - (r.top + r.height) / (vh + r.height)";
  const applyStmt = "els[k].style.transform = 'rotate(' + (p * " + num(degrees) + ") + 'deg)';";
  return emitScrub(m, "rotateOnScroll",
    "rotate 0deg -> " + num(degrees) + "deg across the scroll transit",
    params.scrub, progressExpr, applyStmt);
}

function emitFadeOnScroll(m, prim) {
  const params = withDefaults(prim.paramSchema || {}, m.params);
  const fromO = typeof params.fromOpacity === "number" ? params.fromOpacity : 1;
  const toO = typeof params.toOpacity === "number" ? params.toOpacity : 0;
  const progressExpr = "1 - (r.top + r.height) / (vh + r.height)";
  const applyStmt = "els[k].style.opacity = (" + num(fromO) + " + p * (" + num(toO) + " - " + num(fromO) + "));";
  return emitScrub(m, "fadeOnScroll",
    "opacity " + num(fromO) + " -> " + num(toO) + " across the scroll transit",
    params.scrub, progressExpr, applyStmt);
}

/* --- Welle A: Reveal (fade + scale pop-in; eigenständig, mirror emitReveal) --- */
function emitRevealScale(m, prim) {
  const params = withDefaults(prim.paramSchema || {}, m.params);
  const fromScale = typeof params.fromScale === "number" ? params.fromScale : 0.9;
  const durMs = Math.round((typeof params.duration === "number" ? params.duration : 0.7) * 1000);
  const ease = easing(params.ease);
  const trigger = Object.assign({}, prim.triggerDefaults || {}, m.trigger || {});
  const once = trigger.once !== false;
  const margin = rootMargin(trigger.start);
  const fromT = fromTransform({ scale: fromScale }); // "scale(<fromScale>)"
  const lines = [
    "  /* " + m.id + " (revealScale -> Web Animations API) */",
    "  (function () {",
    "    var els = document.querySelectorAll(" + jsStr(m.target) + ");",
    "    if (!els.length) return;",
    "    for (var i = 0; i < els.length; i++) {",
    "      els[i].style.opacity = '0';",
    "      els[i].style.transform = " + jsStr(fromT) + ";",
    "    }",
    "    var io = new IntersectionObserver(function (entries) {",
    "      entries.forEach(function (entry) {",
    "        if (!entry.isIntersecting) return;",
    "        var el = entry.target;",
    (once ? "        io.unobserve(el);" : "        // re-observe: once=false"),
    "        var anim = el.animate(",
    "          [",
    "            { opacity: 0, transform: " + jsStr(fromT) + " },",
    "            { opacity: 1, transform: 'none' }",
    "          ],",
    "          { duration: " + durMs + ", easing: " + jsStr(ease) + ", fill: 'both' }",
    "        );",
    "        anim.onfinish = function () { el.style.opacity = ''; el.style.transform = ''; };",
    "      });",
    "    }, { rootMargin: " + jsStr(margin) + ", threshold: 0 });",
    "    for (var j = 0; j < els.length; j++) { io.observe(els[j]); }",
    "  })();",
  ];
  return emitJsWrap(m, lines); // or: return lines.join("\n"); if no wrapper helper — mirror emitReveal's return
}
```
> Hinweis: `emitRevealScale` gibt — wie `emitReveal` — den JS-Block als String via `lines.join("\n")` zurück (kein `emitJsWrap`; das war Pseudocode). Beim Promoten setze ich das 1:1 wie die bestehenden JS-Emitter.

`SUPPORTED` ergänzen: `"pulseLoop","spinLoop","swayLoop","rotateOnScroll","fadeOnScroll","revealScale"`.

`emitMotion`-switch-cases:
```js
case "pulseLoop":      return { kind: "css", emit: emitPulseLoop(m, prim) };
case "spinLoop":       return { kind: "css", emit: emitSpinLoop(m, prim) };
case "swayLoop":       return { kind: "css", emit: emitSwayLoop(m, prim) };
case "rotateOnScroll": return { kind: "js",  code: emitRotateOnScroll(m, prim) };
case "fadeOnScroll":   return { kind: "js",  code: emitFadeOnScroll(m, prim) };
case "revealScale":    return { kind: "js",  code: emitRevealScale(m, prim) };
```

## `test/waapi-lowering.test.js` — MOTIONS + EXT
```js
pulseLoop:      { id: "cta-pulse",   primitive: "pulseLoop",      target: ".cta",    params: { scale: 1.08, duration: 2 } },
spinLoop:       { id: "loader-spin", primitive: "spinLoop",       target: ".loader", params: { duration: 6, direction: "normal" } },
swayLoop:       { id: "badge-sway",  primitive: "swayLoop",       target: ".badge",  params: { angle: 4, duration: 4 } },
rotateOnScroll: { id: "card-rotate", primitive: "rotateOnScroll", target: ".card",   params: { degrees: 20, scrub: 1 }, trigger: { start: "top bottom", end: "bottom top" } },
fadeOnScroll:   { id: "hero-fade",   primitive: "fadeOnScroll",   target: ".hero",   params: { fromOpacity: 1, toOpacity: 0.15, scrub: 1 }, trigger: { start: "top top", end: "bottom top" } },
revealScale:    { id: "card-pop",    primitive: "revealScale",    target: ".card",   params: { fromScale: 0.85, duration: 0.7, ease: "power3.out" }, trigger: { start: "top 80%", once: true } },
// EXT: pulseLoop:"css", spinLoop:"css", swayLoop:"css", rotateOnScroll:"js", fadeOnScroll:"js", revealScale:"js"
```

## `src/compiler/keyword-map.js` — vor dem generischen scrollReveal-Eintrag einfügen
```js
{ re: /(rotate.*scroll|scroll.*(dreh|rotier)|dreh.*(beim|on).*scroll)/i, primitive: "rotateOnScroll", target: ".rotate-on-scroll", params: { degrees: 15 } },
{ re: /(fade.*scroll|scroll.*(ausblend|einblend|fade))/i, primitive: "fadeOnScroll", target: ".fade-on-scroll", params: {} },
{ re: /(pop.?in|aufpoppen|reveal.*scale|scale.*reveal)/i, primitive: "revealScale", target: ".card", params: { fromScale: 0.9 } },
{ re: /(puls|pulse|pulsier|heartbeat|atmen)/i, primitive: "pulseLoop", target: ".cta", params: { scale: 1.05, duration: 2 } },
{ re: /(spinner|loader|endlos.?dreh|kreisel)/i, primitive: "spinLoop", target: ".spinner", params: { duration: 6 } },
{ re: /(sway|wippe|wackel|neig|rock|schaukel)/i, primitive: "swayLoop", target: ".badge", params: { angle: 3, duration: 4 } },
```
