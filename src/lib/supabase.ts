/**
 * Supabase client + auth helpers.
 *
 * The app degrades gracefully when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 * are not configured: every helper returns a null user / error message and the
 * app continues in local-only (anonymous) mode.
 */
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let supabaseClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return supabaseClient;
}

/** Lightweight, UI-facing representation of an authenticated user. */
export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  provider: string | null;
}

const NOT_CONFIGURED =
  "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file to enable accounts.";

export function mapSupabaseUser(user: User): AuthUser {
  const meta = user.user_metadata ?? {};
  return {
    id: user.id,
    email: user.email ?? null,
    name: typeof meta.full_name === "string" ? meta.full_name : (user.email ?? null),
    avatarUrl: typeof meta.avatar_url === "string" ? meta.avatar_url : null,
    provider: user.app_metadata?.provider ?? null,
  };
}

export interface AuthResult {
  user: AuthUser | null;
  error: string | null;
  /** True when sign-up created a user but email confirmation is still pending. */
  requiresConfirmation?: boolean;
}

export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return { user: null, error: NOT_CONFIGURED };
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { user: null, error: error.message };
  return { user: data.user ? mapSupabaseUser(data.user) : null, error: null };
}

export async function signUpWithEmail(email: string, password: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return { user: null, error: NOT_CONFIGURED };
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { user: null, error: error.message };
  const requiresConfirmation = Boolean(data.user) && !data.session;
  return {
    user: data.user ? mapSupabaseUser(data.user) : null,
    error: null,
    requiresConfirmation,
  };
}

export type OAuthProvider = "google" | "github";

export async function signInWithOAuth(provider: OAuthProvider): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: NOT_CONFIGURED };
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin },
  });
  return { error: error?.message ?? null };
}

export async function signOutUser(): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: null };
  const { error } = await supabase.auth.signOut();
  return { error: error?.message ?? null };
}