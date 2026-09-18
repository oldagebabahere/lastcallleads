import type { ReactNode } from "react";
import { Footer, Nav } from "@/components/ui";
import { PUBLIC_CONFIG } from "@/lib/public-config";

export default function LegalPage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen">
      <Nav />
      <article className="mx-auto max-w-3xl px-5 pb-20 pt-28">
        <p className="eyebrow">[ {eyebrow} ]</p>
        <h1 className="font-display mt-5 text-4xl font-medium sm:text-5xl">{title}</h1>
        <p className="mt-4 text-base leading-relaxed text-smoke">{intro}</p>
        <p className="mt-3 font-mono text-[10px] tracking-[0.14em] text-faint">
          EFFECTIVE: {PUBLIC_CONFIG.effectiveDate.toUpperCase()}
        </p>
        <div className="mt-12 space-y-10">{children}</div>
      </article>
      <Footer />
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-2xl font-medium text-cream">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-7 text-smoke">{children}</div>
    </section>
  );
}

export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5 marker:text-amber">{children}</ul>;
}
