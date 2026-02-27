import { describe, expect, test } from "bun:test"

import {
  buildClaudeInputPayload,
  normalizeSubmittedInput,
  readQuestionIds,
  toCodexQuestionAnswers,
} from "@axel-delafosse/agent-runtime/hooks/use-agents-runtime"
import type { StreamItem } from "@axel-delafosse/protocol/stream-items"

function makeStreamItem(
  overrides: Partial<StreamItem> & { data: Record<string, unknown> }
): StreamItem {
  return {
    id: "test-item",
    type: "approval_request",
    status: "complete",
    timestamp: 1,
    ...overrides,
  }
}

describe("normalizeSubmittedInput", () => {
  test("trims and returns non-empty strings", () => {
    expect(normalizeSubmittedInput("hello")).toBe("hello")
    expect(normalizeSubmittedInput("  hello  ")).toBe("hello")
  })

  test("returns undefined for empty strings", () => {
    expect(normalizeSubmittedInput("")).toBeUndefined()
    expect(normalizeSubmittedInput("   ")).toBeUndefined()
  })

  test("filters out empty record entries", () => {
    const result = normalizeSubmittedInput({
      name: "Alice",
      empty: "",
      blank: "   ",
      valid: "Bob",
    })
    expect(result).toEqual({ name: "Alice", valid: "Bob" })
  })

  test("returns undefined for records with all empty values", () => {
    const result = normalizeSubmittedInput({
      a: "",
      b: "   ",
      c: "",
    })
    expect(result).toBeUndefined()
  })
})

describe("readQuestionIds", () => {
  test("extracts question ids from data.questions", () => {
    const item = makeStreamItem({
      data: {
        questions: [
          { id: "q1", question: "First?" },
          { id: "q2", question: "Second?" },
        ],
      },
    })
    expect(readQuestionIds(item)).toEqual(["q1", "q2"])
  })

  test("extracts question ids from data.params.questions", () => {
    const item = makeStreamItem({
      data: {
        params: {
          questions: [{ id: "nested-q1", question: "Nested?" }],
        },
      },
    })
    expect(readQuestionIds(item)).toEqual(["nested-q1"])
  })

  test("returns empty array when no questions found", () => {
    const item = makeStreamItem({
      data: {},
    })
    expect(readQuestionIds(item)).toEqual([])
  })

  test("handles questionId alias", () => {
    const item = makeStreamItem({
      data: {
        questions: [{ questionId: "alt-q1", question: "Alt?" }],
      },
    })
    expect(readQuestionIds(item)).toEqual(["alt-q1"])
  })

  test("skips questions without id or questionId", () => {
    const item = makeStreamItem({
      data: {
        questions: [
          { question: "No id here" },
          { id: "has-id", question: "With id" },
        ],
      },
    })
    expect(readQuestionIds(item)).toEqual(["has-id"])
  })
})

describe("buildClaudeInputPayload", () => {
  test("returns undefined when requestId is missing", () => {
    const item = makeStreamItem({
      data: {},
    })
    const result = buildClaudeInputPayload(item, "test")
    expect(result).toBeUndefined()
  })

  test("returns undefined when requestId is not a string", () => {
    const item = makeStreamItem({
      data: { requestId: 42 },
    })
    const result = buildClaudeInputPayload(item, "test")
    expect(result).toBeUndefined()
  })

  test("builds payload with string input", () => {
    const item = makeStreamItem({
      data: { requestId: "req-1" },
    })
    const result = buildClaudeInputPayload(item, "user answer")
    expect(result).toEqual({
      allow: true,
      requestId: "req-1",
      input: "user answer",
      updatedInput: "user answer",
    })
  })

  test("merges object input with request.input", () => {
    const item = makeStreamItem({
      data: {
        requestId: "req-2",
        request: {
          input: { command: "bun test" },
        },
      },
    })
    const result = buildClaudeInputPayload(item, { extra: "value" })
    expect(result).toMatchObject({
      allow: true,
      requestId: "req-2",
      input: { extra: "value" },
      updatedInput: { command: "bun test", extra: "value" },
    })
  })

  test("includes updatedInput when request.input exists with string submission", () => {
    const item = makeStreamItem({
      data: {
        requestId: "req-3",
        request: {
          input: { command: "echo hi" },
        },
      },
    })
    const result = buildClaudeInputPayload(item, "override")
    expect(result).toMatchObject({
      allow: true,
      requestId: "req-3",
      input: "override",
      updatedInput: { command: "echo hi", userInput: "override" },
    })
  })

  test("passes through updatedInput when no request.input", () => {
    const item = makeStreamItem({
      data: {
        requestId: "req-4",
      },
    })
    const result = buildClaudeInputPayload(item, "just text")
    expect(result).toMatchObject({
      allow: true,
      requestId: "req-4",
      input: "just text",
      updatedInput: "just text",
    })
  })

  test("uses request.input as updatedInput when submitted is empty", () => {
    const item = makeStreamItem({
      data: {
        requestId: "req-5",
        request: {
          input: { command: "saved" },
        },
      },
    })
    const result = buildClaudeInputPayload(item, "")
    expect(result).toMatchObject({
      allow: true,
      requestId: "req-5",
      updatedInput: { command: "saved" },
    })
    expect(result?.input).toBeUndefined()
  })
})

describe("toCodexQuestionAnswers", () => {
  test("maps string input to first question id", () => {
    const result = toCodexQuestionAnswers("my answer", ["q1", "q2"])
    expect(result).toEqual({
      q1: { answers: ["my answer"] },
    })
  })

  test("uses fallback 'response' key when no question ids provided", () => {
    const result = toCodexQuestionAnswers("my answer", [])
    expect(result).toEqual({
      response: { answers: ["my answer"] },
    })
  })

  test("maps record input to matching question ids", () => {
    const result = toCodexQuestionAnswers({ q1: "answer1", q2: "answer2" }, [
      "q1",
      "q2",
    ])
    expect(result).toEqual({
      q1: { answers: ["answer1"] },
      q2: { answers: ["answer2"] },
    })
  })

  test("falls back to record keys when no question ids match", () => {
    const result = toCodexQuestionAnswers(
      { myKey: "myValue", otherKey: "otherValue" },
      []
    )
    expect(result).toEqual({
      myKey: { answers: ["myValue"] },
      otherKey: { answers: ["otherValue"] },
    })
  })

  test("falls back to first answer mapped to first question id when no ids match", () => {
    const result = toCodexQuestionAnswers({ unmatched: "value" }, ["q1", "q2"])
    expect(result).toEqual({
      q1: { answers: ["value"] },
    })
  })

  test("returns empty object for empty input", () => {
    const result = toCodexQuestionAnswers("", ["q1"])
    expect(result).toEqual({})
  })

  test("returns empty object for record with all empty values", () => {
    const result = toCodexQuestionAnswers({ q1: "", q2: "  " }, ["q1", "q2"])
    expect(result).toEqual({})
  })
})
