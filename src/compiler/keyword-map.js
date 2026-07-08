"use strict";
/*
 * Shared keyword->primitive heuristic (TASK-025, audit #22).
 *
 * Previously there were TWO diverging tables: clients.js (mockClient, 5 entries,
 * with target/params) and discover.js (gap report, 8 entries, without target). As a
 * result counterUp/marquee/scaleOnScroll were missing from the mock — the repair
 * loop ran against an artificially incomplete model. One source of truth closes the gap.
 *
 * The regexes/order come from discover.js (the more complete 8-entry set);
 * target/params of the five known primitives come from clients.js; for the three
 * new ones sensible default selectors are set. IMPORTANT: order is API —
 * discover.mapIntent() returns the FIRST match, so do not reorder entries.
 */
const KEYWORD_MAP = [
  { re: /(flip.?loop|coin.?flip|3d.?spin|muenzwurf)/i, primitive: "flipLoop", target: ".badge", params: {} },
  { re: /(teeter|wippe.*unten|kipp.*stand|wackel.*fuss)/i, primitive: "teeterLoop", target: ".badge", params: {} },
  { re: /(glide|diagonal.*(drift|glide))/i, primitive: "glideLoop", target: ".badge", params: {} },
  { re: /(bounce|huepf|hopp|springen.*endlos)/i, primitive: "bounceLoop", target: ".badge", params: {} },
  { re: /(hover.*(flip|umklapp|3d)|karte.*hover.*dreh)/i, primitive: "hoverFlip", target: ".card", params: { degrees: 180 } },
  { re: /(hover.*(expand|ausdehn)|beim.*hover.*ausdehn)/i, primitive: "hoverExpand", target: ".card", params: {} },
  { re: /(hover.*(spin|360)|beim.*hover.*komplett.*dreh)/i, primitive: "hoverSpin", target: ".card", params: {} },
  { re: /(hover.*(rotate|dreh|neig|kipp)|beim.*hover.*dreh)/i, primitive: "hoverRotate", target: ".card", params: { degrees: 3 } },
  { re: /(hover.*(sink|senk|runter|nach.?unten))/i, primitive: "hoverSink", target: ".card", params: { distance: "4px" } },
  { re: /(hover.*(skew|verzerr|schraeg))/i, primitive: "hoverSkew", target: ".card", params: { skew: 4 } },
  { re: /(wobble|schlinger|torkeln|eiern)/i, primitive: "wobbleLoop", target: ".badge", params: {} },
  { re: /(squash|stauch|quetsch|breiter.*flacher)/i, primitive: "squashLoop", target: ".badge", params: {} },
  { re: /(tilt.?loop|kipp.*puls|neig.*puls|rotier.*scale.*loop)/i, primitive: "tiltLoop", target: ".badge", params: {} },
  { re: /(skew.*scroll|scroll.*skew|neig.*(beim|on).*scroll)/i, primitive: "skewOnScroll", target: ".skew-on-scroll", params: { skewDegrees: 6 } },
  { re: /(swing|pendel|schwing|glocke)/i, primitive: "swingLoop", target: ".badge", params: { angle: 8 } },
  { re: /(jello|wackelpudding|wobble|gummi|weich.*wackel)/i, primitive: "jelloLoop", target: ".badge", params: { skew: 4 } },
  { re: /(stretch|dehn.*breit|breite.*puls|gummi.*breit)/i, primitive: "stretchLoop", target: ".badge", params: { scaleX: 1.12 } },
  { re: /(hover.*(grow|groess|scale|zoom)|beim.*hover.*groess)/i, primitive: "hoverGrow", target: ".card", params: { scale: 1.05 } },
  { re: /(hover.*(lift|heb|anheb)|beim.*hover.*heb)/i, primitive: "hoverLift", target: ".card", params: { distance: "6px" } },
  { re: /(parallax.*(x|horizontal|seit)|horizontal.*parallax|seitlich.*scroll)/i, primitive: "parallaxX", target: ".parallax-x", params: { xPercent: -20 } },
  { re: /(atmen|breathe|pulsierende.?opazit|sanft.*ein.?ausblend|glow.*loop)/i, primitive: "breatheLoop", target: ".badge", params: { minOpacity: 0.6, duration: 3 } },
  { re: /(vertikal.*(laufband|ticker|marquee)|marquee.*vertikal|news.?ticker.*vertikal|testimonial.*lauf)/i, primitive: "marqueeVertical", target: ".v-marquee", params: {} },
  { re: /(flip|umklapp|3d.?dreh.*ein|aufklapp|karten.?flip)/i, primitive: "flipReveal", target: ".card", params: { degrees: 90 } },
  { re: /(press|druck|klick.?feedback|button.*(schrumpf|gedrueckt)|active.*scale)/i, primitive: "pressShrink", target: ".cta", params: {} },
  { re: /(ken.?burns|langsam.*zoom|hero.*zoom|hintergrund.*zoom.*drift)/i, primitive: "kenBurns", target: ".hero-bg", params: { scale: 1.1 } },
  { re: /(stagger|nacheinander|gestaffelt|one after|cards?|karten|liste)/i, primitive: "staggerReveal", target: ".features .card", params: { from: { opacity: 0, y: 32 } } },
  { re: /(z(ä|ae)hl|counter|hochz(ä|ae)hl|count up|nummer|zahl)/i, primitive: "counterUp", target: ".stats .num", params: {} },
  { re: /(parallax|tiefe|depth|layer|ebene)/i, primitive: "parallaxLayer", target: ".hero .bg", params: { yPercent: -25 } },
  { re: /(pin|fixier|sticky|festhalten|haften)/i, primitive: "pinnedSection", target: ".showcase", params: { distance: "+=100%" } },
  { re: /(marquee|laufband|logo.?band|ticker|endlos)/i, primitive: "marquee", target: ".marquee-track", params: {} },
  { re: /(schweb|schwebe|schweben|float|floating|bob|gleitet sanft|auf und ab)/i, primitive: "floatLoop", target: ".float", params: { distance: "8px", duration: 3, axis: "y" } },
  { re: /(rotate.*scroll|scroll.*(dreh|rotier)|dreh.*(beim|on).*scroll)/i, primitive: "rotateOnScroll", target: ".rotate-on-scroll", params: { degrees: 15 } },
  { re: /(fade.*scroll|scroll.*(ausblend|einblend|fade))/i, primitive: "fadeOnScroll", target: ".fade-on-scroll", params: {} },
  { re: /(pop.?in|aufpoppen|reveal.*scale|scale.*reveal)/i, primitive: "revealScale", target: ".card", params: { fromScale: 0.9 } },
  { re: /(puls|pulse|pulsier|heartbeat|atmen)/i, primitive: "pulseLoop", target: ".cta", params: { scale: 1.05, duration: 2 } },
  { re: /(spin|spinner|loader|kreisel)/i, primitive: "spinLoop", target: ".spinner", params: { duration: 6 } },
  { re: /(sway|wippe|wackel|neig|rock|schaukel)/i, primitive: "swayLoop", target: ".badge", params: { angle: 3, duration: 4 } },
  { re: /(skalier|scale|zoom|gr(ö|oe)(ß|ss)er werden)/i, primitive: "scaleOnScroll", target: ".section", params: {} },
  { re: /(hover|maus|cursor|button)/i, primitive: "cssTransition", target: ".cta-button", params: { hoverValue: "translateY(-4px)" } },
  { re: /(reveal|einblend|fade|erscheinen|appear|headline|(ü|ue)berschrift|gleitet|scroll)/i, primitive: "scrollReveal", target: ".hero h1", params: { from: { opacity: 0, y: 48 } } },
];

module.exports = { KEYWORD_MAP };
