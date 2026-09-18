import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Footer, Nav } from "@/components/ui";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "You are in" };

export default function WelcomePage() {
  return (
    <main className="flex min-h-screen flex-col">
      <Nav />
      <div className="flex flex-1 items-center justify-center px-5 pt-24 pb-16">
        <div className="w-full max-w-lg text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-leaf/40 bg-leaf/10">
            <CheckCircle2 className="h-6 w-6 text-leaf" />
          </span>
          <h1 className="font-display mt-7 text-4xl font-medium sm:text-5xl">
            You are <span className="italic text-amber">in.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-smoke">
            Your first digest lands the next time the machine sweeps the registries
            (every morning). From here on, you will hear about every new filing in your
            territories before the paint is dry on the walls.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-4">
            <Link
              href="/feed"
              className="rounded-full bg-amber px-6 py-3 font-mono text-[11px] font-semibold tracking-[0.12em] text-ink transition-transform hover:scale-[1.03]"
            >
              BROWSE THE FEED
            </Link>
            <Link
              href="/"
              className="rounded-full border border-line px-6 py-3 font-mono text-[11px] tracking-[0.12em] text-smoke hover:text-cream"
            >
              BACK HOME
            </Link>
          </div>
        </div>
      </div>
      <Footer />
    </main>
  );
}
