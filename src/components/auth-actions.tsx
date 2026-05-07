"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function AuthActions({ compact = false }: { compact?: boolean }) {
  const { data: session, isPending } = authClient.useSession();
  const [busy, setBusy] = useState<"signIn" | "signOut" | null>(null);

  const signIn = useCallback(async () => {
    setBusy("signIn");
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: "/chat/new",
      });
    } finally {
      setBusy(null);
    }
  }, []);

  const signOut = useCallback(async () => {
    setBusy("signOut");
    try {
      await authClient.signOut();
    } finally {
      setBusy(null);
    }
  }, []);

  if (isPending) {
    return (
      <Button disabled className={compact ? "h-9" : ""}>
        Checking session
      </Button>
    );
  }

  if (session?.user) {
    return (
      <div className={compact ? "flex items-center gap-2" : "flex flex-wrap gap-3"}>
        <Button asChild className="bg-primary text-primary-foreground shadow-[0_0_28px_rgb(141_127_255/0.2)] hover:bg-primary/90">
          <Link href="/chat/new">Open workspace</Link>
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void signOut()}
          disabled={busy !== null}
        >
          {busy === "signOut" ? "Signing out" : "Sign out"}
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      onClick={() => void signIn()}
      disabled={busy !== null}
      className="bg-primary text-primary-foreground shadow-[0_0_28px_rgb(141_127_255/0.24)] hover:bg-primary/90"
    >
      {busy === "signIn" ? "Redirecting" : "Sign in with Google"}
    </Button>
  );
}
