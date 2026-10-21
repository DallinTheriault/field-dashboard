"use client";

import { useRouter } from "next/navigation";
import { SiteDaysForm } from "../site-days";

export function CatchUpRow({ jobId, days }: { jobId: number; days: string[] }) {
  const router = useRouter();
  return <SiteDaysForm jobId={jobId} initialDays={days} allowNone onDone={() => router.refresh()} />;
}
