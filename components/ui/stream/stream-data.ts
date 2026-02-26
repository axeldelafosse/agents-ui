import type { StreamItem } from "./stream-types"

type UnknownRecord = Record<string, unknown>

const DEFAULT_MARKDOWN_KEYS = [
  "text",
  "content",
  "markdown",
  "message",
  "summary",
  "description",
  "output",
] as const

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
})

export const asRecord = (value: unknown): UnknownRecord | null => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as UnknownRecord
  }

  return null
}

export const getValue = (
  source: unknown,
  keys: readonly string[]
): unknown | undefined => {
  const record = asRecord(source)
  if (!record) {
    return undefined
  }

  for (const key of keys) {
    const value = record[key]
    if (value !== undefined && value !== null) {
      return value
    }
  }

  return undefined
}

export const getString = (
  source: unknown,
  keys: readonly string[]
): string | undefined => {
  const value = getValue(source, keys)
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }

  return undefined
}

export const getNumber = (
  source: unknown,
  keys: readonly string[]
): number | undefined => {
  const value = getValue(source, keys)
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined
  }

  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  return undefined
}

export const getBoolean = (
  source: unknown,
  keys: readonly string[]
): boolean | undefined => {
  const value = getValue(source, keys)
  if (typeof value === "boolean") {
    return value
  }

  if (typeof value === "string") {
    if (value === "true") {
      return true
    }
    if (value === "false") {
      return false
    }
  }

  return undefined
}

export const getArray = (
  source: unknown,
  keys: readonly string[]
): unknown[] => {
  const value = getValue(source, keys)
  return Array.isArray(value) ? value : []
}

export const readValue = (source: unknown, ...keys: string[]): unknown => {
  if (keys.length === 0) {
    return undefined
  }
  return getValue(source, keys)
}

export const readString = (
  source: unknown,
  ...keys: string[]
): string | undefined => {
  if (keys.length === 0) {
    if (typeof source !== "string") {
      return undefined
    }
    const trimmed = source.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }
  return getString(source, keys)
}

export const readNumber = (
  source: unknown,
  ...keys: string[]
): number | undefined => {
  if (keys.length === 0) {
    if (typeof source === "number") {
      return Number.isFinite(source) ? source : undefined
    }
    if (typeof source === "string" && source.trim().length > 0) {
      const parsed = Number(source)
      return Number.isFinite(parsed) ? parsed : undefined
    }
    return undefined
  }
  return getNumber(source, keys)
}

export const readBoolean = (
  source: unknown,
  ...keys: string[]
): boolean | undefined => {
  if (keys.length === 0) {
    if (typeof source === "boolean") {
      return source
    }
    if (typeof source === "string") {
      if (source === "true") {
        return true
      }
      if (source === "false") {
        return false
      }
    }
    return undefined
  }
  return getBoolean(source, keys)
}

export const readArray = (
  source: unknown,
  ...keys: string[]
): unknown[] | undefined => {
  const value = keys.length > 0 ? getValue(source, keys) : source
  return Array.isArray(value) ? value : undefined
}

export const readStringArray = (
  source: unknown,
  ...keys: string[]
): string[] => {
  const selected = keys.length > 0 ? readValue(source, ...keys) : source
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

export const getMarkdown = (
  source: unknown,
  keys: readonly string[] = DEFAULT_MARKDOWN_KEYS
): string | undefined => {
  const directText = getString(source, keys)
  if (directText) {
    return directText
  }

  for (const key of keys) {
    const value = getValue(source, [key])

    if (Array.isArray(value)) {
      const pieces: string[] = []
      for (const entry of value) {
        if (typeof entry === "string") {
          pieces.push(entry)
          continue
        }

        const entryRecord = asRecord(entry)
        const text = getString(entryRecord, ["text", "content", "value"])
        if (text) {
          pieces.push(text)
        }
      }

      const joined = pieces.join("\n").trim()
      if (joined.length > 0) {
        return joined
      }
    }

    const recordValue = asRecord(value)
    const nestedText = getString(recordValue, ["text", "content", "value"])
    if (nestedText) {
      return nestedText
    }
  }

  return undefined
}

export const toDisplayText = (value: unknown): string => {
  if (value === undefined) {
    return ""
  }

  if (typeof value === "string") {
    return value
  }

  if (value instanceof Error) {
    return value.message
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export const toPrettyJson = (value: unknown): string => {
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

export const toInlineText = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  return undefined
}

export const formatDuration = (
  durationMs: number | undefined
): string | undefined => {
  if (durationMs === undefined || durationMs < 0) {
    return undefined
  }
  if (durationMs < 1000) {
    return `${durationMs}ms`
  }
  return `${(durationMs / 1000).toFixed(2)}s`
}

export const formatTime = (item: StreamItem): string | undefined => {
  if (typeof item.timestamp !== "number" || !Number.isFinite(item.timestamp)) {
    return undefined
  }

  return timeFormatter.format(new Date(item.timestamp))
}

export const isStreaming = (item: StreamItem): boolean =>
  item.status === "streaming"
