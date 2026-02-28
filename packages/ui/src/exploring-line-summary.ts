import type { StreamItem } from "@axel-delafosse/protocol/stream-items"

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ExploringSummaryLine {
  /** Primary detail - file path, pattern, query, etc. */
  detail: string
  /** Short label like "Read", "Grep", "$ cat", "$ ls" */
  label: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_DETAIL_LENGTH = 80

const WHITESPACE_RE = /\s+/

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const truncate = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max)}\u2026` : text

/**
 * Normalise a command value into a single string.
 * Accepts a plain string or an array of strings (e.g. `["cat", "foo.ts"]`).
 */
function normalizeCommand(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim()
  }
  if (Array.isArray(value)) {
    const parts = value.filter((v): v is string => typeof v === "string")
    if (parts.length > 0) {
      return parts.join(" ").trim()
    }
  }
  return undefined
}

/**
 * Extract the raw command string from a `command_execution` item.
 * Checks multiple data fields and the `commandActions` array format.
 */
function extractCommandString(item: StreamItem): string | undefined {
  const { data } = item

  // commandActions array (Codex item structure)
  const actions = data.commandActions ?? data.command_actions
  if (Array.isArray(actions) && actions.length > 0) {
    const commands: string[] = []
    for (const action of actions) {
      if (action && typeof action === "object") {
        const rec = action as Record<string, unknown>
        const cmd = normalizeCommand(rec.command ?? rec.cmd)
        if (cmd) {
          commands.push(cmd)
        }
      }
    }
    if (commands.length > 0) {
      return commands.join(" && ")
    }
  }

  return (
    normalizeCommand(data.command) ??
    normalizeCommand(data.cmd) ??
    normalizeCommand(data.input) ??
    normalizeCommand(data.line)
  )
}

/**
 * Resolve the arguments object from a `tool_call` item by checking the
 * standard fields in priority order.
 */
export function extractToolArgs(
  data: Record<string, unknown>
): Record<string, unknown> | undefined {
  const candidates = [
    data.arguments,
    data.input,
    data.args,
    data.parameters,
    data.payload,
  ]

  for (const candidate of candidates) {
    if (
      candidate &&
      typeof candidate === "object" &&
      !Array.isArray(candidate)
    ) {
      return candidate as Record<string, unknown>
    }
  }

  // partialJson fallback — a JSON string that needs parsing
  if (typeof data.partialJson === "string") {
    try {
      const parsed: unknown = JSON.parse(data.partialJson)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      // malformed JSON — ignore
    }
  }

  return undefined
}

/**
 * Resolve the tool name from the item's data bag.
 */
function extractToolName(data: Record<string, unknown>): string | undefined {
  const name =
    data.toolName ?? data.tool_name ?? data.tool ?? data.name ?? data.function
  if (typeof name === "string" && name.trim().length > 0) {
    return name.trim()
  }
  return undefined
}

/**
 * Canonical display labels for known tool names.
 * Maps lowered tool name -> display string.
 */
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  read: "Read",
  read_file: "Read",
  file_read: "Read",
  grep: "Grep",
  search_files: "Search",
  glob: "Glob",
  list_files: "List",
  list_directory: "List",
  directory_list: "List",
  ls: "List",
  webfetch: "Fetch",
  web_fetch: "Fetch",
  websearch: "Search",
  web_search: "Search",
}

/** Capitalise the first letter of a string. */
const capitalize = (s: string): string =>
  s.length === 0 ? s : `${s[0].toUpperCase()}${s.slice(1)}`

/**
 * Known argument key lookup per tool name (case-insensitive matching).
 * Maps a lowered tool name to the ordered list of argument keys to try.
 */
export const TOOL_ARG_KEYS: Record<string, readonly string[]> = {
  read: ["file_path", "path"],
  read_file: ["file_path", "path"],
  file_read: ["file_path", "path"],
  grep: ["pattern"],
  search_files: ["pattern"],
  glob: ["pattern", "path"],
  list_files: ["pattern", "path"],
  list_directory: ["pattern", "path"],
  directory_list: ["pattern", "path"],
  ls: ["path"],
  webfetch: ["url"],
  web_fetch: ["url"],
  websearch: ["query"],
  web_search: ["query"],
  edit: ["file_path", "path"],
  write: ["file_path", "path"],
  file_write: ["file_path", "path"],
  bash: ["command", "cmd"],
  shell: ["command", "cmd"],
  execute: ["command", "cmd"],
  run: ["command", "cmd"],
}

/**
 * Pick the most relevant detail string from a tool's argument bag.
 */
function pickToolDetail(
  toolName: string,
  args: Record<string, unknown>
): string {
  const keys = TOOL_ARG_KEYS[toolName.toLowerCase()]

  if (keys) {
    for (const key of keys) {
      const value = args[key]
      if (typeof value === "string" && value.length > 0) {
        return truncate(value, MAX_DETAIL_LENGTH)
      }
    }
  }

  // Fallback: first string value in the args object
  for (const value of Object.values(args)) {
    if (typeof value === "string" && value.length > 0) {
      return truncate(value, MAX_DETAIL_LENGTH)
    }
  }

  return "\u2026"
}

/**
 * Extract an error message from a `tool_result` item's data bag.
 */
function extractErrorMessage(
  data: Record<string, unknown>
): string | undefined {
  const candidates = [data.error, data.errorMessage, data.stderr]
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate
    }
    // Handle structured error objects like { error: { message: "..." } }
    if (
      candidate &&
      typeof candidate === "object" &&
      !Array.isArray(candidate)
    ) {
      const rec = candidate as Record<string, unknown>
      const msg = rec.message ?? rec.msg ?? rec.detail ?? rec.description
      if (typeof msg === "string" && msg.length > 0) {
        return msg
      }
    }
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract a one-line summary from an exploring StreamItem.
 * Returns `null` for items that should be hidden in collapsed view
 * (e.g. successful `tool_result` entries).
 */
export function summarizeExploringItem(
  item: StreamItem
): ExploringSummaryLine | null {
  if (item.type === "command_execution") {
    return summarizeCommandExecution(item)
  }

  if (item.type === "tool_call") {
    return summarizeToolCall(item)
  }

  if (item.type === "tool_result") {
    return summarizeToolResult(item)
  }

  return null
}

// ---------------------------------------------------------------------------
// Per-type summarisers
// ---------------------------------------------------------------------------

function summarizeCommandExecution(
  item: StreamItem
): ExploringSummaryLine | null {
  const command = extractCommandString(item)
  if (!command || command.length === 0) {
    return null
  }

  const parts = command.split(WHITESPACE_RE)
  const binary = parts[0]
  const rest = parts.slice(1).join(" ")

  return {
    label: `$ ${binary}`,
    detail: truncate(rest, MAX_DETAIL_LENGTH),
  }
}

function summarizeToolCall(item: StreamItem): ExploringSummaryLine | null {
  const toolName = extractToolName(item.data)
  if (!toolName) {
    return null
  }

  const args = extractToolArgs(item.data)
  const detail = args ? pickToolDetail(toolName, args) : "\u2026"

  return {
    label: TOOL_DISPLAY_NAMES[toolName.toLowerCase()] ?? capitalize(toolName),
    detail,
  }
}

function summarizeToolResult(item: StreamItem): ExploringSummaryLine | null {
  const hasError =
    item.status === "error" || extractErrorMessage(item.data) !== undefined

  if (!hasError) {
    return null
  }

  const errorMsg = extractErrorMessage(item.data) ?? "Unknown error"

  return {
    label: "Error",
    detail: truncate(errorMsg, MAX_DETAIL_LENGTH),
  }
}

// ---------------------------------------------------------------------------
// Merge consecutive same-label summary lines
// ---------------------------------------------------------------------------

export interface MergedSummaryLine {
  count: number
  details: string[]
  label: string
}

/**
 * Merge consecutive summary lines with the same label into one entry.
 * E.g. three consecutive "Read" lines become: `Read file1, file2, file3`
 */
export function mergeSummaryLines(
  lines: readonly ExploringSummaryLine[]
): MergedSummaryLine[] {
  const merged: MergedSummaryLine[] = []

  for (const line of lines) {
    const last = merged.at(-1)
    if (last && last.label === line.label) {
      last.details.push(line.detail)
      last.count++
    } else {
      merged.push({
        label: line.label,
        details: [line.detail],
        count: 1,
      })
    }
  }

  return merged
}
