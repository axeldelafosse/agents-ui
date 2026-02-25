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

// WebSocket proxy: Codex app-server doesn't support permessage-deflate
// (browser always negotiates it), so we route through a server-side proxy
// running on port 3001 (started by instrumentation.ts).
export function proxyWs(targetUrl: string): string {
  const host =
    typeof window !== "undefined" ? window.location.hostname : "localhost"
  return `ws://${host}:3001/?url=${encodeURIComponent(targetUrl)}`
}
