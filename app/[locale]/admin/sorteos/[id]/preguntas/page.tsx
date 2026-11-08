import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { requireAdminSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { RaffleQnA } from "@/components/RaffleQnA";
import type { PublicQuestion } from "@/lib/questions";

export const dynamic = "force-dynamic";

export default async function AdminRaffleQuestionsPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await requireAdminSession();
  if (!session) redirect("/login");

  const supabase = createClient();

  const { data: raffle } = await supabase
    .from("raffles")
    .select("id, title, created_by")
    .eq("id", params.id)
    .maybeSingle();

  if (!raffle) notFound();

  const { data: owns } = await supabase.rpc("owns_raffle", {
    p_raffle_id: params.id,
  });

  if (owns !== true) notFound();

  const { data: rows } = await supabase
    .from("raffle_questions")
    .select("id, question, answer, created_at, answered_at")
    .eq("raffle_id", params.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const questions: PublicQuestion[] = (rows ?? []).map((row) => ({
    id: row.id as string,
    question: row.question as string,
    answer: (row.answer as string | null) ?? null,
    createdAt: row.created_at as string,
    answeredAt: (row.answered_at as string | null) ?? null,
    isMine: false,
  }));

  return (
    <div className="space-y-6">
      <Link
        href={`/admin/sorteos/${params.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al sorteo
      </Link>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Preguntas de usuarios
          </h1>
          <p className="text-sm text-muted-foreground">
            Respondé en público las dudas de {raffle.title}. Las pendientes
            aparecen primero.
          </p>
        </div>
        <Link
          href={`/sorteos/${params.id}#preguntas`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-amber-800 underline-offset-4 hover:underline dark:text-amber-300"
        >
          Ver sección pública
          <ExternalLink className="h-4 w-4" />
        </Link>
      </header>

      <RaffleQnA
        raffleId={params.id}
        questions={questions}
        isLoggedIn
        canAnswer
        canModerate
      />
    </div>
  );
}
