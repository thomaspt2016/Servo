import * as React from "react"
import { cn } from "@/components/ui/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info"
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        variant === "default" && "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        variant === "secondary" && "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        variant === "destructive" && "border-transparent bg-destructive/15 text-destructive border border-destructive/30",
        variant === "success" && "border-transparent bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
        variant === "warning" && "border-transparent bg-amber-500/15 text-amber-400 border border-amber-500/30",
        variant === "info" && "border-transparent bg-sky-500/15 text-sky-400 border border-sky-500/30",
        variant === "outline" && "text-foreground border-zinc-700",
        className
      )}
      {...props}
    />
  )
}

export { Badge }
