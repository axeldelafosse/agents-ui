import { describe, expect, test } from "bun:test"

import {
  applyCodexTurnRouting,
  ensureCodexThreadRoute,
  pendingThreadStartAgent,
  resolveCodexNotificationAgent,
} from "@axel-delafosse/protocol/codex-routing"

describe("codex-routing lifecycle parity", () => {
  describe("applyCodexTurnRouting with turn/completed interrupted", () => {
    test("removes turn mapping on completion with interrupted status", () => {
      const turns = new Map([["turn-1", "agent-1"]])
      applyCodexTurnRouting(
        turns,
        "turn/completed",
        { turnId: "turn-1", status: "interrupted" },
        "agent-1"
      )
      expect(turns.has("turn-1")).toBe(false)
    })

    test("removes turn mapping on completion with failed status", () => {
      const turns = new Map([["turn-1", "agent-1"]])
      applyCodexTurnRouting(
        turns,
        "turn/completed",
        { turnId: "turn-1", status: "failed" },
        "agent-1"
      )
      expect(turns.has("turn-1")).toBe(false)
    })

    test("removes turn mapping on completion regardless of status", () => {
      const turns = new Map([["turn-1", "agent-1"]])
      applyCodexTurnRouting(
        turns,
        "turn/completed",
        { turnId: "turn-1", status: "completed" },
        "agent-1"
      )
      expect(turns.has("turn-1")).toBe(false)
    })
  })

  describe("turn routing full lifecycle", () => {
    test("maps turn to agent on turn/started", () => {
      const turns = new Map<string, string>()
      applyCodexTurnRouting(
        turns,
        "turn/started",
        { turnId: "turn-2" },
        "agent-2"
      )
      expect(turns.get("turn-2")).toBe("agent-2")
    })

    test("allows overwriting turn mapping with new agent on re-start", () => {
      const turns = new Map<string, string>([["turn-1", "agent-old"]])
      applyCodexTurnRouting(
        turns,
        "turn/started",
        { turnId: "turn-1" },
        "agent-new"
      )
      expect(turns.get("turn-1")).toBe("agent-new")
    })

    test("tracks multiple concurrent turns", () => {
      const turns = new Map<string, string>()
      applyCodexTurnRouting(
        turns,
        "turn/started",
        { turnId: "turn-a" },
        "agent-a"
      )
      applyCodexTurnRouting(
        turns,
        "turn/started",
        { turnId: "turn-b" },
        "agent-b"
      )
      expect(turns.size).toBe(2)
      expect(turns.get("turn-a")).toBe("agent-a")
      expect(turns.get("turn-b")).toBe("agent-b")
    })

    test("completes one turn while keeping another active", () => {
      const turns = new Map<string, string>()
      applyCodexTurnRouting(
        turns,
        "turn/started",
        { turnId: "turn-a" },
        "agent-a"
      )
      applyCodexTurnRouting(
        turns,
        "turn/started",
        { turnId: "turn-b" },
        "agent-b"
      )
      applyCodexTurnRouting(
        turns,
        "turn/completed",
        { turnId: "turn-a" },
        "agent-a"
      )
      expect(turns.has("turn-a")).toBe(false)
      expect(turns.get("turn-b")).toBe("agent-b")
    })

    test("does nothing for turn/completed when turnId not in map", () => {
      const turns = new Map<string, string>([["turn-1", "agent-1"]])
      applyCodexTurnRouting(
        turns,
        "turn/completed",
        { turnId: "turn-unknown" },
        "agent-x"
      )
      expect(turns.size).toBe(1)
      expect(turns.get("turn-1")).toBe("agent-1")
    })
  })

  describe("thread route lifecycle", () => {
    test("creates thread route on first encounter", () => {
      const threads = new Map<string, string>()
      const agents = new Set<string>()
      const result = ensureCodexThreadRoute(
        threads,
        agents,
        "thread-new",
        () => "agent-fresh"
      )
      expect(result.created).toBe(true)
      expect(result.agentId).toBe("agent-fresh")
      expect(threads.get("thread-new")).toBe("agent-fresh")
      expect(agents.has("agent-fresh")).toBe(true)
    })

    test("reuses existing thread route", () => {
      const threads = new Map<string, string>([["thread-1", "agent-1"]])
      const agents = new Set<string>(["agent-1"])
      let called = false
      const result = ensureCodexThreadRoute(threads, agents, "thread-1", () => {
        called = true
        return "agent-new"
      })
      expect(result.created).toBe(false)
      expect(result.agentId).toBe("agent-1")
      expect(called).toBe(false)
    })

    test("manages multiple thread routes independently", () => {
      const threads = new Map<string, string>()
      const agents = new Set<string>()
      let counter = 0
      const factory = () => {
        counter += 1
        return `agent-${counter}`
      }
      ensureCodexThreadRoute(threads, agents, "thread-a", factory)
      ensureCodexThreadRoute(threads, agents, "thread-b", factory)
      expect(threads.size).toBe(2)
      expect(threads.get("thread-a")).toBe("agent-1")
      expect(threads.get("thread-b")).toBe("agent-2")
      expect(agents.size).toBe(2)
    })
  })

  describe("resolveCodexNotificationAgent extended scenarios", () => {
    test("routes by threadId when both threadId and turnId match different agents", () => {
      const threads = new Map<string, string>([["thread-1", "agent-thread"]])
      const turns = new Map<string, string>([["turn-1", "agent-turn"]])
      const route = resolveCodexNotificationAgent(threads, turns, {
        threadId: "thread-1",
        turnId: "turn-1",
      })
      // threadId takes priority per existing implementation
      expect(route.agentId).toBe("agent-thread")
    })

    test("falls back to turnId when threadId is not mapped", () => {
      const threads = new Map<string, string>()
      const turns = new Map<string, string>([["turn-1", "agent-turn"]])
      const route = resolveCodexNotificationAgent(threads, turns, {
        threadId: "thread-unknown",
        turnId: "turn-1",
      })
      expect(route.agentId).toBe("agent-turn")
    })

    test("returns empty route when neither threadId nor turnId match", () => {
      const threads = new Map<string, string>([["thread-1", "agent-1"]])
      const turns = new Map<string, string>([["turn-1", "agent-1"]])
      const route = resolveCodexNotificationAgent(threads, turns, {
        threadId: "thread-unknown",
        turnId: "turn-unknown",
      })
      expect(route).toEqual({})
    })

    test("routes via conversationId fallback", () => {
      const threads = new Map<string, string>([["thread-conv", "agent-conv"]])
      const turns = new Map<string, string>()
      const route = resolveCodexNotificationAgent(threads, turns, {
        conversationId: "thread-conv",
      })
      expect(route.agentId).toBe("agent-conv")
    })

    test("routes via conversation_id snake_case fallback", () => {
      const threads = new Map<string, string>([["thread-snake", "agent-snake"]])
      const turns = new Map<string, string>()
      const route = resolveCodexNotificationAgent(threads, turns, {
        conversation_id: "thread-snake",
      })
      expect(route.agentId).toBe("agent-snake")
    })

    test("routes via conversation.id object fallback", () => {
      const threads = new Map<string, string>([["thread-obj", "agent-obj"]])
      const turns = new Map<string, string>()
      const route = resolveCodexNotificationAgent(threads, turns, {
        conversation: { id: "thread-obj" },
      })
      expect(route.agentId).toBe("agent-obj")
    })
  })

  describe("pendingThreadStartAgent lifecycle", () => {
    test("returns thread_start owner agent over initialize owner", () => {
      const owner = pendingThreadStartAgent([
        { agentId: "agent-init", type: "initialize" },
        { agentId: "agent-thread", type: "thread_start" },
      ])
      expect(owner).toBe("agent-thread")
    })

    test("returns first thread_start when multiple exist", () => {
      const owner = pendingThreadStartAgent([
        { agentId: "agent-first", type: "thread_start" },
        { agentId: "agent-second", type: "thread_start" },
      ])
      expect(owner).toBe("agent-first")
    })

    test("falls back to initialize when no thread_start exists", () => {
      const owner = pendingThreadStartAgent([
        { agentId: "agent-init", type: "initialize" },
        { agentId: "agent-sub", type: "subscribe" },
      ])
      expect(owner).toBe("agent-init")
    })

    test("returns undefined when no thread_start or initialize exists", () => {
      const owner = pendingThreadStartAgent([
        { agentId: "agent-sub", type: "subscribe" },
        { agentId: "agent-read", type: "thread_read" },
      ])
      expect(owner).toBeUndefined()
    })

    test("returns undefined when all entries lack agentId", () => {
      const owner = pendingThreadStartAgent([
        { type: "thread_start" },
        { type: "initialize" },
      ])
      expect(owner).toBeUndefined()
    })

    test("returns undefined for empty iterable", () => {
      const owner = pendingThreadStartAgent([])
      expect(owner).toBeUndefined()
    })
  })
})
