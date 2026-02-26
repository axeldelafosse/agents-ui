import { describe, expect, test } from "bun:test"

import { dedupeUserMessageMirrors } from "@/components/ui/stream/stream-feed"
import {
  adaptCodexMessageToStreamItems,
  type CodexStreamAdapterInput,
  createCodexStreamAdapterState,
} from "@/lib/codex-stream-adapter"
import { applyStreamActions, type StreamItem } from "@/lib/stream-items"

describe("codex prompt dedupe integration", () => {
  test("keeps a single visible user prompt for started+completed+threadless user_message mirror", () => {
    const state = createCodexStreamAdapterState()
    let items: StreamItem[] = []

    const apply = (input: CodexStreamAdapterInput) => {
      const actions = adaptCodexMessageToStreamItems(state, input)
      items = applyStreamActions(items, actions)
    }

    apply({
      method: "item/started",
      params: {
        threadId: "thread-integration",
        turnId: "turn-integration",
        item: {
          id: "user-msg-integration",
          type: "userMessage",
          content: [
            {
              type: "text",
              text: 'Write three programs: one that say hello world, another one that says hello axel and the other one that says hello!\n\nProof requirements:\nshould say hello\n\nSpawn a team of agents with worktree isolation. When all work is verified and once you have a proof that the task is completed, append "<promise>DONE</promise>" on its own final line.',
            },
          ],
        },
      },
    })

    apply({
      method: "item/completed",
      params: {
        threadId: "thread-integration",
        turnId: "turn-integration",
        itemId: "user-msg-integration",
      },
    })

    apply({
      method: "codex/event/user_message",
      params: {
        msg: {
          role: "user",
          text: 'Write three programs: one that say hello world, another one that says hello axel and the other one that says hello! Proof requirements: should say hello Spawn a team of agents with worktree isolation. When all work is verified and once you have a proof that the task is completed, append "<promise>DONE</promise>" on its own final line.',
        },
      },
    })

    const messageItems = items.filter((item) => item.type === "message")
    expect(messageItems).toHaveLength(1)

    const visible = dedupeUserMessageMirrors(messageItems)
    expect(visible).toHaveLength(1)
    expect(visible[0].data.role).toBe("user")
    expect(String(visible[0].data.text)).toContain("Write three programs")
  })

  test("stream feed collapses equivalent adjacent user mirrors as a safety net", () => {
    const now = Date.now()
    const items: StreamItem[] = [
      {
        id: "msg-1",
        type: "message",
        status: "streaming",
        timestamp: now,
        itemId: "user-msg-1",
        data: {
          role: "user",
          text: "Verify hello_world.py contains the expected output text 'hello world'.",
        },
      },
      {
        id: "msg-2",
        type: "message",
        status: "complete",
        timestamp: now + 100,
        data: {
          role: "user",
          text: "Verify hello_world.py contains the expected output text 'hello world'.",
        },
      },
    ]

    const visible = dedupeUserMessageMirrors(items)
    expect(visible).toHaveLength(1)
    expect(visible[0].id).toBe("msg-2")
  })
})
