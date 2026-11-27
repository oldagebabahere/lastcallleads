"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/* ==========================================================================
   VESPER STAGE — Zero-jank native-scroll GSAP ScrollTrigger choreography.
   - Uses 100% native browser smooth scrolling (no wheel hijacking, 0ms input lag)
   - Fades bottle, pour glass, AND warm glow cleanly BEFORE Act 5 (Pricing)
     so pricing cards and CTAs are never obscured or smudged.
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
  scale: number;
  y: number;
}[] = [
  { trigger: "#act-window", rotation: -12, scale: 0.94, y: 0 },
  { trigger: "#act-machine", rotation: 12, scale: 0.9, y: 0 },
  { trigger: "#act-signals", rotation: 186, scale: 0.84, y: -70 },
];

export default function BottleStage() {
  const imgRef = useRef<HTMLImageElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const glassRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<HTMLDivElement>(null);
  const liquidRef = useRef<HTMLDivElement>(null);
  const [activeAct, setActiveAct] = useState<string>("act-hero");
  const [showRail, setShowRail] = useState<boolean>(true);

  useEffect(() => {
    const img = imgRef.current;
    const glow = glowRef.current;
    if (!img) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;

    document.body.classList.add("loaded");
    document.body.classList.remove("intro-lock");

    const triggers: ScrollTrigger[] = [];

    if (reduce || !isDesktop) {
      gsap.set(img, { opacity: 0 });
      if (glow) gsap.set(glow, { opacity: 0 });
    } else {
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

      gsap.set(img, { rotation: 0, scale: 1, y: 0, opacity: 1 });
      if (glow) gsap.set(glow, { opacity: 1 });

      let prev = { rotation: 0, scale: 1, y: 0 };
      for (const step of CHAIN) {
        const tween = gsap.fromTo(
          img,
          { ...prev },
          {
            rotation: step.rotation,
            scale: step.scale,
            y: step.y,
            ease: "none",
            immediateRender: false,
            scrollTrigger: {
              trigger: step.trigger,
              start: "top bottom",
              end: "top 30%",
              scrub: true,
              invalidateOnRefresh: true,
            },
          }
        );
        if (tween.scrollTrigger) triggers.push(tween.scrollTrigger);
        prev = {
          rotation: step.rotation,
          scale: step.scale,
          y: step.y,
        };
      }

      // Cleanly fade out BOTH the bottle AND its radial glow BEFORE Pricing (#act-allocation)
      // so Pricing cards are 100% crisp, symmetrical, and free of any overlay smudge.
      const exitTargets = glow ? [img, glow] : [img];
      const stageExit = gsap.fromTo(
        exitTargets,
        { opacity: 1 },
        {
          opacity: 0,
          ease: "none",
          immediateRender: false,
          scrollTrigger: {
            trigger: "#act-allocation",
            start: "top 96%",
            end: "top 64%",
            scrub: true,
          },
        }
      );
      if (stageExit.scrollTrigger) triggers.push(stageExit.scrollTrigger);

      // Fade out floating left story rail cleanly once user scrolls past pricing (#act-allocation)
      const allocEl = document.getElementById("act-allocation");
      if (allocEl) {
        triggers.push(
          ScrollTrigger.create({
            trigger: allocEl,
            start: "top bottom",
            end: "bottom 55%",
            onLeave: () => setShowRail(false),
            onEnterBack: () => setShowRail(true),
          })
        );
      }

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
            start: "top 96%",
            end: "top 66%",
            scrub: true,
          },
        });
        if (glassExit.scrollTrigger) triggers.push(glassExit.scrollTrigger);
      }
    }

    return () => {
      triggers.forEach((t) => t.kill());
    };
  }, []);

  const go = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      {/* Left act navigation rail (desktop only; auto-hides before Footer) */}
      <nav
        aria-label="Story acts"
        className={`fixed left-5 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-3.5 transition-opacity duration-500 xl:flex ${
          showRail ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
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
                className={`rail-chip h-px transition-all duration-300 ${
                  isOn ? "w-9 bg-amber" : "w-5 bg-cream/40"
                }`}
              />
              <span
                className={`rail-chip rounded-full px-2.5 py-1 font-mono text-[9px] tracking-[0.24em] transition-colors duration-300 ${
                  isOn ? "text-amber" : "text-cream/75 group-hover:text-cream"
                }`}
              >
                {a.label.toUpperCase()}
              </span>
            </a>
          );
        })}
      </nav>

      {/* Warm glow bed under the pinned bottle (desktop only; fades out before Act 5) */}
      <div
        ref={glowRef}
        aria-hidden="true"
        className="pointer-events-none fixed left-1/2 top-1/2 z-20 hidden h-[48vh] w-[48vh] -translate-x-1/2 -translate-y-1/2 rounded-full lg:block"
        style={{
          background:
            "radial-gradient(closest-side, rgba(224,170,74,0.16), rgba(164,67,90,0.07) 55%, transparent 75%)",
        }}
      />

      {/* Pinned bottle (desktop only; fades out before Act 5) */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-1/2 top-[43%] z-30 hidden -translate-x-1/2 -translate-y-1/2 lg:block"
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
          className="bottle-fixed h-[44vh] max-h-[430px] min-h-[260px] w-auto select-none will-change-transform"
        />
      </div>

      {/* Act 4 wine pour (desktop only) */}
      <div
        ref={glassRef}
        aria-hidden="true"
        className="pour-layer pointer-events-none fixed left-1/2 top-[66%] z-30 hidden -translate-x-1/2 opacity-0 lg:block"
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
