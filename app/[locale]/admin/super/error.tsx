"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Borde de error del panel de superadmin.
 *
 * El `try/catch` de `page.tsx` cubre los fallos al cargar datos. Este boundary
 * cubre lo que el try/catch no puede: un error durante el render de la página
 * o de un componente hijo. Sin esto, Next muestra la pantalla genérica de
 * "Application error" y el superadmin pierde el panel completo.
 */
export default function SuperAdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin/super] error de render", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-16" role="alert">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />
            No pudimos mostrar el panel
          </CardTitle>
          <CardDescription>
            Ocurrió un error al renderizar esta sección. Podés reintentar o
            volver al panel general; el resto de la app sigue funcionando.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={reset}>
              Reintentar
            </Button>
            <Link href="/admin" className={buttonVariants({ variant: "outline" })}>
              Volver al panel
            </Link>
          </div>
          {error.digest && (
            <p className="font-mono text-[11px] text-fg-subtle">
              Código de error: {error.digest}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
