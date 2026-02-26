import { describe, expect, test } from "bun:test"

import {
  applyCodexTurnRouting,
  ensureCodexThreadRoute,
  pendingThreadStartAgent,
  resolveCodexNotificationAgent,
} from "@/lib/codex-routing"

describe("codex routing", () => {
  test("creates a new agent mapping for an unseen thread id", () => {
    const threads = new Map<string, string>()
    const agents = new Set<string>()
    const created = ensureCodexThreadRoute(
      threads,
      agents,
      "thread-new",
      () => "agent-new"
    )

    expect(created).toEqual({ agentId: "agent-new", created: true })
    expect(threads.get("thread-new")).toBe("agent-new")
    expect(agents.has("agent-new")).toBe(true)

    const existing = ensureCodexThreadRoute(
      threads,
      agents,
      "thread-new",
      () => "agent-other"
    )
    expect(existing).toEqual({ agentId: "agent-new", created: false })
    expect(agents.has("agent-other")).toBe(false)
  })

  test("routes by threadId first, then turnId", () => {
    const threads = new Map<string, string>([
      ["thread-a", "agent-a"],
      ["thread-b", "agent-b"],
    ])
    const turns = new Map<string, string>([["turn-1", "agent-a"]])

    const byThread = resolveCodexNotificationAgent(threads, turns, {
      threadId: "thread-b",
      turnId: "turn-1",
    })
    expect(byThread.agentId).toBe("agent-b")

    const byTurn = resolveCodexNotificationAgent(threads, turns, {
      turnId: "turn-1",
    })
    expect(byTurn.agentId).toBe("agent-a")
  })

  test("routes by conversationId variants", () => {
    const threads = new Map<string, string>([["thread-conv", "agent-conv"]])
    const turns = new Map<string, string>()

    const byConversationId = resolveCodexNotificationAgent(threads, turns, {
      conversationId: "thread-conv",
    })
    expect(byConversationId.agentId).toBe("agent-conv")

    const byConversationSnake = resolveCodexNotificationAgent(threads, turns, {
      conversation_id: "thread-conv",
    })
    expect(byConversationSnake.agentId).toBe("agent-conv")

    const byConversationObject = resolveCodexNotificationAgent(threads, turns, {
      conversation: { id: "thread-conv" },
    })
    expect(byConversationObject.agentId).toBe("agent-conv")
  })

  test("returns empty route when identifiers are unknown", () => {
    const threads = new Map<string, string>([["thread-a", "agent-a"]])
    const turns = new Map<string, string>()

    const route = resolveCodexNotificationAgent(threads, turns, {
      threadId: "thread-new",
    })

    expect(route).toEqual({})
  })

  test("returns empty result when no routable agents exist", () => {
    const route = resolveCodexNotificationAgent(
      new Map<string, string>(),
      new Map<string, string>(),
      { threadId: "t-1" }
    )

    expect(route).toEqual({})
  })

  test("returns empty when params omit thread and turn identifiers", () => {
    const route = resolveCodexNotificationAgent(
      new Map<string, string>([["thread-a", "agent-a"]]),
      new Map<string, string>([["turn-a", "agent-a"]]),
      {}
    )
    expect(route).toEqual({})
  })

  test("does not route by params.id when turnId is missing", () => {
    const turns = new Map<string, string>([["event-1", "agent-id"]])
    const route = resolveCodexNotificationAgent(
      new Map<string, string>(),
      turns,
      {
        id: "event-1",
      }
    )
    expect(route).toEqual({})
  })
})

describe("codex turn lifecycle", () => {
  test("finds pending thread_start owner when available", () => {
    const owner = pendingThreadStartAgent([
      { agentId: "agent-a", type: "initialize" },
      { agentId: "agent-b", type: "thread_start" },
    ])
    expect(owner).toBe("agent-b")
  })

  test("falls back to pending initialize owner", () => {
    const owner = pendingThreadStartAgent([
      { agentId: "agent-a", type: "initialize" },
      { agentId: "agent-b", type: "subscribe" },
    ])
    expect(owner).toBe("agent-a")
  })

  test("returns undefined when no thread_start is pending", () => {
    const owner = pendingThreadStartAgent([
      { agentId: "agent-a", type: "subscribe" },
      { agentId: "agent-b", type: "subscribe" },
    ])
    expect(owner).toBeUndefined()
  })

  test("ignores pending contexts without an owner agent id", () => {
    const owner = pendingThreadStartAgent([
      { type: "initialize" },
      { type: "thread_start" },
    ])
    expect(owner).toBeUndefined()
  })

  test("tracks turn start and completion", () => {
    const turns = new Map<string, string>()

    applyCodexTurnRouting(
      turns,
      "turn/started",
      { turnId: "turn-1" },
      "agent-1"
    )
    expect(turns.get("turn-1")).toBe("agent-1")

    applyCodexTurnRouting(
      turns,
      "turn/completed",
      { turnId: "turn-1" },
      "agent-1"
    )
    expect(turns.has("turn-1")).toBe(false)
  })

  test("ignores unrelated methods", () => {
    const turns = new Map<string, string>()
    applyCodexTurnRouting(
      turns,
      "item/completed",
      { turnId: "turn-1" },
      "agent-1"
    )
    expect(turns.size).toBe(0)
  })

  test("ignores turn lifecycle methods without turn id", () => {
    const turns = new Map<string, string>()
    applyCodexTurnRouting(turns, "turn/started", {}, "agent-1")
    applyCodexTurnRouting(turns, "turn/completed", {}, "agent-1")
    expect(turns.size).toBe(0)
  })
})
