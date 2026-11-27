"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";

export function scrollToPricingElement(): boolean {
  if (typeof window === "undefined") return false;
  const target =
    document.getElementById("act-allocation") ?? document.getElementById("pricing");
  if (!target) return false;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

export function ScrollToPricingLink({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    if (window.location.pathname === "/") {
      e.preventDefault();
      scrollToPricingElement();
      window.history.replaceState(null, "", "#pricing");
    }
  }

  return (
    <Link href="/#pricing" onClick={handleClick} className={className}>
      {children}
    </Link>
  );
}

export function ClaimSeatButton({
  stateCode,
  className,
}: {
  stateCode: string;
  className?: string;
}) {
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    if (window.location.pathname === "/") {
      e.preventDefault();
      window.dispatchEvent(
        new CustomEvent("lcl:pick-state", { detail: { state: stateCode } })
      );
      scrollToPricingElement();
      window.history.replaceState(null, "", `/?state=${encodeURIComponent(stateCode)}#pricing`);
    }
  }

  return (
    <Link
      href={`/?state=${encodeURIComponent(stateCode)}#pricing`}
      onClick={handleClick}
      className={className}
    >
      CLAIM SEAT →
    </Link>
  );
}
