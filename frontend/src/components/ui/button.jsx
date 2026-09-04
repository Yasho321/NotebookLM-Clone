import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 [&_svg]:stroke-current outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:opacity-90 border border-transparent",
        destructive:
          "bg-destructive text-white shadow-xs hover:opacity-90 border border-transparent",
        outline:
          "border border-border bg-background text-foreground shadow-xs hover:bg-muted/70 hover:border-foreground/30",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80 border border-transparent",
        accent:
          "bg-accent text-accent-foreground shadow-xs hover:opacity-90 border border-transparent",
        ghost:
          "text-foreground hover:bg-muted/70",
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2 has-[>svg]:px-3.5",
        sm: "h-8 rounded-lg gap-1.5 px-3 text-xs has-[>svg]:px-2.5",
        lg: "h-11 rounded-lg px-6 text-sm font-medium has-[>svg]:px-4",
        icon: "size-9 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  style,
  children,
  ...props
}) {
  const Comp = asChild ? Slot : "button";

  // Guaranteed contrast safeguard: directly assign color in style so text cannot be overridden or inherited as invisible
  const contrastStyle =
    variant === "default" || !variant
      ? { color: "var(--primary-foreground)", ...style }
      : variant === "destructive"
      ? { color: "#FFFFFF", ...style }
      : style;

  return (
    <Comp
      data-slot="button"
      data-variant={variant || "default"}
      className={cn(buttonVariants({ variant, size, className }))}
      style={contrastStyle}
      {...props}
    >
      {children}
    </Comp>
  );
}

export { Button, buttonVariants }
