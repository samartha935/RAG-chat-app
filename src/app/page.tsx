import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = {
  searchParams: Promise<{ signin?: string }>;
};

export default async function Home({ searchParams }: Props) {
  const q = await searchParams;
  const blocked = q.signin === "required";

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      {blocked ? (
        <Card className="border-amber-600/50 w-full max-w-md bg-amber-50 dark:bg-amber-950/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sign-in required</CardTitle>
            <CardDescription>
              You tried to open a protected route (e.g.{" "}
              <code className="text-xs">/chat/…</code>) without a session cookie.
              Middleware sent you here.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>RAG chat app</CardTitle>
            <Badge variant="outline" className="text-[10px]">
              shadcn/ui
            </Badge>
          </div>
          <CardDescription>
            Use the auth prototype to verify Google OAuth and session handling.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button asChild>
            <Link href="/auth-test">Open auth test (prototype)</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
