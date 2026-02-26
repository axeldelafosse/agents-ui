import { describe, expect, test } from "bun:test"

import { applyStreamItemAction, type StreamItem } from "@/lib/stream-items"

function makeItem(id: string, overrides: Partial<StreamItem> = {}): StreamItem {
  const data = overrides.data ? { ...overrides.data } : {}
  return {
    id,
    type: "message",
    status: "streaming",
    timestamp: 1,
    data,
    ...overrides,
    data,
  }
}

describe("stream items approval lifecycle", () => {
  test("creates and completes an approval_request item", () => {
    const approvalItem = makeItem("approval-1", {
      type: "approval_request",
      status: "streaming",
      data: {
        requestId: "req-1",
        requestType: "can_use_tool",
        toolName: "bash",
      },
    })

    const created = applyStreamItemAction([], {
      type: "create",
      item: approvalItem,
    })

    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({
      id: "approval-1",
      type: "approval_request",
      status: "streaming",
    })

    const completed = applyStreamItemAction(created, {
      type: "complete",
      id: "approval-1",
      patch: { data: { resolved: true } },
    })

    expect(completed).toHaveLength(1)
    expect(completed[0]).toMatchObject({
      id: "approval-1",
      type: "approval_request",
      status: "complete",
      data: {
        requestId: "req-1",
        requestType: "can_use_tool",
        toolName: "bash",
        resolved: true,
      },
    })
  })

  test("upserts approval data without duplicating", () => {
    const approvalItem = makeItem("approval-2", {
      type: "approval_request",
      status: "streaming",
      data: {
        requestId: "req-2",
        requestType: "command_approval",
      },
    })

    const created = applyStreamItemAction([], {
      type: "create",
      item: approvalItem,
    })
    expect(created).toHaveLength(1)

    const updatedItem = makeItem("approval-2", {
      type: "approval_request",
      status: "complete",
      data: {
        command: "bun test",
        resolved: true,
      },
    })

    const upserted = applyStreamItemAction(created, {
      type: "upsert",
      item: updatedItem,
    })

    expect(upserted).toHaveLength(1)
    expect(upserted[0]).toMatchObject({
      id: "approval-2",
      type: "approval_request",
      status: "complete",
      data: {
        requestId: "req-2",
        requestType: "command_approval",
        command: "bun test",
        resolved: true,
      },
    })
  })
})
