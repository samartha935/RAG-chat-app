import Link from "next/link";
import { ArrowRight, BookOpen, FileSearch, ShieldCheck, Sparkles } from "lucide-react";
import { AuthActions } from "@/components/auth-actions";
import { Button } from "@/components/ui/button";

type Props = {
  searchParams: Promise<{ signin?: string }>;
};

export default async function Home({ searchParams }: Props) {
  const q = await searchParams;
  const blocked = q.signin === "required";

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgb(255_255_255/0.035)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.035)_1px,transparent_1px)] bg-[size:64px_64px]" />
      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 shadow-[0_0_30px_rgb(141_127_255/0.18)]">
            <BookOpen className="size-5 text-primary" />
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-[0.28em] text-secondary uppercase">
              Scholar
            </span>
            <span className="block text-lg font-semibold tracking-tight">
              Doc AI
            </span>
          </span>
        </Link>
        <AuthActions compact />
      </header>

      {blocked ? (
        <div className="relative z-10 mx-auto mt-2 w-full max-w-7xl px-6">
          <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
            Sign in with Google to open your research workspace.
          </div>
        </div>
      ) : null}

      <section className="relative z-10 mx-auto grid w-full max-w-7xl flex-1 items-center gap-12 px-6 py-16 lg:grid-cols-[1.02fr_0.98fr] lg:py-24">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3.5 text-secondary" />
            Evidence-first document intelligence
          </div>
          <h1 className="max-w-4xl text-5xl leading-[1.03] font-semibold tracking-[-0.045em] text-balance md:text-7xl">
            Analyze PDFs with an AI research partner that cites its sources.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
            Upload a document, ask focused questions, and inspect the exact PDF
            evidence behind each answer in a calm, high-density workspace.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <AuthActions />
            <Button asChild variant="outline" className="border-white/10 bg-white/[0.03]">
              <Link href="#preview">
                See workflow <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
          <div className="mt-10 grid max-w-2xl gap-3 sm:grid-cols-3">
            {[
              ["Private workspace", "Google-only sign-in gates your files."],
              ["RAG retrieval", "Semantic chunks power grounded answers."],
              ["Quota aware", "Upload and chat limits are surfaced clearly."],
            ].map(([title, copy]) => (
              <div key={title} className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{copy}</p>
              </div>
            ))}
          </div>
        </div>

        <div id="preview" className="rounded-3xl border border-white/10 bg-[#16161e]/80 p-3 shadow-[0_0_80px_rgb(141_127_255/0.16)] backdrop-blur">
          <div className="rounded-2xl border border-white/10 bg-[#0e0d15] p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold tracking-[0.24em] text-secondary uppercase">
                  Live workspace
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Chat, citations, and PDF context in one view.
                </p>
              </div>
              <ShieldCheck className="size-5 text-secondary" />
            </div>
            <div className="grid gap-3 md:grid-cols-[0.8fr_1.2fr]">
              <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.035] p-3">
                {["Research brief.pdf", "Source chunks", "Storage quota"].map((item) => (
                  <div key={item} className="rounded-lg border border-white/10 bg-[#201f27] p-3 text-sm">
                    {item}
                  </div>
                ))}
              </div>
              <div className="space-y-3 rounded-xl border border-white/10 bg-[#16161e] p-4">
                <div className="w-4/5 rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.04] p-3 text-sm text-muted-foreground">
                  Summarize the document’s main claims.
                </div>
                <div className="ml-auto w-11/12 rounded-2xl rounded-br-md border border-primary/20 bg-primary/10 p-3 text-sm">
                  The paper argues for retrieval-augmented analysis with cited
                  evidence and bounded model calls.
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-secondary/40 bg-secondary/10 px-2 py-1 font-mono text-xs text-secondary">
                    <FileSearch className="size-3" />
                    Source 1
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
