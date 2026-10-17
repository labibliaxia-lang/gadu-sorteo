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

export default function PagoFallidoPage() {
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>❌ El pago no se completó</CardTitle>
          <CardDescription>
            Tu pago fue rechazado o cancelado. Los números reservados se
            liberarán automáticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button asChild className="w-full">
            <Link href="/">Intentar de nuevo</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
