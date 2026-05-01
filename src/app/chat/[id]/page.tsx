import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ChatPrototypePage({ params }: Props) {
  const { id } = await params;

  return (
    <div className="mx-auto max-w-lg p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Chat route (prototype)</CardTitle>
          <CardDescription>
            If you see this page, the session cookie was present and middleware
            allowed <code className="text-xs">/chat/{id}</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/auth-test">Back to auth test</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/">Home</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
