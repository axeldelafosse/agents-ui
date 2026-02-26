import {
  MAX_RECONNECT_ATTEMPTS,
  MAX_RECONNECT_DELAY,
} from "@/app/features/agents/constants"
import type { ClaudeConn, CodexHub } from "@/app/features/agents/types"
import { canScheduleReconnect, reconnectDelayMs } from "@/lib/reconnect"

// --- Claude: one WS per agent ---
export const claudeConns = new Map<string, ClaudeConn>()

// --- Codex: one shared WS per URL, many threads ---
export const codexHubs = new Map<string, CodexHub>() // url -> hub

// --- Reconnection state ---
export const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()

export function scheduleReconnect(
  key: string,
  attempt: number,
  fn: () => void
): boolean {
  if (!canScheduleReconnect(attempt, MAX_RECONNECT_ATTEMPTS)) {
    return false
  }
  const delay = reconnectDelayMs(attempt, MAX_RECONNECT_DELAY)
  const timer = setTimeout(fn, delay)
  reconnectTimers.set(key, timer)
  return true
}
