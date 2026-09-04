import { useEffect, type ReactNode } from "react";
import { getSupabase, mapSupabaseUser } from "@/lib/supabase";
import { useStudyStore } from "@/lib/store";

/**
 * Bridges the Supabase auth session into the global store.
 *
 * - When Supabase is not configured the app stays in anonymous (local) mode.
 * - `onAuthStateChange` fires an INITIAL_SESSION event on subscribe, which
 *   marks the store as auth-ready and restores any persisted session.
 */
export default function AuthProvider({ children }: { children: ReactNode }) {
  const setAuthUser = useStudyStore((s) => s.setAuthUser);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setAuthUser(null);
      return;
    }
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ? mapSupabaseUser(session.user) : null);
    });
    return () => subscription.unsubscribe();
  }, [setAuthUser]);

  return <>{children}</>;
}