import { describe, expect, test } from "bun:test"

import {
  adaptClaudeStreamMessage,
  createClaudeStreamAdapterState,
} from "@/lib/claude-stream-adapter"
import type { StreamItemAction } from "@/lib/stream-items"

function expectCreate(
  action: StreamItemAction | undefined
): Extract<StreamItemAction, { type: "create" }> {
  if (!action || action.type !== "create") {
    throw new Error("Expected create action")
  }
  return action
}

describe("Claude approval request handling", () => {
  test("creates approval_request for control_request can_use_tool", () => {
    const state = createClaudeStreamAdapterState()
    const result = adaptClaudeStreamMessage(
      {
        type: "control_request",
        session_id: "sess-approval",
        request_id: "req-1",
        request: {
          subtype: "can_use_tool",
          tool_name: "bash",
        },
      },
      state,
      { now: 100 }
    )

    expect(result.actions).toHaveLength(1)
    const created = expectCreate(result.actions[0])
    expect(created.item.type).toBe("approval_request")
    expect(created.item.data).toMatchObject({
      toolName: "bash",
      requestId: "req-1",
      requestType: "can_use_tool",
    })
  })

  test("ignores control_request init", () => {
    const state = createClaudeStreamAdapterState()
    const result = adaptClaudeStreamMessage(
      {
        type: "control_request",
        session_id: "sess-init",
        request_id: "req-init",
        request: {
          subtype: "init",
        },
      },
      state,
      { now: 200 }
    )

    expect(result.actions).toHaveLength(0)
  })

  test("ignores control_request initialize", () => {
    const state = createClaudeStreamAdapterState()
    const result = adaptClaudeStreamMessage(
      {
        type: "control_request",
        session_id: "sess-initialize",
        request_id: "req-initialize",
        request: {
          subtype: "initialize",
        },
      },
      state,
      { now: 300 }
    )

    expect(result.actions).toHaveLength(0)
  })

  test("creates raw_item for unknown control_request subtypes", () => {
    const state = createClaudeStreamAdapterState()
    const result = adaptClaudeStreamMessage(
      {
        type: "control_request",
        session_id: "sess-unknown",
        request_id: "req-2",
        request: {
          subtype: "unknown_subtype",
        },
      },
      state,
      { now: 400 }
    )

    expect(result.actions).toHaveLength(1)
    const created = expectCreate(result.actions[0])
    expect(created.item.type).toBe("raw_item")
    expect(created.item.status).toBe("complete")
  })
})
