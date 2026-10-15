"use client";

import { useLayoutEffect } from "react";

/**
 * Drives page-level motion without wrapping the server-rendered markup:
 * - [data-reveal] / [data-watch] get `.is-in` the first time they scroll into view
 * - [data-loop] gets `.is-on` only while visible, so infinite animations pause off-screen
 * - the sticky header gets `.is-scrolled`
 * Content stays fully visible when JS is off or prefers-reduced-motion is set.
 */
export function MotionController() {
  useLayoutEffect(() => {
    const root = document.getElementById("top");
    if (!root) return;

    const header = root.querySelector(".site-header");
    const onScroll = () => header?.classList.toggle("is-scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return () => window.removeEventListener("scroll", onScroll);
    }

    root.dataset.motion = "on";

    const once = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        once.unobserve(entry.target);
      }
    }, { threshold: 0.15, rootMargin: "0px 0px -6% 0px" });

    const loops = new IntersectionObserver((entries) => {
      for (const entry of entries) entry.target.classList.toggle("is-on", entry.isIntersecting);
    });

    root.querySelectorAll("[data-reveal], [data-watch]").forEach((el) => once.observe(el));
    root.querySelectorAll("[data-loop]").forEach((el) => loops.observe(el));

    return () => {
      window.removeEventListener("scroll", onScroll);
      once.disconnect();
      loops.disconnect();
      delete root.dataset.motion;
    };
  }, []);

  return null;
}
