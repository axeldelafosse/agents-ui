import type { ReactNode } from "react"
import type { StreamItem } from "@/lib/stream-items"
import { cn } from "@/lib/utils"

export interface StreamItemShellProps {
  children: ReactNode
  className?: string
  contentClassName?: string
  headerRight?: ReactNode
  item: StreamItem
  label: string
  meta?: ReactNode
  tone?: "danger" | "default" | "muted" | "success" | "warning"
}

const TONE_CLASS_BY_TYPE: Record<
  NonNullable<StreamItemShellProps["tone"]>,
  string
> = {
  danger: "border-red-900/70 bg-red-950/20",
  default: "border-zinc-800 bg-zinc-950/70",
  muted: "border-zinc-800 bg-zinc-950/70",
  success: "border-emerald-900/70 bg-emerald-950/20",
  warning: "border-amber-900/70 bg-amber-950/20",
}

export function StreamItemShell({
  children,
  className,
  contentClassName,
  headerRight,
  item,
  label,
  meta,
  tone = "default",
}: StreamItemShellProps) {
  const isStreaming = item.status === "streaming"
  const toneClass = TONE_CLASS_BY_TYPE[tone]

  return (
    <article
      aria-label={label}
      className={cn(
        "relative overflow-hidden rounded-lg border shadow-sm",
        toneClass,
        isStreaming && "ring-1 ring-blue-500/35",
        className
      )}
      data-status={item.status}
    >
      {isStreaming ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px animate-pulse bg-gradient-to-r from-transparent via-blue-400 to-transparent"
        />
      ) : null}
      <header className="flex items-center justify-between gap-3 border-zinc-800/80 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate font-medium text-sm text-zinc-100">
            {label}
          </h3>
          <span className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 uppercase tracking-wide">
            {item.type}
          </span>
          {meta}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-zinc-400">
          {isStreaming ? (
            <span aria-live="polite" className="inline-flex items-center gap-1">
              <span className="size-1.5 animate-pulse rounded-full bg-blue-400" />
              Streaming
            </span>
          ) : null}
          {item.status === "complete" ? (
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">
              complete
            </span>
          ) : null}
          {item.status === "error" ? (
            <span className="rounded bg-red-900/40 px-1.5 py-0.5 text-red-200">
              error
            </span>
          ) : null}
          {headerRight}
        </div>
      </header>
      <div
        className={cn(
          "space-y-3 px-3 py-3 text-sm text-zinc-200",
          contentClassName
        )}
      >
        {children}
      </div>
    </article>
  )
}
