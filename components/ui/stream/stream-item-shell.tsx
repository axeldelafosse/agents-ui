import type { ReactNode } from "react"
import type { StreamItem } from "@/lib/stream-items"
import { cn } from "@/lib/utils"

type DataRecord = Record<string, unknown>

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

function isRecord(value: unknown): value is DataRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function asRecord(value: unknown): DataRecord | undefined {
  return isRecord(value) ? value : undefined
}

export function readValue(value: unknown, ...keys: string[]): unknown {
  if (keys.length === 0) {
    return undefined
  }
  const record = asRecord(value)
  if (!record) {
    return undefined
  }
  for (const key of keys) {
    const candidate = record[key]
    if (candidate !== undefined && candidate !== null) {
      return candidate
    }
  }
  return undefined
}

export function readString(
  value: unknown,
  ...keys: string[]
): string | undefined {
  const selected = keys.length > 0 ? readValue(value, ...keys) : value
  if (typeof selected !== "string") {
    return undefined
  }
  return selected.trim().length > 0 ? selected : undefined
}

export function readNumber(
  value: unknown,
  ...keys: string[]
): number | undefined {
  const selected = keys.length > 0 ? readValue(value, ...keys) : value
  if (typeof selected === "number" && Number.isFinite(selected)) {
    return selected
  }
  if (typeof selected === "string" && selected.trim().length > 0) {
    const parsed = Number(selected)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return undefined
}

export function readBoolean(
  value: unknown,
  ...keys: string[]
): boolean | undefined {
  const selected = keys.length > 0 ? readValue(value, ...keys) : value
  return typeof selected === "boolean" ? selected : undefined
}

export function readArray(
  value: unknown,
  ...keys: string[]
): unknown[] | undefined {
  const selected = keys.length > 0 ? readValue(value, ...keys) : value
  return Array.isArray(selected) ? selected : undefined
}

export function readStringArray(value: unknown, ...keys: string[]): string[] {
  const selected = keys.length > 0 ? readValue(value, ...keys) : value
  if (typeof selected === "string" && selected.trim().length > 0) {
    return [selected]
  }
  if (!Array.isArray(selected)) {
    return []
  }
  return selected.filter(
    (entry): entry is string =>
      typeof entry === "string" && entry.trim().length > 0
  )
}

export function toPrettyJson(value: unknown): string {
  if (typeof value === "string") {
    return value
  }
  if (value === undefined) {
    return "undefined"
  }
  try {
    const serialized = JSON.stringify(value, null, 2)
    return serialized ?? "undefined"
  } catch {
    return String(value)
  }
}

export function toInlineText(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  return undefined
}

export function formatDuration(
  durationMs: number | undefined
): string | undefined {
  if (durationMs === undefined || durationMs < 0) {
    return undefined
  }
  if (durationMs < 1000) {
    return `${durationMs}ms`
  }
  return `${(durationMs / 1000).toFixed(2)}s`
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
