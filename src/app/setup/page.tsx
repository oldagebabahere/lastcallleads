import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "System status",
  robots: { index: false },
};

// The owner manual now lives inside the key-gated control room.
export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;
  redirect(key ? `/dashboard?key=${encodeURIComponent(key)}#system` : "/dashboard");
}
