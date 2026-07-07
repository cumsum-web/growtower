/* global gsap, ScrollTrigger */
/* ============================================================
   GROW TOWER — manifesto scroll reveal
   ScrollTrigger scrubs each line from 15% to 100% opacity in
   sequence. Skipped under prefers-reduced-motion (lines render
   fully visible via CSS defaults).
   ============================================================ */

(function () {
  var section = document.querySelector(".manifesto");
  if (!section) return;

  var motionOK = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!motionOK || typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") return;

  gsap.registerPlugin(ScrollTrigger);
  section.classList.add("manifesto--scrub");

  var tl = gsap.timeline({
    scrollTrigger: {
      trigger: section,
      start: "top 70%",
      end: "bottom 75%",
      scrub: 0.5,
    },
  });

  gsap.utils.toArray(".manifesto__line").forEach(function (line) {
    tl.to(line, { opacity: 1, duration: 1, ease: "none" });
  });

  // The hero grows to 250vh when its 3D mode kicks in (async, after
  // model load), which shifts everything below it. Re-measure trigger
  // positions when that class lands.
  var hero = document.querySelector(".hero");
  if (hero && "MutationObserver" in window) {
    new MutationObserver(function () {
      ScrollTrigger.refresh();
    }).observe(hero, { attributes: true, attributeFilter: ["class"] });
  }
})();
