import { describe, expect, test } from "bun:test"

import {
  adaptCodexMessageToStreamItems,
  createCodexStreamAdapterState,
} from "@axel-delafosse/protocol/codex-stream-adapter"
import type { StreamItemAction } from "@axel-delafosse/protocol/stream-items"

function expectCreate(
  action: StreamItemAction | undefined
): Extract<StreamItemAction, { type: "create" }> {
  if (!action || action.type !== "create") {
    throw new Error("Expected create action")
  }
  return action
}

describe("codex-stream-adapter notification parity", () => {
  describe("turn/diff/updated", () => {
    test("creates a turn_diff stream item with diff data", () => {
      const state = createCodexStreamAdapterState()
      const actions = adaptCodexMessageToStreamItems(state, {
        method: "turn/diff/updated",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          diff: "--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new",
        },
        agentId: "agent-1",
      })
      expect(actions.length).toBeGreaterThan(0)
      const created = expectCreate(actions[0])
      expect(created.item.type).toBe("turn_diff")
      expect(created.item.status).toBe("complete")
      expect(created.item.threadId).toBe("thread-1")
      expect(created.item.turnId).toBe("turn-1")
      expect(created.item.agentId).toBe("agent-1")
      expect(created.item.data).toHaveProperty("diff")
      expect(created.item.data).toHaveProperty("label", "Turn Diff")
    })

    test("includes threadId and turnId from params in raw item", () => {
      const state = createCodexStreamAdapterState()
      const actions = adaptCodexMessageToStreamItems(state, {
        method: "turn/diff/updated",
        params: {
          threadId: "thread-diff",
          turnId: "turn-diff",
          diff: "@@ -1 +1 @@\n-a\n+b",
        },
      })
      expect(actions).toHaveLength(1)
      const created = expectCreate(actions[0])
      expect(created.item.threadId).toBe("thread-diff")
      expect(created.item.turnId).toBe("turn-diff")
    })
  })

  describe("model/rerouted", () => {
    test("creates a raw_item stream item with reroute info", () => {
      const state = createCodexStreamAdapterState()
      const actions = adaptCodexMessageToStreamItems(state, {
        method: "model/rerouted",
        params: { model: "gpt-4o-mini" },
        agentId: "agent-1",
      })
      // model/rerouted is not in the recognized lifecycle method set, so it
      // falls through to the raw_item handler
      expect(actions.length).toBeGreaterThan(0)
      const created = expectCreate(actions[0])
      expect(created.item.agentId).toBe("agent-1")
      expect(created.item.data).toHaveProperty("model", "gpt-4o-mini")
      expect(created.item.data).toHaveProperty(
        "text",
        "Model rerouted to: gpt-4o-mini"
      )
    })

    test("does not produce stream items when method is empty", () => {
      const state = createCodexStreamAdapterState()
      const actions = adaptCodexMessageToStreamItems(state, {
        method: "",
        params: { model: "gpt-4o-mini" },
      })
      expect(actions).toEqual([])
    })
  })

  describe("deprecationNotice", () => {
    test("creates a raw_item stream item with deprecation info", () => {
      const state = createCodexStreamAdapterState()
      const actions = adaptCodexMessageToStreamItems(state, {
        method: "deprecationNotice",
        params: { message: "API v1 is deprecated" },
        agentId: "agent-1",
      })
      expect(actions.length).toBeGreaterThan(0)
      const created = expectCreate(actions[0])
      expect(created.item.status).toBe("complete")
      expect(created.item.data).toHaveProperty("level", "warning")
      expect(created.item.data).toHaveProperty("text", "API v1 is deprecated")
    })

    test("preserves agentId on the created item", () => {
      const state = createCodexStreamAdapterState()
      const actions = adaptCodexMessageToStreamItems(state, {
        method: "deprecationNotice",
        params: { message: "Old endpoint will be removed" },
        agentId: "agent-deprecation",
      })
      const created = expectCreate(actions[0])
      expect(created.item.agentId).toBe("agent-deprecation")
    })
  })

  describe("configWarning", () => {
    test("creates a raw_item stream item with config warning", () => {
      const state = createCodexStreamAdapterState()
      const actions = adaptCodexMessageToStreamItems(state, {
        method: "configWarning",
        params: { message: "Missing API key" },
        agentId: "agent-1",
      })
      expect(actions.length).toBeGreaterThan(0)
      const created = expectCreate(actions[0])
      expect(created.item.data).toHaveProperty("level", "warning")
      expect(created.item.data).toHaveProperty("text", "Missing API key")
    })

    test("creates distinct items for multiple config warnings", () => {
      const state = createCodexStreamAdapterState()
      const actions1 = adaptCodexMessageToStreamItems(state, {
        method: "configWarning",
        params: { message: "Warning 1" },
      })
      const actions2 = adaptCodexMessageToStreamItems(state, {
        method: "configWarning",
        params: { message: "Warning 2" },
      })
      const item1 = expectCreate(actions1[0])
      const item2 = expectCreate(actions2[0])
      expect(item1.item.id).not.toBe(item2.item.id)
    })
  })

  describe("thread/unarchived", () => {
    test("creates a raw_item stream item", () => {
      const state = createCodexStreamAdapterState()
      const actions = adaptCodexMessageToStreamItems(state, {
        method: "thread/unarchived",
        params: { threadId: "thread-1" },
        agentId: "agent-1",
      })
      expect(actions.length).toBeGreaterThan(0)
      const created = expectCreate(actions[0])
      expect(created.item.threadId).toBe("thread-1")
      expect(created.item.data).toHaveProperty("text", "Thread unarchived")
    })
  })

  describe("thread/archived", () => {
    test("creates a turn_complete stream item for thread/archived", () => {
      const state = createCodexStreamAdapterState()
      const actions = adaptCodexMessageToStreamItems(state, {
        method: "thread/archived",
        params: { threadId: "thread-archived" },
        agentId: "agent-archive",
      })
      expect(actions).toHaveLength(1)
      const created = expectCreate(actions[0])
      expect(created.item.type).toBe("turn_complete")
      expect(created.item.status).toBe("complete")
      expect(created.item.data.text).toBe("Thread archived")
    })
  })

  describe("error notification", () => {
    test("creates an error stream item for error method", () => {
      const state = createCodexStreamAdapterState()
      const actions = adaptCodexMessageToStreamItems(state, {
        method: "error",
        params: { text: "Something went wrong" },
        agentId: "agent-error",
      })
      expect(actions).toHaveLength(1)
      const created = expectCreate(actions[0])
      expect(created.item.type).toBe("error")
      expect(created.item.status).toBe("error")
    })
  })

  describe("turn/completed with failed status", () => {
    test("creates an error stream item when turn fails", () => {
      const state = createCodexStreamAdapterState()
      const actions = adaptCodexMessageToStreamItems(state, {
        method: "turn/completed",
        params: {
          threadId: "thread-fail",
          turnId: "turn-fail",
          status: "failed",
        },
        agentId: "agent-fail",
      })
      expect(actions).toHaveLength(1)
      const created = expectCreate(actions[0])
      expect(created.item.type).toBe("error")
      expect(created.item.status).toBe("error")
      expect(created.item.data.text).toBe("Turn failed")
    })

    test("produces no items for turn/completed with non-failed status", () => {
      const state = createCodexStreamAdapterState()
      const actions = adaptCodexMessageToStreamItems(state, {
        method: "turn/completed",
        params: {
          threadId: "thread-ok",
          turnId: "turn-ok",
          status: "completed",
        },
      })
      expect(actions).toEqual([])
    })
  })

  describe("turn/plan/updated", () => {
    test("creates a plan item with steps", () => {
      const state = createCodexStreamAdapterState()
      const actions = adaptCodexMessageToStreamItems(state, {
        method: "turn/plan/updated",
        params: {
          threadId: "thread-plan",
          turnId: "turn-plan",
          plan: [
            { step: "Read the file", status: "done" },
            { step: "Write tests", status: "in_progress" },
          ],
          explanation: "Current plan",
        },
        agentId: "agent-plan",
      })
      expect(actions).toHaveLength(1)
      const created = expectCreate(actions[0])
      expect(created.item.type).toBe("plan")
      expect(created.item.status).toBe("complete")
      expect(created.item.agentId).toBe("agent-plan")
      expect(created.item.data.text).toContain("Current plan")
      expect(created.item.data.text).toContain("Read the file")
      expect(created.item.data.text).toContain("Write tests")
    })
  })

  describe("codex/event/collab_waiting_begin", () => {
    test("creates a status item for collaborator wait", () => {
      const state = createCodexStreamAdapterState()
      const actions = adaptCodexMessageToStreamItems(state, {
        method: "codex/event/collab_waiting_begin",
        params: {
          threadId: "thread-collab",
          turnId: "turn-collab",
        },
        agentId: "agent-collab",
      })
      expect(actions).toHaveLength(1)
      const created = expectCreate(actions[0])
      expect(created.item.type).toBe("status")
      expect(created.item.status).toBe("complete")
      expect(created.item.data.text).toBe("Waiting for collaborator output")
    })
  })

  describe("codex/event/task_complete", () => {
    test("creates a turn_complete stream item", () => {
      const state = createCodexStreamAdapterState()
      const actions = adaptCodexMessageToStreamItems(state, {
        method: "codex/event/task_complete",
        params: { threadId: "thread-task" },
        agentId: "agent-task",
      })
      expect(actions).toHaveLength(1)
      const created = expectCreate(actions[0])
      expect(created.item.type).toBe("turn_complete")
      expect(created.item.status).toBe("complete")
      expect(created.item.data.text).toBe("Task complete")
    })
  })

  describe("silenced lifecycle events produce no stream items", () => {
    const silencedMethods = [
      "thread/name/updated",
      "thread/tokenUsage/updated",
      "account/rateLimits/updated",
      "codex/event/token_count",
    ]

    for (const method of silencedMethods) {
      test(`${method} returns empty actions`, () => {
        const state = createCodexStreamAdapterState()
        const actions = adaptCodexMessageToStreamItems(state, {
          method,
          params: { threadId: "thread-1", turnId: "turn-1" },
        })
        expect(actions).toEqual([])
      })
    }
  })

  describe("legacy mirror methods are silenced", () => {
    const legacyMethods = [
      "codex/event/item_started",
      "codex/event/item_completed",
      "rawResponseItem/completed",
      "codex/event/agent_message_delta",
      "codex/event/agent_message_content_delta",
      "codex/event/agent_message",
      "codex/event/agent_reasoning",
      "codex/event/agent_reasoning_delta",
      "codex/event/reasoning_content_delta",
      "codex/event/agent_reasoning_section_break",
    ]

    for (const method of legacyMethods) {
      test(`${method} returns empty actions`, () => {
        const state = createCodexStreamAdapterState()
        const actions = adaptCodexMessageToStreamItems(state, {
          method,
          params: { threadId: "thread-1", turnId: "turn-1" },
        })
        expect(actions).toEqual([])
      })
    }
  })

  describe("undefined method", () => {
    test("returns empty actions when method is undefined", () => {
      const state = createCodexStreamAdapterState()
      const actions = adaptCodexMessageToStreamItems(state, {
        params: { threadId: "thread-1" },
      })
      expect(actions).toEqual([])
    })
  })
})
