"use client";

import { useEffect, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { safeReturnPath } from "@/lib/auth/counselor";

export default function WorkflowBoundary({ userId, children }: { userId: string; children: ReactNode }) {
  useEffect(() => {
    const hide = () => { document.documentElement.style.visibility = "hidden"; };
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
      else document.documentElement.style.visibility = "";
    };
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session || session.user.id !== userId) {
        hide();
        const next = safeReturnPath(window.location.pathname + window.location.search);
        window.location.replace(`/login?next=${encodeURIComponent(next)}`);
      }
    });
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", restore);
    return () => {
      subscription.unsubscribe();
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", restore);
      document.documentElement.style.visibility = "";
    };
  }, [userId]);
  return children;
}
