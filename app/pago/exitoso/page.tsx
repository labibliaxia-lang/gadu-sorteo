import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default function PagoExitosoPage() {
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>✅ ¡Pago recibido!</CardTitle>
          <CardDescription>
            Estamos confirmando tu pago con Mercado Pago. En unos instantes tus
            números quedarán marcados como vendidos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Podés revisar el estado en “Mis pagos”.
          </p>
          <div className="flex gap-2">
            <Button asChild className="flex-1">
              <Link href="/">Volver al inicio</Link>
            </Button>
            <Button asChild variant="outline" className="flex-1">
              <Link href="/mis-pagos">Mis pagos</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
