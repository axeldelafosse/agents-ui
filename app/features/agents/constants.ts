import type { CodexKnownMethod } from "@/lib/codex-rpc"

export const MAX_RECONNECT_ATTEMPTS = 10
export const MAX_RECONNECT_DELAY = 30_000
export const CODEX_PRETTY_MODE = true
export const CLAUDE_PRETTY_MODE = true
export const CODEX_SUBAGENT_HINT_LIMIT = 32
export const CODEX_SUBAGENT_HINT_TTL_MS = 15_000
export const CODEX_PENDING_TURN_EVENT_TTL_MS = 30_000
export const CODEX_PENDING_TURN_EVENT_MAX_PER_TURN = 32
export const CODEX_PENDING_TURN_EVENT_MAX_TOTAL = 256
export const CODEX_PENDING_OUTPUT_EVENT_MAX = 256
export const DEBUG_EVENT_LIMIT = 500
export const DEBUG_MODE = false

// auto-discovery port ranges
export const CODEX_PORTS = Array.from({ length: 10 }, (_, i) => 4500 + i)
export const CLAUDE_PORTS = Array.from({ length: 10 }, (_, i) => 8765 + i)
export const ALL_PROBE_PORTS = [...CODEX_PORTS, ...CLAUDE_PORTS]
export const DISCOVERY_INTERVAL_MS = 5000

export const CLAUDE_SESSION_LINE_REGEX =
  /session(?:_id|Id)?(?:["'=\s:]+)([a-z0-9._-]{8,})/i
export const CLAUDE_INIT_LINE_REGEX =
  /\[(?:init|system\/init)\]|\bsubtype["'=\s:]+init\b/i
export const CODEX_THREAD_LINE_REGEX = /\[thread:\s*([a-z0-9-]{8,})\]/i

export const CODEX_OUTPUT_NOTIFICATION_METHOD_LIST = [
  "item/agentMessage/delta",
  "codex/event/agent_message_delta",
  "codex/event/agent_message_content_delta",
  "codex/event/agent_message",
  "codex/event/raw_response_item",
  "codex/event/user_message",
  "item/completed",
  "codex/event/item_completed",
  "rawResponseItem/completed",
  "item/commandExecution/outputDelta",
  "codex/event/exec_command_output_delta",
  "codex/event/exec_command_begin",
  "codex/event/exec_command_end",
] as const satisfies readonly CodexKnownMethod[]
export const CODEX_OUTPUT_NOTIFICATION_METHODS = new Set<string>(
  CODEX_OUTPUT_NOTIFICATION_METHOD_LIST
)

export const CODEX_TASK_DONE_METHOD_LIST = [
  "codex/event/task_complete",
  "thread/archived",
] as const satisfies readonly CodexKnownMethod[]
export const CODEX_TASK_DONE_METHODS = new Set<string>(
  CODEX_TASK_DONE_METHOD_LIST
)

export const CODEX_STRUCTURED_NOTIFICATION_METHOD_LIST = [
  "item/reasoning/summaryTextDelta",
  "item/reasoning/summaryPartAdded",
  "item/reasoning/textDelta",
  "codex/event/agent_reasoning",
  "codex/event/agent_reasoning_delta",
  "codex/event/reasoning_content_delta",
  "codex/event/agent_reasoning_section_break",
  "item/started",
  "codex/event/item_started",
  "item/plan/delta",
  "turn/plan/updated",
  "codex/event/collab_waiting_begin",
  "item/commandExecution/requestApproval",
  "item/commandExecution/terminalInteraction",
  "codex/event/terminal_interaction",
  "item/fileChange/outputDelta",
  "item/fileChange/requestApproval",
  "item/mcpToolCall/progress",
  "item/tool/requestUserInput",
  "turn/diff/updated",
  "model/rerouted",
  "deprecationNotice",
  "configWarning",
  "thread/unarchived",
] as const satisfies readonly CodexKnownMethod[]
export const CODEX_STRUCTURED_NOTIFICATION_METHODS = new Set<string>(
  CODEX_STRUCTURED_NOTIFICATION_METHOD_LIST
)

export const CODEX_NOOP_NOTIFICATION_METHOD_LIST =
  [] as const satisfies readonly CodexKnownMethod[]
export const CODEX_NOOP_NOTIFICATION_METHODS = new Set<string>(
  CODEX_NOOP_NOTIFICATION_METHOD_LIST
)

export const CODEX_NON_BUFFERED_TURN_METHOD_LIST = [
  "account/rateLimits/updated",
  "thread/tokenUsage/updated",
  "codex/event/token_count",
  "codex/event/mcp_startup_update",
  "codex/event/mcp_startup_complete",
  "codex/event/shutdown_complete",
  "thread/archived",
  "turn/completed",
  "codex/event/task_complete",
] as const satisfies readonly CodexKnownMethod[]
export const CODEX_NON_BUFFERED_TURN_METHODS = new Set<string>(
  CODEX_NON_BUFFERED_TURN_METHOD_LIST
)
