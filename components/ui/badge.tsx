import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Badge de estado: tinte al 10% + texto semántico + hairline.
 * Mono y mayúsculas cortas: se lee como un sello, no como una etiqueta web.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.06em] transition-colors",
  {
    variants: {
      variant: {
        default: "border-hairline bg-panel-2 text-fg-muted",
        secondary: "border-hairline bg-panel-2 text-fg-subtle",
        destructive:
          "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300",
        outline: "border-hairline-strong text-fg-muted",
        success:
          "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        warning:
          "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        info: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
