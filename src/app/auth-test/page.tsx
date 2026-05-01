"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";

export default function AuthTestPage() {
  const { data: session, isPending, error, refetch } = authClient.useSession();
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"signIn" | "signOut" | null>(null);

  const signInGoogle = useCallback(async () => {
    setActionError(null);
    setBusy("signIn");
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: "/auth-test",
      });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, []);

  const signOut = useCallback(async () => {
    setActionError(null);
    setBusy("signOut");
    try {
      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            void refetch();
          },
        },
      });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [refetch]);

  const sessionStatus = isPending
    ? "loading"
    : session?.user
      ? "signed-in"
      : "signed-out";

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Auth prototype (Google OAuth)
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Throwaway UI for Better Auth: sign-in, session, redirects. All UI
          primitives are shadcn/ui under <code className="text-xs">@/components/ui</code>.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Session</CardTitle>
          <CardDescription>
            <Badge variant="secondary" className="font-mono text-xs">
              {sessionStatus}
            </Badge>
            {error ? (
              <span className="text-destructive ml-2 text-xs">
                {error.message}
              </span>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={busy !== null || isPending}
            onClick={() => void signInGoogle()}
          >
            {busy === "signIn" ? "Redirecting…" : "Sign in with Google"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy !== null || isPending || !session?.user}
            onClick={() => void signOut()}
          >
            {busy === "signOut" ? "Signing out…" : "Sign out"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => void refetch()}
          >
            Refetch session
          </Button>
        </CardContent>
        <CardFooter className="flex flex-col items-stretch gap-2 border-t pt-4">
          <p className="text-muted-foreground text-xs font-medium">
            Session payload (debug)
          </p>
          <pre className="bg-muted max-h-64 overflow-auto rounded-md border p-3 text-xs">
            {isPending
              ? "…"
              : JSON.stringify(
                  session
                    ? { user: session.user, session: session.session }
                    : null,
                  null,
                  2,
                )}
          </pre>
          {actionError ? (
            <p className="text-destructive text-xs">{actionError}</p>
          ) : null}
        </CardFooter>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Redirect / middleware checks</CardTitle>
          <CardDescription className="text-xs">
            Middleware protects <code>/api/*</code> (except{" "}
            <code>/api/auth</code>) and <code>/chat/*</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <Button variant="secondary" size="sm" asChild>
            <Link href="/chat/prototype-route">
              Open /chat/prototype-route (needs session → else redirect home
              with ?signin=required)
            </Link>
          </Button>
          <Button variant="secondary" size="sm" asChild>
            <Link href="/api/conversations">GET /api/conversations (401 if no session)</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/">Home</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
