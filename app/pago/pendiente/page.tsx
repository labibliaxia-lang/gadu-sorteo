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

export default function PagoPendientePage() {
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>⏳ Pago pendiente</CardTitle>
          <CardDescription>
            Mercado Pago todavía está procesando tu pago. Te avisaremos cuando
            se confirme.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button asChild className="w-full">
            <Link href="/mis-pagos">Ver estado de mis pagos</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
