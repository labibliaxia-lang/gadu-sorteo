import Link from "next/link";
import { redirect } from "next/navigation";
import { Star } from "lucide-react";

import { requireAdminSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ReviewReplyForm } from "@/components/ReviewSection";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { averageRating, formatRating, type PublicReview } from "@/lib/reviews";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminReviewsPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/login");

  const supabase = createClient();

  const { data: reviewRows } = await supabase
    .from("reviews")
    .select(
      "id, organizer_id, raffle_id, user_name, rating, comment, reply, created_at",
    )
    .eq("organizer_id", session.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const reviews = (reviewRows ?? []) as PublicReview[];

  const raffleIds = Array.from(
    new Set(reviews.map((review) => review.raffle_id)),
  );

  const { data: raffleRows } = raffleIds.length
    ? await supabase.from("raffles").select("id, title").in("id", raffleIds)
    : { data: [] as { id: string; title: string }[] };

  const titles = new Map(
    (raffleRows ?? []).map((raffle) => [raffle.id, raffle.title]),
  );

  const average = averageRating(reviews);
  const answered = reviews.filter((review) => review.reply).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reseñas</h1>
          <p className="text-sm text-muted-foreground">
            Solo compradores con números pagados en sorteos finalizados pueden
            calificarte. Responder es público y suma confianza.
          </p>
        </div>
        {reviews.length > 0 && (
          <div className="flex items-center gap-2 rounded-full border px-3 py-1.5">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
            <span className="text-sm font-semibold">
              {formatRating(average)}
            </span>
            <span className="text-xs text-muted-foreground">
              ({reviews.length} reseña{reviews.length === 1 ? "" : "s"} ·{" "}
              {answered} respondida{answered === 1 ? "" : "s"})
            </span>
          </div>
        )}
      </header>

      {reviews.length === 0 ? (
        <Card className="border-dashed text-center">
          <CardContent className="space-y-2 py-12 text-sm text-muted-foreground">
            <p>Todavía no recibiste reseñas.</p>
            <p>
              Cuando sortees y tus compradores califiquen, las vas a ver acá
              para responder.
            </p>
            <Link
              href="/admin/sorteos"
              className="text-amber-800 underline-offset-4 hover:underline dark:text-amber-300"
            >
              Ir a mis sorteos
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <Card key={review.id}>
              <CardContent className="space-y-3 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {review.user_name || "Comprador"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(review.created_at)}
                      {titles.get(review.raffle_id)
                        ? ` · ${titles.get(review.raffle_id)}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={
                          star <= review.rating
                            ? "h-4 w-4 fill-amber-400 text-amber-400"
                            : "h-4 w-4 text-muted-foreground/40"
                        }
                      />
                    ))}
                    <Badge variant="secondary" className="ml-1">
                      {review.rating}/5
                    </Badge>
                  </div>
                </div>

                <p className="whitespace-pre-line text-sm text-muted-foreground">
                  {review.comment}
                </p>

                <ReviewReplyForm
                  reviewId={review.id}
                  initialReply={review.reply}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
