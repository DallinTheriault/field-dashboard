"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to Supabase realtime for new SMS messages on this thread.
 * On INSERT or UPDATE, triggers router.refresh() so the server-rendered
 * page re-fetches and shows the new message without manual refresh.
 *
 * Mounts at the top of the SMS thread page. Invisible component.
 */
export function SmsThreadRealtime({ threadId }: { threadId: number }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`sms-thread-${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sms_messages",
          filter: `thread_id=eq.${threadId}`,
        },
        () => {
          router.refresh();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sms_threads",
          filter: `id=eq.${threadId}`,
        },
        () => {
          router.refresh();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId, router]);

  return null;
}
