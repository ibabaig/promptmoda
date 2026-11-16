"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function GoogleButton({ next }: { next?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const callback = new URL("/auth/callback", window.location.origin);
    if (next) callback.searchParams.set("next", next);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.toString() },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  return (
    <div>
      <button className="btn btn-primary" onClick={signIn} disabled={loading}>
        {loading ? "Redirecting…" : "Continue with Google"}
      </button>
      {error && <p className="alert" role="alert">{error}</p>}
    </div>
  );
}
