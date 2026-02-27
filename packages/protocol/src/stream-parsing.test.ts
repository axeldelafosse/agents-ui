import { describe, expect, test } from "bun:test"

import {
  appendPrettyMessageBoundary,
  bufferNdjsonChunk,
  CLAUDE_STREAM_EVENT_TYPES,
  claudeBlockIndex,
  claudeCompletedText,
  claudeDeltaText,
  claudeSessionId,
  codexTextFromParams,
  codexTextFromRawParams,
  isClaudeInitMessage,
  isClaudeStreamEventType,
  normalizeStreamText,
  readNestedCodexText,
  toClaudeStreamEvent,
  unwrapClaudeRawMessage,
} from "./stream-parsing"

describe("codex text parsing", () => {
  test("reads direct string values", () => {
    expect(readNestedCodexText("hello")).toBe("hello")
  })

  test("reads nested values recursively", () => {
    const value = {
      payload: {
        content: [{ ignored: true }, { text: "nested-text" }],
      },
    }
    expect(readNestedCodexText(value)).toBe("nested-text")
  })

  test("prefers delta over other fields", () => {
    expect(
      codexTextFromParams({
        delta: "delta-first",
        text: "text-second",
        content: "content-third",
      })
    ).toBe("delta-first")
  })

  test("returns first available field when earlier values are empty", () => {
    expect(
      codexTextFromParams({
        delta: "",
        text: "",
        content: { message: { text: "from-content" } },
      })
    ).toBe("from-content")
  })

  test("reads text from payload-wrapped codex event structures", () => {
    expect(
      codexTextFromParams({
        payload: {
          delta: {
            content: [{ text: "from-payload" }],
          },
        },
      })
    ).toBe("from-payload")
  })

  test("reads text from event/item wrappers", () => {
    expect(
      codexTextFromParams({
        event: {
          item: {
            message: {
              content: [{ text: "from-event-item" }],
            },
          },
        },
      })
    ).toBe("from-event-item")
  })

  test("reads text from input and response fallbacks", () => {
    expect(
      codexTextFromParams({
        input: { text: "from-input" },
      })
    ).toBe("from-input")

    expect(
      codexTextFromParams({
        response: { message: { text: "from-response" } },
      })
    ).toBe("from-response")
  })

  test("reads raw msg content parts for output text", () => {
    expect(
      codexTextFromRawParams({
        msg: {
          id: "item-1",
          conversationId: "thread-1",
          content: [{ type: "output_text", text: "hello raw world" }],
        },
      })
    ).toBe("hello raw world")
  })

  test("reads text from json-encoded raw msg", () => {
    expect(
      codexTextFromRawParams({
        msg: JSON.stringify({
          content: [{ type: "output_text", text: "json raw text" }],
        }),
      })
    ).toBe("json raw text")
  })

  test("filters opaque token prefixes from raw text", () => {
    const opaque = `gAAAAA${"A".repeat(120)}`
    expect(
      codexTextFromRawParams({
        msg: `${opaque} hello world`,
      })
    ).toBe("hello world")
  })

  test("returns empty for opaque-only raw text", () => {
    const opaqueOne = `gAAAAA${"A".repeat(120)}`
    const opaqueTwo = "B".repeat(120)
    expect(
      codexTextFromRawParams({
        msg: `${opaqueOne} ${opaqueTwo}`,
      })
    ).toBe("")
  })

  test("does not treat metadata-only raw payload as text", () => {
    expect(
      codexTextFromRawParams({
        msg: {
          id: "item-2",
          conversationId: "thread-2",
          status: "completed",
        },
      })
    ).toBe("")
  })
})

describe("claude delta parsing", () => {
  test("ignores input_json_delta chunks", () => {
    expect(
      claudeDeltaText({
        type: "input_json_delta",
        partial_json: '{"a":1}',
      })
    ).toBe("")
  })

  test("prefers thinking text when present", () => {
    expect(
      claudeDeltaText({
        type: "thinking_delta",
        text: "fallback",
        thinking: "reasoning",
      })
    ).toBe("reasoning")
  })

  test("falls back to text field for standard deltas", () => {
    expect(claudeDeltaText({ type: "text_delta", text: "hello" })).toBe("hello")
  })
})

describe("claude stream event normalization", () => {
  test("recognizes all supported stream event types", () => {
    for (const type of CLAUDE_STREAM_EVENT_TYPES) {
      expect(isClaudeStreamEventType(type)).toBe(true)
    }
    expect(isClaudeStreamEventType("assistant")).toBe(false)
  })

  test("normalizes wrapped stream_event payloads", () => {
    const event = toClaudeStreamEvent({
      type: "stream_event",
      event: { type: "content_block_delta" },
    })
    expect(event).toEqual({ type: "content_block_delta" })
  })

  test("normalizes direct stream events", () => {
    const event = toClaudeStreamEvent({
      type: "message_stop",
      content_block_index: 2,
    })
    expect(event).toEqual({
      type: "message_stop",
      content_block_index: 2,
    })
  })

  test("returns undefined for non-stream message types", () => {
    expect(toClaudeStreamEvent({ type: "assistant" })).toBeUndefined()
  })
})

describe("claude session normalization", () => {
  test("unwraps relay raw message payloads", () => {
    const normalized = unwrapClaudeRawMessage({
      type: "raw",
      data: {
        type: "system",
        subtype: "init",
        session_id: "session-123",
      },
    })

    expect(normalized).toEqual({
      type: "system",
      subtype: "init",
      session_id: "session-123",
    })
  })

  test("extracts session id from wrapped raw message", () => {
    expect(
      claudeSessionId({
        type: "raw",
        data: {
          type: "result",
          session_id: "session-abc",
        },
      })
    ).toBe("session-abc")
  })

  test("extracts camel-case session id", () => {
    expect(
      claudeSessionId({
        type: "init",
        sessionId: "session-camel",
      })
    ).toBe("session-camel")
  })

  test("extracts nested session id from payload wrappers", () => {
    expect(
      claudeSessionId({
        type: "result",
        data: {
          payload: {
            message: {
              session_id: "session-nested",
            },
          },
        },
      })
    ).toBe("session-nested")
  })

  test("extracts session id from nested raw data wrapper", () => {
    expect(
      claudeSessionId({
        type: "raw",
        data: {
          type: "raw",
          data: {
            payload: {
              sessionId: "session-deep",
            },
          },
        },
      })
    ).toBe("session-deep")
  })

  test("detects init events across message variants", () => {
    expect(
      isClaudeInitMessage({
        type: "system",
        subtype: "init",
      })
    ).toBe(true)
    expect(
      isClaudeInitMessage({
        type: "system/init",
      })
    ).toBe(true)
    expect(
      isClaudeInitMessage({
        type: "raw",
        data: { type: "system", subtype: "init" },
      })
    ).toBe(true)
    expect(
      isClaudeInitMessage({
        type: "assistant",
      })
    ).toBe(false)
  })
})

describe("buffered NDJSON chunk parsing", () => {
  test("keeps partial tail in carry and emits complete lines", () => {
    const first = bufferNdjsonChunk('{"type":"content_block_delta"', "")
    expect(first.lines).toEqual([])
    expect(first.carry).toBe('{"type":"content_block_delta"')

    const second = bufferNdjsonChunk(
      '}\n{"type":"message_stop"}\n',
      first.carry
    )
    expect(second.lines).toEqual([
      '{"type":"content_block_delta"}',
      '{"type":"message_stop"}',
    ])
    expect(second.carry).toBe("")
  })

  test("accepts a complete json tail without newline", () => {
    const parsed = bufferNdjsonChunk('{"type":"message_stop"}', "")
    expect(parsed.lines).toEqual(['{"type":"message_stop"}'])
    expect(parsed.carry).toBe("")
  })

  test("strips carriage returns from parsed lines", () => {
    const parsed = bufferNdjsonChunk('{"a":1}\r\n{"b":2}\r\n', "")
    expect(parsed.lines).toEqual(['{"a":1}', '{"b":2}'])
    expect(parsed.carry).toBe("")
  })
})

describe("newline and completion helpers", () => {
  test("normalizes CRLF and CR newlines", () => {
    expect(normalizeStreamText("a\r\nb\rc")).toBe("a\nb\nc")
  })

  test("extracts text/thinking blocks from assistant completion", () => {
    expect(
      claudeCompletedText([
        { type: "text", text: "line-one" },
        { type: "thinking", text: "line-two" },
        { type: "tool_use", name: "ls" },
      ])
    ).toBe("line-one\n\nline-two")
  })

  test("returns empty completion text for invalid block arrays", () => {
    expect(claudeCompletedText()).toBe("")
  })

  test("resolves block index with index precedence", () => {
    expect(claudeBlockIndex({ index: 2, content_block_index: 9 })).toBe(2)
    expect(claudeBlockIndex({ content_block_index: 4 })).toBe(4)
    expect(claudeBlockIndex({})).toBeUndefined()
  })
})

describe("pretty boundary insertion", () => {
  test("appends double newline between messages", () => {
    expect(appendPrettyMessageBoundary("hello")).toBe("hello\n\n")
  })

  test("keeps exactly two trailing newlines", () => {
    expect(appendPrettyMessageBoundary("hello\n")).toBe("hello\n\n")
    expect(appendPrettyMessageBoundary("hello\n\n")).toBe("hello\n\n")
  })

  test("leaves empty output unchanged", () => {
    expect(appendPrettyMessageBoundary("")).toBe("")
  })
})
