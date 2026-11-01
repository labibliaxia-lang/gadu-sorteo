import Link from "next/link";
import { Lock, ShieldCheck } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { verifyAdmin } from "@/app/admin/verify/actions";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "Código de administrador incorrecto. Intentá de nuevo.",
  forbidden: "Tu cuenta no tiene permisos de superadministrador.",
  config:
    "Falta configurar ADMIN_ACCESS_CODE en el entorno del servidor. El panel permanece bloqueado por seguridad.",
};

export default function AdminVerifyPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  const rawNext = searchParams.next ?? "";
  const next =
    rawNext.startsWith("/admin") && !rawNext.startsWith("//")
      ? rawNext
      : "/admin/super";

  const error = searchParams.error
    ? (ERROR_MESSAGES[searchParams.error] ?? "No se pudo verificar la sesión.")
    : null;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col py-8 sm:py-16">
      <div className="w-full rounded-2xl border bg-card p-6 shadow-xl sm:p-8">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow">
          <Lock className="h-7 w-7" />
        </div>

        <h1 className="text-center text-2xl font-bold tracking-tight">
          Verificación de administrador
        </h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Por seguridad, ingresá el código de administrador. La sesión del panel
          dura 30 minutos.
        </p>

        {error && (
          <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <form action={verifyAdmin} className="mt-6 space-y-4">
          <input type="hidden" name="next" value={next} />

          <div className="space-y-2">
            <Label htmlFor="code">Código de administrador</Label>
            <div className="relative">
              <ShieldCheck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="code"
                name="code"
                type="password"
                className="pl-9"
                placeholder="••••••••"
                autoComplete="current-password"
                autoFocus
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className={cn(buttonVariants(), "w-full")}
          >
            <Lock className="mr-1.5 h-4 w-4" />
            Desbloquear panel
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          <Link href="/" className="underline underline-offset-4">
            Volver al inicio
          </Link>
        </p>
      </div>
    </div>
  );
}
