import { describe, expect, test } from "bun:test"

import {
  applyStreamItemAction,
  applyStreamItemActions,
  type StreamItem,
} from "@/lib/stream-items"

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

describe("stream-items reducer", () => {
  test("applies create/update/upsert/append_text/complete actions", () => {
    const created = applyStreamItemAction([], {
      type: "create",
      item: makeItem("item-1", {
        data: { text: "Hello", stage: "create" },
      }),
    })

    const updated = applyStreamItemAction(created, {
      type: "update",
      id: "item-1",
      patch: {
        type: "reasoning",
        data: { stage: "update", step: 1 },
      },
    })

    const upserted = applyStreamItemAction(updated, {
      type: "upsert",
      item: makeItem("item-1", {
        type: "reasoning",
        data: { extra: "upserted" },
      }),
    })

    const appended = applyStreamItemAction(upserted, {
      type: "append_text",
      id: "item-1",
      text: " world",
    })

    const completed = applyStreamItemAction(appended, {
      type: "complete",
      id: "item-1",
      patch: { data: { done: true } },
    })

    expect(completed).toHaveLength(1)
    expect(completed[0]).toMatchObject({
      id: "item-1",
      type: "reasoning",
      status: "complete",
      data: {
        text: "Hello world",
        stage: "update",
        step: 1,
        extra: "upserted",
        done: true,
      },
    })
  })

  test("ignores duplicate create actions by item id", () => {
    const existing = [
      makeItem("item-dup", {
        status: "complete",
        data: { text: "original" },
      }),
    ]

    const next = applyStreamItemAction(existing, {
      type: "create",
      item: makeItem("item-dup", {
        data: { text: "new-content" },
      }),
    })

    expect(next).toEqual(existing)
    expect(next).not.toBe(existing)
  })

  test("caps list size to configured item limit", () => {
    const limited = applyStreamItemActions(
      [],
      [
        { type: "create", item: makeItem("item-1") },
        { type: "create", item: makeItem("item-2") },
        { type: "create", item: makeItem("item-3") },
      ],
      2
    )

    const next = applyStreamItemAction(
      limited,
      {
        type: "upsert",
        item: makeItem("item-4"),
      },
      2
    )

    expect(limited.map((item) => item.id)).toEqual(["item-2", "item-3"])
    expect(next.map((item) => item.id)).toEqual(["item-3", "item-4"])
  })
})
