import { describe, expect, test } from "bun:test"

import {
  adaptClaudeStreamMessage,
  createClaudeStreamAdapterState,
} from "@axel-delafosse/protocol/claude-stream-adapter"
import {
  applyStreamActions,
  type StreamItem,
  type StreamItemAction,
} from "@axel-delafosse/protocol/stream-items"

function expectCreate(
  action: StreamItemAction | undefined
): Extract<StreamItemAction, { type: "create" }> {
  if (!action || action.type !== "create") {
    throw new Error("Expected create action")
  }
  return action
}

function expectUpsert(
  action: StreamItemAction | undefined
): Extract<StreamItemAction, { type: "upsert" }> {
  if (!action || action.type !== "upsert") {
    throw new Error("Expected upsert action")
  }
  return action
}

function reduceMessages(messages: readonly object[]): StreamItem[] {
  let state = createClaudeStreamAdapterState()
  let items: StreamItem[] = []
  for (const message of messages) {
    const result = adaptClaudeStreamMessage(message, state, {
      agentId: "agent-claude",
      now: 4000,
    })
    state = result.state
    items = applyStreamActions(items, result.actions)
  }
  return items
}

describe("claude stream adapter", () => {
  test("maps text, thinking, and tool_use stream blocks", () => {
    const options = { agentId: "agent-claude", now: 123 }
    let state = createClaudeStreamAdapterState()

    const textStart = adaptClaudeStreamMessage(
      {
        type: "stream_event",
        session_id: "sess-1",
        event: {
          type: "content_block_start",
          content_block_index: 0,
          content_block: { type: "text" },
        },
      },
      state,
      options
    )
    state = textStart.state
    const textCreated = expectCreate(textStart.actions[0])
    expect(textCreated.item).toMatchObject({
      type: "message",
      status: "streaming",
      agentId: "agent-claude",
      data: { blockType: "text" },
    })

    const textDelta = adaptClaudeStreamMessage(
      {
        type: "stream_event",
        session_id: "sess-1",
        event: {
          type: "content_block_delta",
          content_block_index: 0,
          delta: {
            type: "text_delta",
            text: "Hello from Claude.",
          },
        },
      },
      state,
      options
    )
    state = textDelta.state
    const textUpsert = expectUpsert(textDelta.actions[0])
    expect(textUpsert.item).toMatchObject({
      type: "message",
      status: "streaming",
      data: { text: "Hello from Claude." },
    })

    const thinkingStart = adaptClaudeStreamMessage(
      {
        type: "stream_event",
        session_id: "sess-1",
        event: {
          type: "content_block_start",
          content_block_index: 1,
          content_block: { type: "thinking" },
        },
      },
      state,
      options
    )
    state = thinkingStart.state
    const thinkingCreated = expectCreate(thinkingStart.actions[0])
    expect(thinkingCreated.item.type).toBe("thinking")

    const thinkingDelta = adaptClaudeStreamMessage(
      {
        type: "stream_event",
        session_id: "sess-1",
        event: {
          type: "content_block_delta",
          content_block_index: 1,
          delta: {
            type: "thinking_delta",
            thinking: "I should inspect the reducer.",
          },
        },
      },
      state,
      options
    )
    state = thinkingDelta.state
    const thinkingUpsert = expectUpsert(thinkingDelta.actions[0])
    expect(thinkingUpsert.item).toMatchObject({
      type: "thinking",
      data: {
        thinking: "I should inspect the reducer.",
      },
    })

    const toolStart = adaptClaudeStreamMessage(
      {
        type: "stream_event",
        session_id: "sess-1",
        event: {
          type: "content_block_start",
          content_block_index: 2,
          content_block: { type: "tool_use", name: "Bash" },
        },
      },
      state,
      options
    )
    state = toolStart.state
    const toolCreated = expectCreate(toolStart.actions[0])
    expect(toolCreated.item).toMatchObject({
      type: "tool_call",
      data: {
        blockType: "tool_use",
        name: "Bash",
      },
    })

    const toolDelta = adaptClaudeStreamMessage(
      {
        type: "stream_event",
        session_id: "sess-1",
        event: {
          type: "content_block_delta",
          content_block_index: 2,
          delta: {
            type: "input_json_delta",
            partial_json: '{"command":"bun test"}',
          },
        },
      },
      state,
      options
    )
    const toolUpsert = expectUpsert(toolDelta.actions[0])
    expect(toolUpsert.item).toMatchObject({
      type: "tool_call",
      data: {
        partialJson: '{"command":"bun test"}',
      },
    })
  })

  test("renders approval item for can_use_tool control requests", () => {
    const state = createClaudeStreamAdapterState()
    const result = adaptClaudeStreamMessage(
      {
        type: "control_request",
        session_id: "sess-2",
        request_id: "req-1",
        request: {
          subtype: "can_use_tool",
          tool_name: "Bash",
          input: { command: "bun test" },
        },
      },
      state,
      { now: 999 }
    )

    const created = expectCreate(result.actions[0])
    expect(created.item).toMatchObject({
      type: "approval_request",
      status: "streaming",
      data: {
        requestId: "req-1",
        subtype: "can_use_tool",
        toolName: "Bash",
      },
    })
  })

  test("ignores initialize control requests", () => {
    const state = createClaudeStreamAdapterState()
    const result = adaptClaudeStreamMessage(
      {
        type: "control_request",
        session_id: "sess-3",
        request_id: "req-init",
        request: {
          subtype: "initialize",
        },
      },
      state,
      { now: 1000 }
    )

    expect(result.actions).toEqual([])
  })

  test("ignores system init handshake messages", () => {
    const state = createClaudeStreamAdapterState()
    const result = adaptClaudeStreamMessage(
      {
        type: "system",
        subtype: "init",
        session_id: "sess-init",
      },
      state,
      { now: 1500 }
    )

    expect(result.actions).toEqual([])
  })

  test("maps result events to turn_complete items", () => {
    const state = createClaudeStreamAdapterState()
    const result = adaptClaudeStreamMessage(
      {
        type: "result",
        session_id: "sess-4",
        is_error: false,
        result: "All done",
        cost_usd: 0.01,
        duration_ms: 250,
      },
      state,
      { now: 2000 }
    )

    const created = expectCreate(result.actions[0])
    expect(created.item).toMatchObject({
      type: "turn_complete",
      status: "complete",
      turnId: "claude-turn-1",
      data: {
        isError: false,
        result: "All done",
        costUsd: 0.01,
        durationMs: 250,
      },
    })
  })

  test("maps user messages with tool_result content blocks", () => {
    const state = createClaudeStreamAdapterState()
    const result = adaptClaudeStreamMessage(
      {
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              content: "{ title: 'Agents UI', url: 'http://localhost:3000/' }",
            },
          ],
        },
        session_id: "sess-user",
      },
      state,
      { now: 1800 }
    )

    expect(result.actions).toHaveLength(1)
    const upserted = expectUpsert(result.actions[0])
    expect(upserted.item).toMatchObject({
      type: "tool_result",
      status: "complete",
      data: {
        blockType: "tool_result",
        content: "{ title: 'Agents UI', url: 'http://localhost:3000/' }",
        role: "user",
      },
    })
  })

  test("maps plain-string user content into a visible message item", () => {
    const state = createClaudeStreamAdapterState()
    const result = adaptClaudeStreamMessage(
      {
        type: "user",
        message: {
          role: "user",
          content: "Fix the failing test suite.",
        },
        session_id: "sess-user-text",
      },
      state,
      { now: 1810 }
    )

    expect(result.actions).toHaveLength(1)
    const upserted = expectUpsert(result.actions[0])
    expect(upserted.item).toMatchObject({
      id: "claude:sess-user-text:turn:1:block:0",
      type: "message",
      status: "complete",
      data: {
        blockType: "text",
        content: "Fix the failing test suite.",
        role: "user",
        text: "Fix the failing test suite.",
      },
    })
  })

  test("preserves first plain-string user prompt across turns", () => {
    const items = reduceMessages([
      {
        type: "user",
        session_id: "sess-user-prompts",
        message: {
          role: "user",
          content: "First prompt",
        },
      },
      {
        type: "user",
        session_id: "sess-user-prompts",
        message: {
          role: "user",
          content: "Second prompt",
        },
      },
    ])

    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      id: "claude:sess-user-prompts:turn:1:block:0",
      turnId: "claude-turn-1",
      type: "message",
      data: {
        role: "user",
        text: "First prompt",
      },
    })
    expect(items[1]).toMatchObject({
      id: "claude:sess-user-prompts:turn:2:block:0",
      turnId: "claude-turn-2",
      type: "message",
      data: {
        role: "user",
        text: "Second prompt",
      },
    })
  })

  test("completes active blocks before result turn completion", () => {
    let state = createClaudeStreamAdapterState()
    const options = { now: 2500 }

    const started = adaptClaudeStreamMessage(
      {
        type: "stream_event",
        session_id: "sess-5",
        event: {
          type: "content_block_start",
          content_block_index: 0,
          content_block: { type: "text" },
        },
      },
      state,
      options
    )
    state = started.state

    const result = adaptClaudeStreamMessage(
      {
        type: "result",
        session_id: "sess-5",
        is_error: false,
        result: "ok",
      },
      state,
      options
    )

    expect(result.actions).toHaveLength(2)
    expect(result.actions[0]).toMatchObject({
      type: "complete",
      id: "claude:sess-5:turn:1:block:0",
    })
    const turnComplete = expectCreate(result.actions[1])
    expect(turnComplete.item).toMatchObject({
      type: "turn_complete",
      status: "complete",
    })
  })

  test("preserves assistant-only messages across multiple turns", () => {
    const items = reduceMessages([
      {
        type: "assistant",
        session_id: "sess-only-assistant",
        message: {
          content: [{ type: "text", text: "First assistant response." }],
        },
      },
      {
        type: "assistant",
        session_id: "sess-only-assistant",
        message: {
          content: [{ type: "text", text: "Second assistant response." }],
        },
      },
    ])

    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      id: "claude:sess-only-assistant:turn:1:block:0",
      turnId: "claude-turn-1",
      type: "message",
      data: { text: "First assistant response." },
    })
    expect(items[1]).toMatchObject({
      id: "claude:sess-only-assistant:turn:2:block:0",
      turnId: "claude-turn-2",
      type: "message",
      data: { text: "Second assistant response." },
    })
  })

  test("starts a new turn after message_stop when message_start is missing", () => {
    const items = reduceMessages([
      {
        type: "stream_event",
        session_id: "sess-missing-start",
        event: {
          type: "content_block_start",
          content_block_index: 0,
          content_block: { type: "text" },
        },
      },
      {
        type: "stream_event",
        session_id: "sess-missing-start",
        event: {
          type: "content_block_delta",
          content_block_index: 0,
          delta: { type: "text_delta", text: "First turn text." },
        },
      },
      {
        type: "stream_event",
        session_id: "sess-missing-start",
        event: { type: "message_stop" },
      },
      {
        type: "stream_event",
        session_id: "sess-missing-start",
        event: {
          type: "content_block_start",
          content_block_index: 0,
          content_block: { type: "text" },
        },
      },
      {
        type: "stream_event",
        session_id: "sess-missing-start",
        event: {
          type: "content_block_delta",
          content_block_index: 0,
          delta: { type: "text_delta", text: "Second turn text." },
        },
      },
      {
        type: "stream_event",
        session_id: "sess-missing-start",
        event: { type: "message_stop" },
      },
    ])

    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      id: "claude:sess-missing-start:turn:1:block:0",
      turnId: "claude-turn-1",
      data: { text: "First turn text." },
    })
    expect(items[1]).toMatchObject({
      id: "claude:sess-missing-start:turn:2:block:0",
      turnId: "claude-turn-2",
      data: { text: "Second turn text." },
    })
  })

  test("keeps assistant completion and result on the same turn after message_stop", () => {
    const items = reduceMessages([
      {
        type: "stream_event",
        session_id: "sess-reconcile",
        event: { type: "message_start" },
      },
      {
        type: "stream_event",
        session_id: "sess-reconcile",
        event: {
          type: "content_block_delta",
          content_block_index: 0,
          delta: { type: "text_delta", text: "Reconciled text." },
        },
      },
      {
        type: "stream_event",
        session_id: "sess-reconcile",
        event: { type: "message_stop" },
      },
      {
        type: "assistant",
        session_id: "sess-reconcile",
        message: {
          content: [{ type: "text", text: "Reconciled text." }],
        },
      },
      {
        type: "result",
        session_id: "sess-reconcile",
        is_error: false,
        result: "done",
      },
    ])

    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      id: "claude:sess-reconcile:turn:1:block:0",
      turnId: "claude-turn-1",
      type: "message",
      data: { text: "Reconciled text." },
    })
    expect(items[1]).toMatchObject({
      id: "claude:sess-reconcile:turn:1:result",
      turnId: "claude-turn-1",
      type: "turn_complete",
      status: "complete",
    })
  })
})
