import { describe, expect, test } from "bun:test"

import { canScheduleReconnect, reconnectDelayMs } from "@/lib/reconnect"

class FakeWebSocket {
  onerror: (() => void) | null = null
  onopen: (() => void) | null = null

  constructor(shouldOpen: boolean) {
    queueMicrotask(() => {
      if (shouldOpen) {
        this.onopen?.()
      } else {
        this.onerror?.()
      }
    })
  }

  terminate(): void {
    // noop in fake transport
  }
}

class FakeWebSocketServer {
  private failuresRemaining: number

  constructor(failuresBeforeOpen: number) {
    this.failuresRemaining = failuresBeforeOpen
  }

  createClient(): FakeWebSocket {
    if (this.failuresRemaining <= 0) {
      return new FakeWebSocket(true)
    }
    this.failuresRemaining -= 1
    return new FakeWebSocket(false)
  }
}

function attemptConnect(
  server: FakeWebSocketServer,
  timeoutMs: number
): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = server.createClient()
    const settle = (connected: boolean) => {
      clearTimeout(timer)
      ws.onopen = null
      ws.onerror = null
      ws.terminate()
      resolve(connected)
    }

    const timer = setTimeout(() => settle(false), timeoutMs)
    ws.onopen = () => settle(true)
    ws.onerror = () => settle(false)
  })
}

describe("reconnect policy", () => {
  test("computes exponential delay with cap", () => {
    expect(reconnectDelayMs(0, 30_000)).toBe(1000)
    expect(reconnectDelayMs(1, 30_000)).toBe(2000)
    expect(reconnectDelayMs(4, 30_000)).toBe(16_000)
    expect(reconnectDelayMs(10, 30_000)).toBe(30_000)
  })

  test("enforces max reconnect attempts", () => {
    expect(canScheduleReconnect(0, 3)).toBe(true)
    expect(canScheduleReconnect(2, 3)).toBe(true)
    expect(canScheduleReconnect(3, 3)).toBe(false)
  })
})

describe("reconnect integration", () => {
  test("connects after retries when server becomes reachable", async () => {
    const server = new FakeWebSocketServer(2)
    const baseDelayMs = 5
    const maxDelayMs = 20

    let connected = false
    let attempts = 0

    for (let attempt = 0; attempt < 6; attempt++) {
      attempts += 1
      connected = await attemptConnect(server, 25)
      if (connected) {
        break
      }
      await Bun.sleep(reconnectDelayMs(attempt, maxDelayMs, baseDelayMs))
    }

    expect(connected).toBe(true)
    expect(attempts).toBe(3)
  })
})
