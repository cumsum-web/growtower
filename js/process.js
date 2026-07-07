/* global gsap, ScrollTrigger, EmblaCarousel */
/* ============================================================
   GROW TOWER — design process section
   Concept carousel (Embla: free-drag desktop, snap mobile;
   native scroll under reduced motion / no JS) and staggered
   scroll-reveal for the validation cards.
   ============================================================ */

(function () {
  var section = document.querySelector(".process");
  if (!section) return;

  var motionOK = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var isMobile = window.matchMedia("(max-width: 768px)").matches;

  /* ---- carousel ---- */
  var carousel = section.querySelector(".carousel");
  var viewport = section.querySelector(".carousel__viewport");
  if (carousel && viewport && motionOK && typeof EmblaCarousel !== "undefined") {
    carousel.classList.add("carousel--embla");
    var embla = EmblaCarousel(viewport, {
      align: "start",
      containScroll: "trimSnaps",
      dragFree: !isMobile, // momentum drag on desktop, snap on mobile
    });

    // Swipe-driven treatment: the slide nearest the drag focus sits at
    // full scale/opacity, neighbors dim and shrink — scrubbed directly
    // by the carousel position, so it tracks the swipe 1:1.
    var slides = Array.prototype.slice.call(
      viewport.querySelectorAll(".concept-slide")
    );
    var tweenSlides = function () {
      var p = Math.max(0, Math.min(1, embla.scrollProgress()));
      var focus = p * (slides.length - 1);
      slides.forEach(function (slide, i) {
        var t = Math.min(Math.abs(i - focus), 1);
        slide.style.opacity = String(1 - 0.45 * t);
        slide.style.transform = "scale(" + (1 - 0.06 * t) + ")";
      });
    };
    embla.on("scroll", tweenSlides);
    embla.on("reInit", tweenSlides);
    tweenSlides();
  }
  // otherwise: default CSS gives a native scroll-snap list (static, still usable)

  /* ---- validation cards reveal ---- */
  if (motionOK && typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined") {
    gsap.registerPlugin(ScrollTrigger);
    var cards = section.querySelectorAll(".validation-card");
    if (cards.length) {
      gsap.set(cards, { opacity: 0, y: 24 });
      gsap.to(cards, {
        opacity: 1,
        y: 0,
        duration: 0.6,
        stagger: 0.15,
        ease: "power2.out",
        scrollTrigger: {
          trigger: section.querySelector(".process__validation"),
          start: "top 80%",
          once: true,
        },
      });
    }
  }
})();
