import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Botones del sistema "Mesa de sorteo".
 * Primaria = ámbar (dark) / tinta (light), un solo acento por pantalla.
 * Secundaria = hairline; nunca compite con la primaria.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg font-medium ring-offset-background transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary-hover active:translate-y-px",
        success:
          "bg-emerald-600 text-white hover:bg-emerald-500 active:translate-y-px",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:translate-y-px",
        outline:
          "border border-hairline-strong bg-transparent text-fg hover:border-fg-faint hover:bg-panel-2",
        secondary:
          "border border-hairline bg-panel-2 text-fg hover:bg-panel-3",
        ghost:
          "text-fg-muted hover:bg-panel-2 hover:text-fg",
        link: "text-brand-800 underline-offset-4 hover:underline dark:text-brand-300",
      },
      size: {
        default: "h-10 px-4 text-sm",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-12 rounded-lg px-6 text-[15px]",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
