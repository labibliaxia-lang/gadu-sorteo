import { redirect } from "next/navigation";
import { Crown, KeyRound, Ticket } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RedeemCodeForm } from "@/components/RedeemCodeForm";

export const dynamic = "force-dynamic";

export default async function PlanesPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();

  const currentPlan = (profile?.plan as string | null) ?? "free";

  const { data: redeemed } = await supabase
    .from("license_codes")
    .select("code, plan, redeemed_at")
    .eq("redeemed_by", user.id)
    .order("redeemed_at", { ascending: false })
    .limit(10);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="space-y-2 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow">
          <Ticket className="h-6 w-6" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Planes y licencias</h1>
        <p className="text-muted-foreground">
          Canjeá tu código de activación para habilitar tu plan.
        </p>

        <div className="flex justify-center pt-1">
          {currentPlan === "premium" ? (
            <Badge className="border-transparent bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white">
              <Crown className="mr-1 h-3.5 w-3.5" />
              Plan Premium activo
            </Badge>
          ) : (
            <Badge variant="secondary">Plan Free</Badge>
          )}
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <KeyRound className="h-5 w-5 text-amber-500" />
            Canjear código
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Pegá el código de activación de 25 caracteres que te entregó el
            organizador.
          </p>
        </CardHeader>
        <CardContent>
          <RedeemCodeForm />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Mis códigos canjeados</h2>

        {redeemed && redeemed.length > 0 ? (
          <div className="space-y-2">
            {redeemed.map((item) => (
              <div
                key={item.code}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"
              >
                <code className="break-all font-mono text-xs sm:text-sm">
                  {item.code}
                </code>
                <div className="flex items-center gap-2">
                  <Badge variant="success" className="capitalize">
                    {item.plan}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {item.redeemed_at
                      ? new Date(item.redeemed_at).toLocaleDateString("es-AR")
                      : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Todavía no canjeaste ningún código.
          </p>
        )}
      </section>
    </div>
  );
}
