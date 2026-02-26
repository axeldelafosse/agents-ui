import { describe, expect, test } from "bun:test"
import {
  applyCodexTurnRouting,
  ensureCodexThreadRoute,
  resolveCodexNotificationAgent,
} from "@/lib/codex-routing"
import type { CodexRpcResult } from "@/lib/codex-rpc"
import {
  codexLoadedThreadIdsFromResult,
  codexUnsubscribeStatusFromResult,
} from "@/lib/codex-rpc"
import {
  adaptCodexMessageToStreamItems,
  createCodexStreamAdapterState,
} from "@/lib/codex-stream-adapter"
import type { StreamItemAction } from "@/lib/stream-items"

function expectCreate(
  action: StreamItemAction | undefined
): Extract<StreamItemAction, { type: "create" }> {
  if (!action || action.type !== "create") {
    throw new Error("Expected create action")
  }
  return action
}

describe("codex lifecycle parity", () => {
  describe("1. thread unsubscribe pending context", () => {
    test("pending context with thread_unsubscribe type is storable and retrievable", () => {
      const pending = new Map<
        number,
        { agentId: string; threadId: string; type: string }
      >()
      const rpcId = 42
      pending.set(rpcId, {
        agentId: "agent-1",
        threadId: "thread-abc",
        type: "thread_unsubscribe",
      })

      const context = pending.get(rpcId)
      expect(context).toBeDefined()
      expect(context?.agentId).toBe("agent-1")
      expect(context?.threadId).toBe("thread-abc")
      expect(context?.type).toBe("thread_unsubscribe")
    })

    test("pending context is keyed by rpcId so multiple requests coexist", () => {
      const pending = new Map<
        number,
        { agentId: string; threadId: string; type: string }
      >()
      pending.set(1, {
        agentId: "agent-1",
        threadId: "thread-a",
        type: "thread_unsubscribe",
      })
      pending.set(2, {
        agentId: "agent-2",
        threadId: "thread-b",
        type: "thread_unsubscribe",
      })
      pending.set(3, {
        agentId: "agent-1",
        threadId: "thread-a",
        type: "thread_start",
      })

      expect(pending.size).toBe(3)
      expect(pending.get(1)?.type).toBe("thread_unsubscribe")
      expect(pending.get(2)?.type).toBe("thread_unsubscribe")
      expect(pending.get(3)?.type).toBe("thread_start")
    })

    test("pending context can be deleted after response arrives", () => {
      const pending = new Map<
        number,
        { agentId: string; threadId: string; type: string }
      >()
      const rpcId = 99
      pending.set(rpcId, {
        agentId: "agent-1",
        threadId: "thread-xyz",
        type: "thread_unsubscribe",
      })

      expect(pending.has(rpcId)).toBe(true)
      pending.delete(rpcId)
      expect(pending.has(rpcId)).toBe(false)
    })

    test("resolveCodexNotificationAgent returns empty when thread route removed after unsubscribe", () => {
      const threads = new Map<string, string>([["thread-1", "agent-1"]])
      const turns = new Map<string, string>()

      const routeBefore = resolveCodexNotificationAgent(threads, turns, {
        threadId: "thread-1",
      })
      expect(routeBefore.agentId).toBe("agent-1")

      threads.delete("thread-1")

      const routeAfter = resolveCodexNotificationAgent(threads, turns, {
        threadId: "thread-1",
      })
      expect(routeAfter).toEqual({})
    })
  })

  describe("2. turn interrupt yields turn/completed with status interrupted", () => {
    test("turn/completed with interrupted status removes turn mapping", () => {
      const turns = new Map<string, string>([["turn-int-1", "agent-int"]])
      applyCodexTurnRouting(
        turns,
        "turn/completed",
        { turnId: "turn-int-1", status: "interrupted" },
        "agent-int"
      )
      expect(turns.has("turn-int-1")).toBe(false)
    })

    test("stream adapter produces no error item for interrupted status", () => {
      const state = createCodexStreamAdapterState()

      const startedActions = adaptCodexMessageToStreamItems(state, {
        method: "turn/started",
        params: { threadId: "thread-int", turnId: "turn-int" },
      })
      expect(startedActions).toEqual([])

      const completedActions = adaptCodexMessageToStreamItems(state, {
        method: "turn/completed",
        params: {
          threadId: "thread-int",
          turnId: "turn-int",
          status: "interrupted",
        },
      })
      expect(completedActions).toEqual([])
    })

    test("stream adapter produces error item for failed status", () => {
      const state = createCodexStreamAdapterState()

      const failedActions = adaptCodexMessageToStreamItems(state, {
        method: "turn/completed",
        params: {
          threadId: "thread-fail",
          turnId: "turn-fail",
          status: "failed",
        },
      })
      expect(failedActions).toHaveLength(1)
      const created = expectCreate(failedActions[0])
      expect(created.item.type).toBe("error")
      expect(created.item.status).toBe("error")
    })

    test("full interrupt lifecycle: start turn, stream content, then interrupt", () => {
      const turns = new Map<string, string>()
      const state = createCodexStreamAdapterState()

      applyCodexTurnRouting(
        turns,
        "turn/started",
        { turnId: "turn-full-int" },
        "agent-full"
      )
      expect(turns.get("turn-full-int")).toBe("agent-full")

      const messageDelta = adaptCodexMessageToStreamItems(state, {
        method: "item/agentMessage/delta",
        params: {
          threadId: "thread-full-int",
          turnId: "turn-full-int",
          delta: "Starting analysis...",
        },
      })
      expect(messageDelta).toHaveLength(2)

      const interruptedActions = adaptCodexMessageToStreamItems(state, {
        method: "turn/completed",
        params: {
          threadId: "thread-full-int",
          turnId: "turn-full-int",
          status: "interrupted",
        },
      })
      expect(interruptedActions).toEqual([])

      applyCodexTurnRouting(
        turns,
        "turn/completed",
        { turnId: "turn-full-int", status: "interrupted" },
        "agent-full"
      )
      expect(turns.has("turn-full-int")).toBe(false)
    })
  })

  describe("3. turn steer uses existing turn context", () => {
    test("steer reuses the threadId and turnId from the active turn", () => {
      const turns = new Map<string, string>()
      const threads = new Map<string, string>()
      const agents = new Set<string>()

      ensureCodexThreadRoute(threads, agents, "thread-steer", () => "agent-s")
      applyCodexTurnRouting(
        turns,
        "turn/started",
        { turnId: "turn-steer-1" },
        "agent-s"
      )

      expect(turns.get("turn-steer-1")).toBe("agent-s")
      expect(threads.get("thread-steer")).toBe("agent-s")

      const steerParams = {
        threadId: "thread-steer",
        turnId: "turn-steer-1",
        message: "Actually, try a different approach",
      }

      const route = resolveCodexNotificationAgent(threads, turns, steerParams)
      expect(route.agentId).toBe("agent-s")
    })

    test("steer does not add a second turn entry for the same turn", () => {
      const turns = new Map<string, string>()

      applyCodexTurnRouting(
        turns,
        "turn/started",
        { turnId: "turn-steer-same" },
        "agent-s"
      )
      expect(turns.size).toBe(1)

      const steerNotification = adaptCodexMessageToStreamItems(
        createCodexStreamAdapterState(),
        {
          method: "item/agentMessage/delta",
          params: {
            threadId: "thread-steer-same",
            turnId: "turn-steer-same",
            delta: "Continuing after steer...",
          },
        }
      )
      expect(steerNotification.length).toBeGreaterThan(0)
      expect(turns.size).toBe(1)
      expect(turns.get("turn-steer-same")).toBe("agent-s")
    })

    test("turn routing does not create duplicate entries when steer reuses turnId", () => {
      const turns = new Map<string, string>()

      applyCodexTurnRouting(
        turns,
        "turn/started",
        { turnId: "turn-reuse" },
        "agent-original"
      )

      applyCodexTurnRouting(
        turns,
        "turn/started",
        { turnId: "turn-reuse" },
        "agent-steered"
      )

      expect(turns.size).toBe(1)
      expect(turns.get("turn-reuse")).toBe("agent-steered")
    })
  })

  describe("4. unsupported server request gets -32601 rejection", () => {
    test("unknown method with id falls through to raw_item in stream adapter", () => {
      const state = createCodexStreamAdapterState()
      const actions = adaptCodexMessageToStreamItems(state, {
        id: 999,
        method: "tools/unknownServerMethod",
        params: {
          threadId: "thread-reject",
          turnId: "turn-reject",
          data: { key: "value" },
        },
      })

      expect(actions).toHaveLength(1)
      const created = expectCreate(actions[0])
      expect(created.item.type).toBe("raw_item")
      expect(created.item.status).toBe("complete")
      expect(created.item.data.method).toBe("tools/unknownServerMethod")
      expect(created.item.data.requestId).toBe(999)
    })

    test("rejection payload for unknown method uses JSON-RPC -32601 structure", () => {
      const unknownRequestId = 55
      const rejection = {
        jsonrpc: "2.0" as const,
        id: unknownRequestId,
        error: {
          code: -32_601,
          message: "Method not found",
        },
      }

      expect(rejection.error.code).toBe(-32_601)
      expect(rejection.id).toBe(unknownRequestId)
      expect(rejection.error.message).toBe("Method not found")
    })

    test("known approval method with id is not treated as unknown", () => {
      const state = createCodexStreamAdapterState()
      const actions = adaptCodexMessageToStreamItems(state, {
        id: 200,
        method: "item/commandExecution/requestApproval",
        params: {
          threadId: "thread-known",
          turnId: "turn-known",
          command: "rm -rf /tmp",
        },
      })

      expect(actions).toHaveLength(1)
      const created = expectCreate(actions[0])
      expect(created.item.type).toBe("approval_request")
      expect(created.item.data.requestId).toBe(200)
    })

    test("server request with no id (notification) does not need rejection", () => {
      const state = createCodexStreamAdapterState()
      const actions = adaptCodexMessageToStreamItems(state, {
        method: "some/unknown/notification",
        params: {
          threadId: "thread-notify",
          turnId: "turn-notify",
        },
      })

      expect(actions).toHaveLength(1)
      const created = expectCreate(actions[0])
      expect(created.item.type).toBe("raw_item")
      expect(created.item.data.requestId).toBeUndefined()
    })
  })

  describe("5. reconnect scenario - thread discovery after reconnect", () => {
    test("codexLoadedThreadIdsFromResult extracts string thread ids from data array", () => {
      const result = {
        data: ["thread-aaa", "thread-bbb", "thread-ccc"],
      }
      const threadIds = codexLoadedThreadIdsFromResult(result)
      expect(threadIds).toEqual(["thread-aaa", "thread-bbb", "thread-ccc"])
    })

    test("codexLoadedThreadIdsFromResult returns empty for missing data", () => {
      expect(codexLoadedThreadIdsFromResult(undefined)).toEqual([])
      expect(codexLoadedThreadIdsFromResult({})).toEqual([])
      expect(codexLoadedThreadIdsFromResult({ data: null })).toEqual([])
    })

    test("codexLoadedThreadIdsFromResult filters non-string entries", () => {
      const result = {
        data: ["thread-1", 42, null, "thread-2", undefined, "thread-3"],
      }
      const threadIds = codexLoadedThreadIdsFromResult(
        result as unknown as Record<string, unknown>
      )
      expect(threadIds).toEqual(["thread-1", "thread-2", "thread-3"])
    })

    test("discovered threads after reconnect can be routed to existing agents", () => {
      const threads = new Map<string, string>([
        ["thread-existing", "agent-existing"],
      ])
      const agents = new Set<string>(["agent-existing"])

      const loadedResult = {
        data: ["thread-existing", "thread-new-1", "thread-new-2"],
      }
      const threadIds = codexLoadedThreadIdsFromResult(loadedResult)

      let agentCounter = 0
      for (const threadId of threadIds) {
        ensureCodexThreadRoute(threads, agents, threadId, () => {
          agentCounter += 1
          return `agent-reconnect-${agentCounter}`
        })
      }

      expect(threads.get("thread-existing")).toBe("agent-existing")
      expect(threads.get("thread-new-1")).toBe("agent-reconnect-1")
      expect(threads.get("thread-new-2")).toBe("agent-reconnect-2")
      expect(agentCounter).toBe(2)
    })

    test("reconnect with empty loaded list does not create new routes", () => {
      const threads = new Map<string, string>()
      const agents = new Set<string>()

      const loadedResult = { data: [] }
      const threadIds = codexLoadedThreadIdsFromResult(loadedResult)
      expect(threadIds).toEqual([])

      for (const threadId of threadIds) {
        ensureCodexThreadRoute(
          threads,
          agents,
          threadId,
          () => "should-not-be-called"
        )
      }
      expect(threads.size).toBe(0)
      expect(agents.size).toBe(0)
    })

    test("reconnect preserves pre-existing thread-to-agent mappings", () => {
      const threads = new Map<string, string>([
        ["thread-1", "agent-1"],
        ["thread-2", "agent-2"],
      ])
      const agents = new Set<string>(["agent-1", "agent-2"])

      const loadedResult = {
        data: ["thread-1", "thread-2", "thread-3"],
      }
      const threadIds = codexLoadedThreadIdsFromResult(loadedResult)

      for (const threadId of threadIds) {
        ensureCodexThreadRoute(threads, agents, threadId, () => "agent-3")
      }

      expect(threads.get("thread-1")).toBe("agent-1")
      expect(threads.get("thread-2")).toBe("agent-2")
      expect(threads.get("thread-3")).toBe("agent-3")
      expect(threads.size).toBe(3)
    })
  })

  describe("6. codexUnsubscribeStatusFromResult", () => {
    test("returns 'unsubscribed' for a successful unsubscribe result", () => {
      const result: CodexRpcResult = { status: "unsubscribed" }
      expect(codexUnsubscribeStatusFromResult(result)).toBe("unsubscribed")
    })

    test("returns 'notSubscribed' when thread was already not subscribed", () => {
      const result: CodexRpcResult = { status: "notSubscribed" }
      expect(codexUnsubscribeStatusFromResult(result)).toBe("notSubscribed")
    })

    test("returns 'notLoaded' when thread was not loaded on the server", () => {
      const result: CodexRpcResult = { status: "notLoaded" }
      expect(codexUnsubscribeStatusFromResult(result)).toBe("notLoaded")
    })

    test("returns undefined for an unrecognized status", () => {
      const result: CodexRpcResult = { status: "somethingElse" }
      expect(codexUnsubscribeStatusFromResult(result)).toBeUndefined()
    })

    test("returns undefined when result has no status", () => {
      const result: CodexRpcResult = {}
      expect(codexUnsubscribeStatusFromResult(result)).toBeUndefined()
    })

    test("returns undefined for undefined result", () => {
      expect(codexUnsubscribeStatusFromResult(undefined)).toBeUndefined()
    })

    test("trims whitespace from status values", () => {
      const result: CodexRpcResult = { status: "  unsubscribed  " }
      expect(codexUnsubscribeStatusFromResult(result)).toBe("unsubscribed")
    })

    test("returns undefined for empty string status", () => {
      const result: CodexRpcResult = { status: "" }
      expect(codexUnsubscribeStatusFromResult(result)).toBeUndefined()
    })

    test("returns undefined for whitespace-only status", () => {
      const result: CodexRpcResult = { status: "   " }
      expect(codexUnsubscribeStatusFromResult(result)).toBeUndefined()
    })
  })

  describe("7. thread/unsubscribe response handling", () => {
    test("'unsubscribed' status should clear thread mappings", () => {
      const threads = new Map<string, string>([
        ["thread-1", "agent-1"],
        ["thread-2", "agent-2"],
      ])
      const agents = new Set(["agent-1", "agent-2"])
      const globalThreadAgentIds = new Map<string, string>([
        ["thread-1", "agent-1"],
        ["thread-2", "agent-2"],
      ])

      const threadId = "thread-1"
      const agentId = "agent-1"

      threads.delete(threadId)
      if (globalThreadAgentIds.get(threadId) === agentId) {
        globalThreadAgentIds.delete(threadId)
      }
      const agentHasOtherThreads = [...threads.values()].includes(agentId)
      if (!agentHasOtherThreads) {
        agents.delete(agentId)
      }

      expect(threads.has("thread-1")).toBe(false)
      expect(threads.get("thread-2")).toBe("agent-2")
      expect(globalThreadAgentIds.has("thread-1")).toBe(false)
      expect(agents.has("agent-1")).toBe(false)
      expect(agents.has("agent-2")).toBe(true)
    })

    test("'notSubscribed' status should still clean up local state", () => {
      const threads = new Map<string, string>([["thread-1", "agent-1"]])
      const globalThreadAgentIds = new Map<string, string>([
        ["thread-1", "agent-1"],
      ])
      const agents = new Set(["agent-1"])

      const threadId = "thread-1"
      const agentId = "agent-1"

      threads.delete(threadId)
      if (globalThreadAgentIds.get(threadId) === agentId) {
        globalThreadAgentIds.delete(threadId)
      }
      const agentHasOtherThreads = [...threads.values()].includes(agentId)
      if (!agentHasOtherThreads) {
        agents.delete(agentId)
      }

      expect(threads.size).toBe(0)
      expect(globalThreadAgentIds.size).toBe(0)
      expect(agents.size).toBe(0)
    })

    test("'notLoaded' status should clean up local state", () => {
      const threads = new Map<string, string>([
        ["thread-1", "agent-1"],
        ["thread-3", "agent-1"],
      ])
      const globalThreadAgentIds = new Map<string, string>([
        ["thread-1", "agent-1"],
        ["thread-3", "agent-1"],
      ])
      const agents = new Set(["agent-1"])
      const turnThreads = new Map<string, string>([["turn-1", "thread-1"]])
      const turns = new Map<string, string>([["turn-1", "agent-1"]])

      const threadId = "thread-1"
      const agentId = "agent-1"

      threads.delete(threadId)
      if (globalThreadAgentIds.get(threadId) === agentId) {
        globalThreadAgentIds.delete(threadId)
      }

      for (const [turnId, turnThreadId] of turnThreads.entries()) {
        if (turnThreadId === threadId) {
          turnThreads.delete(turnId)
          turns.delete(turnId)
        }
      }

      const agentHasOtherThreads = [...threads.values()].includes(agentId)
      if (!agentHasOtherThreads) {
        agents.delete(agentId)
      }

      expect(threads.has("thread-1")).toBe(false)
      expect(threads.get("thread-3")).toBe("agent-1")
      expect(globalThreadAgentIds.has("thread-1")).toBe(false)
      expect(globalThreadAgentIds.get("thread-3")).toBe("agent-1")
      expect(turnThreads.size).toBe(0)
      expect(turns.size).toBe(0)
      expect(agents.has("agent-1")).toBe(true)
    })

    test("unsubscribe cleans up turn mappings for the thread", () => {
      const turnThreads = new Map<string, string>([
        ["turn-1", "thread-1"],
        ["turn-2", "thread-2"],
        ["turn-3", "thread-1"],
      ])
      const turns = new Map<string, string>([
        ["turn-1", "agent-1"],
        ["turn-2", "agent-2"],
        ["turn-3", "agent-1"],
      ])

      const threadId = "thread-1"
      for (const [turnId, turnThreadId] of turnThreads.entries()) {
        if (turnThreadId === threadId) {
          turnThreads.delete(turnId)
          turns.delete(turnId)
        }
      }

      expect(turnThreads.size).toBe(1)
      expect(turnThreads.get("turn-2")).toBe("thread-2")
      expect(turns.size).toBe(1)
      expect(turns.get("turn-2")).toBe("agent-2")
    })

    test("unsubscribe preserves agent when it owns other threads", () => {
      const threads = new Map<string, string>([
        ["thread-1", "agent-1"],
        ["thread-2", "agent-1"],
      ])
      const agents = new Set(["agent-1"])

      threads.delete("thread-1")
      const agentHasOtherThreads = [...threads.values()].includes("agent-1")
      if (!agentHasOtherThreads) {
        agents.delete("agent-1")
      }

      expect(threads.size).toBe(1)
      expect(agents.has("agent-1")).toBe(true)
    })
  })
})
