"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

/* ==========================================================================
   VESPER STAGE — GSAP ScrollTrigger edition, 10/10 build
   ONE bottle pinned dead-centre; the acts travel past behind it.

   Engines in this file:
     1. Preloader      — brand mark + 0→100 counter, curtain lift
     2. Pose chain     — scrubbed rotation/scale/y across 5 acts (dock on $129)
     3. Velocity tilt  — the bottle leans into your scroll, like a real object
     4. Word reveals   — headlines rise word-by-word as they enter
     5. Parallax       — act panels drift at a different speed
     6. Magnetic CTAs  — buttons reach toward the cursor (desktop)
   ========================================================================== */

gsap.registerPlugin(ScrollTrigger);

const ACTS = [
  { id: "act-hero", label: "Open" },
  { id: "act-window", label: "Window" },
  { id: "act-machine", label: "Machine" },
  { id: "act-signals", label: "Signals" },
  { id: "act-allocation", label: "Allocation" },
];

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
  const preRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const glassRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<HTMLDivElement>(null);
  const liquidRef = useRef<HTMLDivElement>(null);
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ---------- 1. PRELOADER ---------- */
    const pre = preRef.current;
    if (reduce || !pre) {
      pre?.remove();
      document.body.classList.add("loaded");
    } else {
      document.body.classList.remove("loaded");
      const tl = gsap.timeline({ delay: 0.15 });
      tl.to(counterRef.current, {
        textContent: 100,
        duration: 0.85,
        snap: { textContent: 1 },
        ease: "power2.inOut",
      })
        .add(() => document.body.classList.add("loaded"))
        .to(pre, { yPercent: -100, duration: 0.85, ease: "expo.inOut" }, "+=0.12")
        .add(() => {
          pre.remove();
          ScrollTrigger.refresh();
        });
    }

    /* ---------- Lenis: butter scroll on GSAP's ticker ---------- */
    const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    lenisRef.current = lenis;

    /* ---------- 3. VELOCITY TILT (composed on the wrapper) ---------- */
    let vt = 0;
    let vtTarget = 0;
    lenis.on("scroll", (e: { velocity?: number }) => {
      ScrollTrigger.update();
      vtTarget = gsap.utils.clamp(-6, 6, (e.velocity ?? 0) * 0.075);
    });
    const tiltTick = () => {
      vt += (vtTarget - vt) * 0.08;
      vtTarget *= 0.9;
      if (tiltRef.current) {
        tiltRef.current.style.transform = `rotate(${vt.toFixed(3)}deg)`;
      }
    };
    gsap.ticker.add(tiltTick);

    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);
    document.documentElement.style.scrollBehavior = "auto";

    if (reduce) {
      gsap.set(img, { opacity: 0 });
      return () => {
        gsap.ticker.remove(raf);
        gsap.ticker.remove(tiltTick);
        lenis.destroy();
        document.documentElement.style.scrollBehavior = "";
      };
    }

    document.body.dataset.vesper = "on";

    /* ---------- dock targets ---------- */
    const dockScale = () => {
      const s = document.getElementById("dock-slot");
      if (!s) return 0.5;
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
        sr.top + window.scrollY + sr.height / 2 - (cr.top + window.scrollY + cr.height / 2)
      );
    };

    /* ---------- 2. POSE CHAIN ---------- */
    gsap.set(img, { rotation: 0, scale: 1, y: 0 });
    let prev = { rotation: 0, scale: 1, y: 0 };
    for (const step of CHAIN) {
      const isDock = step.trigger === "#act-allocation";
      gsap.fromTo(
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
      prev = { rotation: step.rotation, scale: step.scale ?? dockScale(), y: step.y ?? dockY() };
    }

    /* dock cross-fade */
    const slot = document.getElementById("slot-bottle");
    gsap.fromTo(
      img,
      { opacity: 1 },
      {
        opacity: 0,
        ease: "none",
        immediateRender: false,
        scrollTrigger: { trigger: "#act-allocation", start: "42% center", end: "58% center", scrub: true },
      }
    );
    if (slot) {
      gsap.fromTo(
        slot,
        { opacity: 0, scale: 0.9 },
        {
          opacity: 1,
          scale: 1,
          ease: "none",
          immediateRender: false,
          scrollTrigger: { trigger: "#act-allocation", start: "42% center", end: "58% center", scrub: true },
        }
      );
    }

    /* ---------- 4. WORD REVEALS ---------- */
    const splitDone: HTMLElement[] = [];
    document.querySelectorAll<HTMLElement>("[data-split]").forEach((el) => {
      const walk = (node: HTMLElement) => {
        [...node.childNodes].forEach((child) => {
          if (child.nodeType === 3) {
            const frag = document.createDocumentFragment();
            (child.textContent ?? "").split(/(\s+)/).forEach((part) => {
              if (!part) return;
              if (/^\s+$/.test(part)) {
                frag.append(document.createTextNode(" "));
                return;
              }
              const w = document.createElement("span");
              w.className = "sw";
              const wi = document.createElement("span");
              wi.className = "swi";
              wi.textContent = part;
              w.append(wi);
              frag.append(w);
            });
            child.replaceWith(frag);
          } else if (child.nodeType === 1 && !(child as HTMLElement).classList.contains("sw")) {
            walk(child as HTMLElement);
          }
        });
      };
      walk(el);
      splitDone.push(el);
      gsap.fromTo(
        el.querySelectorAll(".swi"),
        { yPercent: 115 },
        {
          yPercent: 0,
          duration: 1.05,
          ease: "power4.out",
          stagger: 0.032,
          scrollTrigger: { trigger: el, start: "top 86%" },
        }
      );
    });

    /* ---------- 4b. THE POUR — Act 4: the inverted bottle fills a glass ---------- */
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
        .fromTo(glass, { opacity: 0, y: 46, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: "none" }, 0)
        .fromTo(stream, { scaleY: 0 }, { scaleY: 1, duration: 0.2, ease: "none" }, 0.22)
        .fromTo(liquid, { height: "0%" }, { height: "58%", duration: 0.62, ease: "none" }, 0.3)
        .to(stream, { opacity: 0, duration: 0.16, ease: "none" }, 0.84);

      // leaving Act 4 → the filled glass drifts away
      gsap.to(glass, {
        opacity: 0,
        y: 40,
        ease: "none",
        immediateRender: false,
        scrollTrigger: { trigger: "#act-allocation", start: "top bottom", end: "top 55%", scrub: true },
      });
    }

    /* ---------- 5. PARALLAX ---------- */
    document.querySelectorAll<HTMLElement>(".parallax").forEach((el) => {
      const depth = el.classList.contains("parallax-soft") ? 4 : 8;
      gsap.fromTo(
        el,
        { yPercent: depth },
        {
          yPercent: -depth,
          ease: "none",
          scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true },
        }
      );
    });

    /* ---------- 6. MAGNETIC CTAs ---------- */
    if (window.matchMedia("(pointer:fine)").matches) {
      document.querySelectorAll<HTMLElement>(".magnetic").forEach((btn) => {
        const xTo = gsap.quickTo(btn, "x", { duration: 0.5, ease: "power3" });
        const yTo = gsap.quickTo(btn, "y", { duration: 0.5, ease: "power3" });
        const move = (e: PointerEvent) => {
          const r = btn.getBoundingClientRect();
          xTo((e.clientX - r.left - r.width / 2) * 0.24);
          yTo((e.clientY - r.top - r.height / 2) * 0.24);
        };
        const leave = () => {
          xTo(0);
          yTo(0);
        };
        btn.addEventListener("pointermove", move);
        btn.addEventListener("pointerleave", leave);
      });
    }

    return () => {
      ScrollTrigger.getAll().forEach((t) => t.kill());
      gsap.ticker.remove(raf);
      gsap.ticker.remove(tiltTick);
      lenis.destroy();
      document.documentElement.style.scrollBehavior = "";
      delete document.body.dataset.vesper;
    };
  }, []);

  const go = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    lenisRef.current?.scrollTo(`#${id}`, { offset: 0 });
  };

  return (
    <>
      {/* ---------- preloader ---------- */}
      <div ref={preRef} className="preloader" aria-hidden="true">
        <div className="text-center">
          <p className="font-mono text-[10px] tracking-[0.34em] text-cream/60">LAST CALL LEADS</p>
          <p className="mt-4 font-display text-7xl font-light text-cream">
            <span ref={counterRef}>0</span>
            <span className="text-cream/40">%</span>
          </p>
          <p className="mt-4 font-mono text-[9px] tracking-[0.3em] text-cream/40">
            POURING THE MORNING REPORT
          </p>
          <span className="mx-auto mt-6 block h-px w-24 bg-cream/20" />
        </div>
      </div>

      {/* act rail */}
      <nav
        aria-label="Story acts"
        className="fixed left-5 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-3.5 xl:flex"
      >
        {ACTS.map((a) => (
          <a key={a.id} href={`#${a.id}`} onClick={(e) => go(e, a.id)} className="group flex items-center gap-3">
            <span className="rail-chip h-px w-5 bg-cream/40 transition-all duration-500 [.on&]:w-9 [.on&]:bg-amber" />
            <span className="rail-chip rounded-full px-2.5 py-1 font-mono text-[9px] tracking-[0.24em] text-cream/70 transition-colors duration-500 group-hover:text-cream [.on&]:text-amber">
              {a.label.toUpperCase()}
            </span>
          </a>
        ))}
      </nav>

      {/* warm glow bed under the bottle */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-1/2 top-1/2 z-30 h-[52vh] w-[52vh] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(224,170,74,0.2), rgba(164,67,90,0.1) 55%, transparent 75%)",
        }}
      />

      {/* THE model — wrapper carries scroll-velocity tilt, img carries the pose */}
      <div
        ref={tiltRef}
        aria-hidden="true"
        className="pointer-events-none fixed left-1/2 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2 will-change-transform"
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
          className="bottle-fixed h-[56vh] max-h-[580px] min-h-[300px] w-auto select-none will-change-transform"
        />
      </div>

      {/* THE POUR — wine stream + filling glass (scrubbed in Act 4) */}
      <div
        ref={glassRef}
        aria-hidden="true"
        className="pour-layer pointer-events-none fixed left-1/2 top-[66%] z-40 -translate-x-1/2 opacity-0"
      >
        {/* stream from the inverted bottle mouth into the bowl */}
        <div
          ref={streamRef}
          className="wine-stream absolute -top-[7vh] left-1/2 h-[7vh] w-[7px] -translate-x-1/2 origin-top"
        />
        {/* the glass — neon edition */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/glass-neon.webp" alt="" width={536} height={1546} draggable={false} className="glass-neon h-[27vh] max-h-[300px] min-h-[170px] w-auto select-none" />
        {/* liquid rising inside the bowl */}
        <div className="absolute left-1/2 top-[11%] h-[40%] w-[37%] -translate-x-1/2 overflow-hidden rounded-b-[46%]">
          <div ref={liquidRef} className="wine-liquid absolute bottom-0 left-0 h-[0%] w-full" />
        </div>
      </div>
    </>
  );
}
