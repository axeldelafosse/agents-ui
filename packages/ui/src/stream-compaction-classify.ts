import type {
  StreamItem,
  StreamItemType,
} from "@axel-delafosse/protocol/stream-items"

/**
 * Classification helpers for stream item compaction.
 *
 * "Exploring" items are read/list/search-type operations that produce noise
 * when rendered individually. They can be safely grouped into a single
 * collapsible card without losing actionable context.
 *
 * Mirrors the Codex Rust CLI `ExecCell::with_added_call()` heuristic:
 * only read/list/search commands coalesce — shell commands, file changes,
 * approvals, and MCP calls stay standalone.
 */

// ---------------------------------------------------------------------------
// Codex command_execution classification
// ---------------------------------------------------------------------------

/** Read-only shell families that qualify as "exploring" in Codex protocol. */
const EXPLORING_COMMAND_PREFIXES = [
  "cat ",
  "head ",
  "tail ",
  "less ",
  "more ",
  "bat ",
  "ls ",
  "ls\n",
  "dir ",
  "find ",
  "fd ",
  "tree ",
  "exa ",
  "eza ",
  "grep ",
  "rg ",
  "ag ",
  "ack ",
  "fzf ",
  "wc ",
  "file ",
  "stat ",
  "du ",
  "df ",
  "which ",
  "type ",
  "readlink ",
  "realpath ",
  "pwd",
] as const

/** Exact command matches (no args). */
const EXPLORING_COMMAND_EXACT = new Set(["ls", "pwd", "tree", "dir"])

function normalizeCommand(cmd: unknown): string | undefined {
  if (typeof cmd === "string") {
    return cmd.trim()
  }
  if (Array.isArray(cmd)) {
    const first = cmd[0]
    return typeof first === "string" ? cmd.join(" ").trim() : undefined
  }
  return undefined
}

function extractCommand(item: StreamItem): string | undefined {
  const { data } = item

  // Try commandActions array (Codex item structure)
  const actions = data.commandActions ?? data.command_actions
  if (Array.isArray(actions) && actions.length > 0) {
    const first = actions[0]
    if (first && typeof first === "object") {
      const rec = first as Record<string, unknown>
      const cmd = normalizeCommand(rec.command ?? rec.cmd)
      if (cmd) {
        return cmd
      }
    }
  }

  // Direct fields
  return (
    normalizeCommand(data.command) ??
    normalizeCommand(data.cmd) ??
    normalizeCommand(data.input) ??
    normalizeCommand(data.line)
  )
}

function isExploringCommand(command: string): boolean {
  const lower = command.toLowerCase()
  if (EXPLORING_COMMAND_EXACT.has(lower)) {
    return true
  }
  for (const prefix of EXPLORING_COMMAND_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Claude tool_call / tool_result classification
// ---------------------------------------------------------------------------

/** Tool names that represent read/search exploration in Claude protocol. */
const EXPLORING_TOOL_NAMES = new Set([
  // Claude Code built-in tools
  "Read",
  "Glob",
  "Grep",
  "LS",
  "WebFetch",
  "WebSearch",
  // Common lowercase variants
  "read",
  "glob",
  "grep",
  "ls",
  "web_fetch",
  "web_search",
  // File system read operations
  "read_file",
  "list_files",
  "search_files",
  "list_directory",
  "file_read",
  "directory_list",
])

function extractToolName(item: StreamItem): string | undefined {
  const { data } = item
  const name =
    data.toolName ?? data.tool_name ?? data.tool ?? data.name ?? data.function
  if (typeof name === "string") {
    return name.trim()
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Item types that are eligible for exploring-group compaction. */
const COMPACTABLE_TYPES: ReadonlySet<StreamItemType> = new Set([
  "command_execution",
  "tool_call",
  "tool_result",
])

/**
 * Returns `true` when a Codex `command_execution` item runs a read/list/search
 * command and is safe to group into an exploring cell.
 */
export function isExploringCommandExecution(item: StreamItem): boolean {
  if (item.type !== "command_execution") {
    return false
  }
  const command = extractCommand(item)
  if (!command) {
    return false
  }
  return isExploringCommand(command)
}

/**
 * Returns `true` when a Claude `tool_call` or `tool_result` references an
 * exploring-class tool (Read, Grep, Glob, LS, etc.).
 */
export function isExploringToolCall(item: StreamItem): boolean {
  if (item.type !== "tool_call" && item.type !== "tool_result") {
    return false
  }
  const toolName = extractToolName(item)
  if (!toolName) {
    return false
  }
  return EXPLORING_TOOL_NAMES.has(toolName)
}

/**
 * Returns `true` when an item is eligible for exploring-group compaction
 * regardless of protocol.
 */
export function isExploringItem(item: StreamItem): boolean {
  return isExploringCommandExecution(item) || isExploringToolCall(item)
}

/**
 * Returns `true` when an item type is potentially compactable (used as a
 * fast-path check before deeper classification).
 */
export function isCompactableType(type: StreamItemType): boolean {
  return COMPACTABLE_TYPES.has(type)
}
