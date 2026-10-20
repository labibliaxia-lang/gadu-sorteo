import Image from "next/image";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Prize } from "@/lib/types";

function PrizeImage({
  src,
  alt,
  className,
}: {
  src: string | null;
  alt: string;
  className?: string;
}) {
  return (
    <div className={cn("relative w-full overflow-hidden bg-muted", className)}>
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 640px) 100vw, 33vw"
          className="object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
          Sin imagen
        </div>
      )}
    </div>
  );
}

export function PrizeCard({ prize }: { prize: Prize }) {
  const hasSecondImage = Boolean(prize.image_url_2);

  return (
    <Card className="overflow-hidden">
      {hasSecondImage ? (
        <div className="grid grid-cols-2 gap-1">
          <PrizeImage
            src={prize.image_url}
            alt={prize.title}
            className="aspect-square"
          />
          <PrizeImage
            src={prize.image_url_2}
            alt={`${prize.title} — foto 2`}
            className="aspect-square"
          />
        </div>
      ) : (
        <PrizeImage
          src={prize.image_url}
          alt={prize.title}
          className="aspect-video"
        />
      )}

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
