import Image from "next/image";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
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
  const t = useTranslations("PrizeCard");
  return (
    <div className={cn("relative w-full overflow-hidden bg-panel-2", className)}>
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 640px) 100vw, 33vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
          {t("noImage")}
        </div>
      )}
    </div>
  );
}

export function PrizeCard({ prize }: { prize: Prize }) {
  const t = useTranslations("PrizeCard");
  const hasSecondImage = Boolean(prize.image_url_2);
  const isFirst = prize.position === 1;

  return (
    <Card className="group overflow-hidden border-hairline transition-colors hover:border-hairline-strong">
      <div className="relative">
        {hasSecondImage ? (
          <div className="grid grid-cols-2 gap-px">
            <PrizeImage
              src={prize.image_url}
              alt={prize.title}
              className="aspect-square"
            />
            <PrizeImage
              src={prize.image_url_2}
              alt={t("photo2", { title: prize.title })}
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
        <span className="absolute left-3 top-3">
          <Badge
            className={
              isFirst
                ? "border-transparent bg-brand-500 text-ink"
                : "border-transparent bg-panel-3 text-fg-muted"
            }
          >
            {isFirst
              ? t("firstPrize")
              : t("position", { position: prize.position })}
          </Badge>
        </span>
      </div>

      <CardContent className="space-y-2 p-4">
        <CardTitle className="line-clamp-2 text-lg">{prize.title}</CardTitle>
        {prize.description && (
          <p className="line-clamp-3 text-sm text-muted-foreground">
            {prize.description}
          </p>
        )}
        {prize.tool_number != null && (
          <p className="font-mono text-xs text-muted-foreground">
            {t("toolNumber", { number: prize.tool_number })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
