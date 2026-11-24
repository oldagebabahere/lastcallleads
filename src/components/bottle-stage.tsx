"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

/* ==========================================================================
   VESPER STAGE — Smooth, instant-paint GSAP ScrollTrigger choreography
   (Zero blocking preloader, zero direct React DOM deletion/mutation,
   proper event cleanup, live Act Rail indicator).
   ========================================================================== */

gsap.registerPlugin(ScrollTrigger);

const ACTS = [
  { id: "act-hero", label: "Open" },
  { id: "act-window", label: "Window" },
  { id: "act-machine", label: "Machine" },
  { id: "act-signals", label: "Signals" },
  { id: "act-allocation", label: "Allocation" },
] as const;

const CHAIN: {
  trigger: string;
  rotation: number;
  scale: number | null;
  y: number | null;
}[] = [
  { trigger: "#act-window", rotation: -12, scale: 0.94, y: 0 },
  { trigger: "#act-machine", rotation: 12, scale: 0.9, y: 0 },
  { trigger: "#act-signals", rotation: 186, scale: 0.84, y: -70 },
  { trigger: "#act-allocation", rotation: 360, scale: null, y: null },
];

export default function BottleStage() {
  const imgRef = useRef<HTMLImageElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const glassRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<HTMLDivElement>(null);
  const liquidRef = useRef<HTMLDivElement>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const [activeAct, setActiveAct] = useState<string>("act-hero");

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;

    document.body.classList.add("loaded");
    document.body.classList.remove("intro-lock");

    // Lenis smooth scroll on desktop only (mobile native touch scroll stays snappy).
    let lenis: Lenis | null = null;
    let raf: ((time: number) => void) | null = null;
    let tiltTick: (() => void) | null = null;

    if (!reduce && isDesktop) {
      lenis = new Lenis({ duration: 1.05, smoothWheel: true });
      lenisRef.current = lenis;

      let vt = 0;
      let vtTarget = 0;
      lenis.on("scroll", (e: { velocity?: number }) => {
        ScrollTrigger.update();
        vtTarget = gsap.utils.clamp(-5, 5, (e.velocity ?? 0) * 0.065);
      });
      tiltTick = () => {
        vt += (vtTarget - vt) * 0.08;
        vtTarget *= 0.9;
        if (tiltRef.current) {
          tiltRef.current.style.transform = `rotate(${vt.toFixed(3)}deg)`;
        }
      };
      raf = (time: number) => lenis!.raf(time * 1000);
      gsap.ticker.add(tiltTick);
      gsap.ticker.add(raf);
      gsap.ticker.lagSmoothing(0);
      document.documentElement.style.scrollBehavior = "auto";
    }

    const triggers: ScrollTrigger[] = [];
    const cleanups: (() => void)[] = [];

    if (reduce || !isDesktop) {
      gsap.set(img, { opacity: 0 });
    } else {
      document.body.dataset.vesper = "on";

      // Active act rail tracking
      for (const act of ACTS) {
        const el = document.getElementById(act.id);
        if (!el) continue;
        triggers.push(
          ScrollTrigger.create({
            trigger: el,
            start: "top center",
            end: "bottom center",
            onEnter: () => setActiveAct(act.id),
            onEnterBack: () => setActiveAct(act.id),
          })
        );
      }

      const dockScale = () => {
        const s = document.getElementById("dock-slot");
        if (!s || !img.offsetWidth || !img.offsetHeight) return 0.5;
        return Math.min(
          (s.clientWidth * 0.78) / img.offsetWidth,
          (s.clientHeight * 0.84) / img.offsetHeight,
          1
        );
      };
      const dockY = () => {
        const s = document.getElementById("dock-slot");
        const sec = document.getElementById("act-allocation");
        if (!s || !sec) return 240;
        const sr = s.getBoundingClientRect();
        const cr = sec.getBoundingClientRect();
        return (
          sr.top +
          window.scrollY +
          sr.height / 2 -
          (cr.top + window.scrollY + cr.height / 2)
        );
      };

      gsap.set(img, { rotation: 0, scale: 1, y: 0, opacity: 1 });
      let prev = { rotation: 0, scale: 1, y: 0 };
      for (const step of CHAIN) {
        const isDock = step.trigger === "#act-allocation";
        const tween = gsap.fromTo(
          img,
          { ...prev },
          {
            rotation: step.rotation,
            scale: step.scale ?? dockScale,
            y: step.y ?? dockY,
            ease: "none",
            immediateRender: false,
            scrollTrigger: {
              trigger: step.trigger,
              start: "top bottom",
              end: isDock ? "center center" : "top 30%",
              scrub: true,
              invalidateOnRefresh: true,
            },
          }
        );
        if (tween.scrollTrigger) triggers.push(tween.scrollTrigger);
        prev = {
          rotation: step.rotation,
          scale: step.scale ?? dockScale(),
          y: step.y ?? dockY(),
        };
      }

      const slot = document.getElementById("slot-bottle");
      const fadeOut = gsap.fromTo(
        img,
        { opacity: 1 },
        {
          opacity: 0,
          ease: "none",
          immediateRender: false,
          scrollTrigger: {
            trigger: "#act-allocation",
            start: "42% center",
            end: "58% center",
            scrub: true,
          },
        }
      );
      if (fadeOut.scrollTrigger) triggers.push(fadeOut.scrollTrigger);

      if (slot) {
        const fadeIn = gsap.fromTo(
          slot,
          { opacity: 0, scale: 0.9 },
          {
            opacity: 1,
            scale: 1,
            ease: "none",
            immediateRender: false,
            scrollTrigger: {
              trigger: "#act-allocation",
              start: "42% center",
              end: "58% center",
              scrub: true,
            },
          }
        );
        if (fadeIn.scrollTrigger) triggers.push(fadeIn.scrollTrigger);
      }

      // React-safe headline reveals (no DOM node splitting/mutation!)
      document.querySelectorAll<HTMLElement>("[data-split]").forEach((el) => {
        const t = gsap.fromTo(
          el,
          { y: 24, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.85,
            ease: "power3.out",
            scrollTrigger: { trigger: el, start: "top 88%", once: true },
          }
        );
        if (t.scrollTrigger) triggers.push(t.scrollTrigger);
      });

      // Act 4 wine pour
      const glass = glassRef.current;
      const stream = streamRef.current;
      const liquid = liquidRef.current;
      if (glass && stream && liquid) {
        const pour = gsap.timeline({
          scrollTrigger: {
            trigger: "#act-signals",
            start: "top 75%",
            end: "center 42%",
            scrub: true,
          },
        });
        pour
          .fromTo(
            glass,
            { opacity: 0, y: 46, scale: 0.9 },
            { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: "none" },
            0
          )
          .fromTo(stream, { scaleY: 0 }, { scaleY: 1, duration: 0.2, ease: "none" }, 0.22)
          .fromTo(liquid, { height: "0%" }, { height: "58%", duration: 0.62, ease: "none" }, 0.3)
          .to(stream, { opacity: 0, duration: 0.16, ease: "none" }, 0.84);
        if (pour.scrollTrigger) triggers.push(pour.scrollTrigger);

        const glassExit = gsap.to(glass, {
          opacity: 0,
          y: 40,
          ease: "none",
          immediateRender: false,
          scrollTrigger: {
            trigger: "#act-allocation",
            start: "top bottom",
            end: "top 55%",
            scrub: true,
          },
        });
        if (glassExit.scrollTrigger) triggers.push(glassExit.scrollTrigger);
      }

      // Subtle parallax
      document.querySelectorAll<HTMLElement>(".parallax").forEach((el) => {
        const depth = el.classList.contains("parallax-soft") ? 4 : 7;
        const t = gsap.fromTo(
          el,
          { yPercent: depth },
          {
            yPercent: -depth,
            ease: "none",
            scrollTrigger: {
              trigger: el,
              start: "top bottom",
              end: "bottom top",
              scrub: true,
            },
          }
        );
        if (t.scrollTrigger) triggers.push(t.scrollTrigger);
      });

      // Magnetic CTAs with proper listener teardown
      if (window.matchMedia("(pointer:fine)").matches) {
        document.querySelectorAll<HTMLElement>(".magnetic").forEach((btn) => {
          const xTo = gsap.quickTo(btn, "x", { duration: 0.45, ease: "power3" });
          const yTo = gsap.quickTo(btn, "y", { duration: 0.45, ease: "power3" });
          const move = (e: PointerEvent) => {
            const r = btn.getBoundingClientRect();
            xTo((e.clientX - r.left - r.width / 2) * 0.2);
            yTo((e.clientY - r.top - r.height / 2) * 0.2);
          };
          const leave = () => {
            xTo(0);
            yTo(0);
          };
          btn.addEventListener("pointermove", move);
          btn.addEventListener("pointerleave", leave);
          cleanups.push(() => {
            btn.removeEventListener("pointermove", move);
            btn.removeEventListener("pointerleave", leave);
          });
        });
      }
    }

    return () => {
      triggers.forEach((t) => t.kill());
      cleanups.forEach((fn) => fn());
      if (raf) gsap.ticker.remove(raf);
      if (tiltTick) gsap.ticker.remove(tiltTick);
      lenis?.destroy();
      lenisRef.current = null;
      document.documentElement.style.scrollBehavior = "";
      delete document.body.dataset.vesper;
    };
  }, []);

  const go = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    if (lenisRef.current) {
      lenisRef.current.scrollTo(`#${id}`, { offset: 0 });
    } else {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <>
      {/* Left act navigation rail (desktop only) */}
      <nav
        aria-label="Story acts"
        className="fixed left-5 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-3.5 xl:flex"
      >
        {ACTS.map((a) => {
          const isOn = activeAct === a.id;
          return (
            <a
              key={a.id}
              href={`#${a.id}`}
              onClick={(e) => go(e, a.id)}
              className={`group flex items-center gap-3 ${isOn ? "on" : ""}`}
            >
              <span
                className={`rail-chip h-px transition-all duration-500 ${
                  isOn ? "w-9 bg-amber" : "w-5 bg-cream/40"
                }`}
              />
              <span
                className={`rail-chip rounded-full px-2.5 py-1 font-mono text-[9px] tracking-[0.24em] transition-colors duration-500 ${
                  isOn ? "text-amber" : "text-cream/70 group-hover:text-cream"
                }`}
              >
                {a.label.toUpperCase()}
              </span>
            </a>
          );
        })}
      </nav>

      {/* Warm glow bed under the pinned bottle (desktop only) */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-1/2 top-1/2 z-30 hidden h-[52vh] w-[52vh] -translate-x-1/2 -translate-y-1/2 rounded-full lg:block"
        style={{
          background:
            "radial-gradient(closest-side, rgba(224,170,74,0.18), rgba(164,67,90,0.09) 55%, transparent 75%)",
        }}
      />

      {/* Pinned bottle (desktop only so mobile text is never obscured) */}
      <div
        ref={tiltRef}
        aria-hidden="true"
        className="pointer-events-none fixed left-1/2 top-1/2 z-40 hidden -translate-x-1/2 -translate-y-1/2 will-change-transform lg:block"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src="/bottle.webp"
          alt=""
          width={328}
          height={1200}
          draggable={false}
          onLoad={() => ScrollTrigger.refresh()}
          className="bottle-fixed h-[54vh] max-h-[540px] min-h-[300px] w-auto select-none will-change-transform"
        />
      </div>

      {/* Act 4 wine pour (desktop only) */}
      <div
        ref={glassRef}
        aria-hidden="true"
        className="pour-layer pointer-events-none fixed left-1/2 top-[66%] z-40 hidden -translate-x-1/2 opacity-0 lg:block"
      >
        <div
          ref={streamRef}
          className="wine-stream absolute -top-[7vh] left-1/2 h-[7vh] w-[7px] -translate-x-1/2 origin-top"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/glass-neon.webp"
          alt=""
          width={536}
          height={1546}
          draggable={false}
          className="glass-neon h-[27vh] max-h-[300px] min-h-[170px] w-auto select-none"
        />
        <div className="absolute left-1/2 top-[11%] h-[40%] w-[37%] -translate-x-1/2 overflow-hidden rounded-b-[46%]">
          <div ref={liquidRef} className="wine-liquid absolute bottom-0 left-0 h-[0%] w-full" />
        </div>
      </div>
    </>
  );
}
