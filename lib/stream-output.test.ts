import { describe, expect, test } from "bun:test"

import {
  type ClaudeOutputMessage,
  type CodexOutputEvent,
  createClaudeOutputState,
  createCodexOutputState,
  reduceClaudeOutput,
  reduceCodexOutput,
} from "@/lib/stream-output"

function runCodexSequence(events: CodexOutputEvent[]): string {
  let output = ""
  let state = createCodexOutputState()
  for (const event of events) {
    const next = reduceCodexOutput(output, state, event, { prettyMode: true })
    output = next.output
    state = next.state
  }
  return output
}

function runClaudeSequence(events: ClaudeOutputMessage[]): string {
  let output = ""
  let state = createClaudeOutputState()
  for (const event of events) {
    const next = reduceClaudeOutput(output, state, event, { prettyMode: true })
    output = next.output
    state = next.state
  }
  return output
}

describe("codex rendering sequence", () => {
  test("inserts message boundaries between completed assistant chunks", () => {
    const output = runCodexSequence([
      {
        method: "item/agentMessage/delta",
        text: "Let me review the current changes.",
      },
      { method: "item/completed" },
      {
        method: "item/agentMessage/delta",
        text: "Now let me read a few key files.",
      },
      { method: "item/completed" },
    ])

    expect(output).toBe(
      "Let me review the current changes.\n\nNow let me read a few key files.\n\n"
    )
  })

  test("preserves nested newline content", () => {
    const output = runCodexSequence([
      { method: "item/agentMessage/delta", text: "Heading\n- one\n- two" },
      { method: "item/completed" },
    ])

    expect(output).toBe("Heading\n- one\n- two\n\n")
  })

  test("injects subagent header when thread changes", () => {
    const output = runCodexSequence([
      {
        method: "item/agentMessage/delta",
        text: "Main thread output.",
        threadId: "thread-main",
      },
      { method: "item/completed" },
      {
        method: "item/agentMessage/delta",
        text: "Subagent output.",
        threadId: "thread-sub1",
      },
      { method: "item/completed" },
    ])

    expect(output).toContain("Main thread output.")
    expect(output).toContain("[subagent thread-s")
    expect(output).toContain("Subagent output.")
  })

  test("injects separator when returning from subagent to main thread", () => {
    const output = runCodexSequence([
      {
        method: "item/agentMessage/delta",
        text: "Main before.",
        threadId: "thread-main",
      },
      { method: "item/completed" },
      {
        method: "item/agentMessage/delta",
        text: "Sub work.",
        threadId: "thread-sub",
      },
      { method: "item/completed" },
      {
        method: "item/agentMessage/delta",
        text: "Main after.",
        threadId: "thread-main",
      },
      { method: "item/completed" },
    ])

    expect(output).toContain("Main before.")
    expect(output).toContain("Sub work.")
    expect(output).toContain("Main after.")
    // Two separators: one entering subagent, one returning
    const separatorCount = (output.match(/---/g) ?? []).length
    expect(separatorCount).toBe(2)
  })

  test("no header when all events use the same thread", () => {
    const output = runCodexSequence([
      {
        method: "item/agentMessage/delta",
        text: "First.",
        threadId: "thread-a",
      },
      { method: "item/completed" },
      {
        method: "item/agentMessage/delta",
        text: "Second.",
        threadId: "thread-a",
      },
      { method: "item/completed" },
    ])

    expect(output).toBe("First.\n\nSecond.\n\n")
    expect(output).not.toContain("subagent")
    expect(output).not.toContain("---")
  })
})

describe("claude rendering sequence", () => {
  test("prevents concatenation across streamed assistant messages", () => {
    const output = runClaudeSequence([
      { type: "stream_event", event: { type: "message_start" } },
      {
        type: "stream_event",
        event: {
          type: "content_block_start",
          content_block_index: 0,
        },
      },
      {
        type: "stream_event",
        event: {
          type: "content_block_delta",
          content_block_index: 0,
          delta: {
            type: "text_delta",
            text: "Let me review the current changes to understand what's being worked on.",
          },
        },
      },
      { type: "stream_event", event: { type: "content_block_stop" } },
      { type: "stream_event", event: { type: "message_stop" } },
      { type: "stream_event", event: { type: "message_start" } },
      {
        type: "stream_event",
        event: {
          type: "content_block_start",
          content_block_index: 0,
        },
      },
      {
        type: "stream_event",
        event: {
          type: "content_block_delta",
          content_block_index: 0,
          delta: {
            type: "text_delta",
            text: "Now let me read a few key files for full context.",
          },
        },
      },
      { type: "stream_event", event: { type: "message_stop" } },
    ])

    expect(output).toContain(
      "worked on.\n\nNow let me read a few key files for full context."
    )
    expect(output).toBe(
      "Let me review the current changes to understand what's being worked on.\n\nNow let me read a few key files for full context.\n\n"
    )
  })

  test("reconciles completed assistant text after streamed delta", () => {
    const output = runClaudeSequence([
      {
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "Hel" },
        },
      },
      {
        type: "assistant",
        message: {
          content: [{ type: "text", text: "Hello" }],
        },
      },
    ])

    expect(output).toBe("Hello\n\n")
  })

  test("supports assistant-only fallback when no deltas are streamed", () => {
    const output = runClaudeSequence([
      {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "Final answer" },
            { type: "thinking", text: "Reasoning block" },
          ],
        },
      },
    ])

    expect(output).toBe("Final answer\n\nReasoning block\n\n")
  })
})
