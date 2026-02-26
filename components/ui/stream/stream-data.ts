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

export const formatTime = (item: StreamItem): string | undefined => {
  if (typeof item.timestamp !== "number" || !Number.isFinite(item.timestamp)) {
    return undefined
  }

  return timeFormatter.format(new Date(item.timestamp))
}

export const isStreaming = (item: StreamItem): boolean =>
  item.status === "streaming"
