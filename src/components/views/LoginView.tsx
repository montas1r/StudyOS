import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, Lock, Loader2, Chrome, Github, ArrowRight, ShieldCheck } from "lucide-react";
import {
  isSupabaseConfigured,
  signInWithEmail,
  signUpWithEmail,
  signInWithOAuth,
  type OAuthProvider,
} from "@/lib/supabase";
import { useUser } from "@/lib/store";

type Mode = "signin" | "signup";

const OAUTH_PROVIDERS: { id: OAuthProvider; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: "google", label: "Google", icon: Chrome },
  { id: "github", label: "GitHub", icon: Github },
];

export default function LoginView() {
  const user = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (user) {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signin") {
        const res = await signInWithEmail(email, password);
        if (res.error) setError(res.error);
        // On success the AuthProvider syncs the session and this view redirects.
      } else {
        const res = await signUpWithEmail(email, password);
        if (res.error) {
          setError(res.error);
        } else if (res.requiresConfirmation) {
          setNotice("Account created — check your email to confirm your address, then sign in.");
          setMode("signin");
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: OAuthProvider) {
    setError(null);
    setOauthLoading(provider);
    try {
      const res = await signInWithOAuth(provider);
      if (res.error) setError(res.error);
      // Otherwise the browser redirects to the provider, then back with a session.
    } finally {
      setOauthLoading(null);
    }
  }

  return (
    <div className="auth-page">
      <motion.div
        className="auth-card"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
      >
        <div className="auth-brand">
          <span className="auth-logo">◈</span>
          <h1 className="auth-title">StudyOS</h1>
          <p className="auth-tagline">Focus tracking for serious study sessions.</p>
        </div>

        {!isSupabaseConfigured && (
          <div className="auth-banner">
            <ShieldCheck size={14} />
            <span>
              Accounts aren't configured yet — add <code>VITE_SUPABASE_URL</code> and{" "}
              <code>VITE_SUPABASE_ANON_KEY</code> to your <code>.env</code> file to enable sign-in.
            </span>
          </div>
        )}

        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signin"}
            className={`auth-tab ${mode === "signin" ? "auth-tab-active" : ""}`}
            onClick={() => { setMode("signin"); setError(null); setNotice(null); }}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signup"}
            className={`auth-tab ${mode === "signup" ? "auth-tab-active" : ""}`}
            onClick={() => { setMode("signup"); setError(null); setNotice(null); }}
          >
            Create account
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span className="auth-label">Email</span>
            <div className="auth-input-wrap">
              <Mail size={15} className="auth-input-icon" />
              <input
                type="email"
                value={email}
                autoComplete="email"
                placeholder="you@example.com"
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </label>

          <label className="auth-field">
            <span className="auth-label">Password</span>
            <div className="auth-input-wrap">
              <Lock size={15} className="auth-input-icon" />
              <input
                type="password"
                value={password}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                placeholder="••••••••"
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </label>

          {error && <div className="auth-error">{error}</div>}
          {notice && <div className="auth-notice">{notice}</div>}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? <Loader2 size={15} className="auth-spin" /> : <ArrowRight size={15} />}
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="auth-divider">
          <span>or continue with</span>
        </div>

        <div className="auth-oauth">
          {OAUTH_PROVIDERS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className="auth-oauth-btn"
              disabled={oauthLoading !== null}
              onClick={() => handleOAuth(id)}
            >
              {oauthLoading === id ? <Loader2 size={15} className="auth-spin" /> : <Icon size={15} />}
              {label}
            </button>
          ))}
        </div>

        <button type="button" className="auth-anon" onClick={() => navigate("/")}>
          Continue without an account →
        </button>
      </motion.div>
    </div>
  );
}