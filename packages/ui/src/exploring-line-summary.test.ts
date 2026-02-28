import { describe, expect, test } from "bun:test"
import type { StreamItem } from "@axel-delafosse/protocol/stream-items"
import {
  mergeSummaryLines,
  summarizeExploringItem,
} from "./exploring-line-summary"

function makeItem(
  type: StreamItem["type"],
  data: Record<string, unknown> = {},
  overrides: Partial<StreamItem> = {}
): StreamItem {
  return {
    id: `test-${Math.random()}`,
    type,
    status: "complete",
    timestamp: Date.now(),
    data,
    ...overrides,
  }
}

describe("summarizeExploringItem", () => {
  test("summarizes command_execution with binary and args", () => {
    const item = makeItem("command_execution", { command: "cat src/main.ts" })
    const result = summarizeExploringItem(item)
    expect(result).toEqual({ label: "$ cat", detail: "src/main.ts" })
  })

  test("summarizes tool_call with known tool name", () => {
    const item = makeItem("tool_call", {
      toolName: "Read",
      arguments: { file_path: "/src/index.ts" },
    })
    const result = summarizeExploringItem(item)
    expect(result).toEqual({ label: "Read", detail: "/src/index.ts" })
  })

  test("summarizes tool_call with Grep pattern", () => {
    const item = makeItem("tool_call", {
      toolName: "Grep",
      arguments: { pattern: "TODO" },
    })
    const result = summarizeExploringItem(item)
    expect(result).toEqual({ label: "Grep", detail: "TODO" })
  })

  test("returns null for successful tool_result", () => {
    const item = makeItem("tool_result", { result: "file content" })
    expect(summarizeExploringItem(item)).toBeNull()
  })

  test("returns error summary for failed tool_result", () => {
    const item = makeItem(
      "tool_result",
      { error: "File not found" },
      { status: "error" }
    )
    const result = summarizeExploringItem(item)
    expect(result).not.toBeNull()
    expect(result!.label).toBe("Error")
    expect(result!.detail).toBe("File not found")
  })

  test("returns null for non-exploring types", () => {
    expect(
      summarizeExploringItem(makeItem("message", { text: "hello" }))
    ).toBeNull()
  })

  test("truncates long details to 80 chars", () => {
    const longPath = "/very/long/path/" + "a".repeat(100) + "/file.ts"
    const item = makeItem("tool_call", {
      toolName: "Read",
      arguments: { file_path: longPath },
    })
    const result = summarizeExploringItem(item)
    expect(result!.detail.length).toBeLessThanOrEqual(81) // 80 + ellipsis
  })

  test("handles partialJson fallback for tool args", () => {
    const item = makeItem("tool_call", {
      toolName: "Read",
      partialJson: '{"file_path":"/tmp/test.ts"}',
    })
    const result = summarizeExploringItem(item)
    expect(result).toEqual({ label: "Read", detail: "/tmp/test.ts" })
  })

  test("handles commandActions array format", () => {
    const item = makeItem("command_execution", {
      commandActions: [
        { command: "cat foo.ts" },
        { command: "grep bar baz.ts" },
      ],
    })
    const result = summarizeExploringItem(item)
    expect(result).not.toBeNull()
    expect(result!.label).toBe("$ cat")
  })

  test("maps lowercase tool variants to display names", () => {
    const item = makeItem("tool_call", {
      toolName: "read_file",
      arguments: { file_path: "test.ts" },
    })
    const result = summarizeExploringItem(item)
    expect(result!.label).toBe("Read")
  })
})

describe("mergeSummaryLines", () => {
  test("merges consecutive same-label lines", () => {
    const lines = [
      { label: "Read", detail: "file1.ts" },
      { label: "Read", detail: "file2.ts" },
      { label: "Read", detail: "file3.ts" },
    ]
    const merged = mergeSummaryLines(lines)
    expect(merged).toHaveLength(1)
    expect(merged[0].label).toBe("Read")
    expect(merged[0].count).toBe(3)
    expect(merged[0].details).toEqual(["file1.ts", "file2.ts", "file3.ts"])
  })

  test("preserves non-consecutive labels as separate entries", () => {
    const lines = [
      { label: "Read", detail: "file1.ts" },
      { label: "Grep", detail: "pattern" },
      { label: "Read", detail: "file2.ts" },
    ]
    const merged = mergeSummaryLines(lines)
    expect(merged).toHaveLength(3)
    expect(merged[0].label).toBe("Read")
    expect(merged[1].label).toBe("Grep")
    expect(merged[2].label).toBe("Read")
  })

  test("returns empty array for empty input", () => {
    expect(mergeSummaryLines([])).toEqual([])
  })

  test("single line stays as one entry", () => {
    const lines = [{ label: "Read", detail: "file.ts" }]
    const merged = mergeSummaryLines(lines)
    expect(merged).toHaveLength(1)
    expect(merged[0].count).toBe(1)
  })
})
