import Image from "next/image";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import type { Prize } from "@/lib/types";

export function PrizeCard({ prize }: { prize: Prize }) {
  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-video w-full bg-muted">
        {prize.image_url ? (
          <Image
            src={prize.image_url}
            alt={prize.title}
            fill
            sizes="(max-width: 640px) 100vw, 33vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Sin imagen
          </div>
        )}
      </div>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <Badge variant="secondary">Puesto {prize.position}</Badge>
          {prize.tool_number != null && (
            <Badge variant="outline">Herramienta #{prize.tool_number}</Badge>
          )}
        </div>
        <CardTitle className="text-lg">{prize.title}</CardTitle>
        {prize.description && (
          <CardDescription>{prize.description}</CardDescription>
        )}
      </CardContent>
    </Card>
  );
}
