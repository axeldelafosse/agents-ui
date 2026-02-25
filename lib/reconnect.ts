export const DEFAULT_RECONNECT_BASE_DELAY_MS = 1000

export function reconnectDelayMs(
  attempt: number,
  maxDelayMs: number,
  baseDelayMs: number = DEFAULT_RECONNECT_BASE_DELAY_MS
): number {
  if (attempt <= 0) {
    return Math.min(baseDelayMs, maxDelayMs)
  }
  return Math.min(baseDelayMs * 2 ** attempt, maxDelayMs)
}

export function canScheduleReconnect(
  attempt: number,
  maxAttempts: number
): boolean {
  return attempt < maxAttempts
}
