"use client"

import { cn } from "@axel-delafosse/ui/utils"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-4xl border border-transparent bg-clip-padding font-medium text-sm shadow-[0_16px_28px_-22px_oklch(0.24_0.03_245/0.55)] outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          // "bg-primary text-primary-foreground shadow-[0_18px_32px_-18px_oklch(0.45_0.15_236/0.8)] hover:bg-primary/90",
          "border-primary/65 bg-primary/60 text-primary-foreground shadow-[0_18px_32px_-18px_oklch(0.45_0.15_236/0.8)] backdrop-blur-xl hover:bg-primary/75 hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-primary/20 dark:bg-primary/10 dark:aria-expanded:bg-white/15 dark:hover:bg-white/15",
        outline:
          "border-white/65 bg-white/60 backdrop-blur-xl hover:bg-white/75 hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-white/20 dark:bg-white/10 dark:aria-expanded:bg-white/15 dark:hover:bg-white/15",
        secondary:
          "border-white/50 bg-secondary text-secondary-foreground hover:bg-secondary/90 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground dark:border-white/15 dark:bg-secondary/70 dark:hover:bg-secondary/80",
        ghost:
          "hover:bg-white/45 hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:aria-expanded:bg-white/12 dark:hover:bg-white/12",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 dark:hover:bg-destructive/30",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-9 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-6 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        lg: "h-10 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
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
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      className={cn(buttonVariants({ variant, size, className }))}
      data-slot="button"
      {...props}
    />
  )
}

export { Button, buttonVariants }
