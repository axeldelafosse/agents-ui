import { describe, expect, test } from "bun:test"
import type { StreamItem } from "@axel-delafosse/protocol/stream-items"
import {
  isCompactableType,
  isExploringCommandExecution,
  isExploringItem,
  isExploringToolCall,
} from "./stream-compaction-classify"

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

describe("isExploringCommandExecution", () => {
  test("returns true for read-family commands", () => {
    for (const cmd of [
      "cat foo.ts",
      "head -20 bar.rs",
      "tail -f log.txt",
      "ls -la",
      "grep pattern .",
      "rg something",
      "find . -name '*.ts'",
      "wc -l file.txt",
      "tree",
      "pwd",
    ]) {
      const item = makeItem("command_execution", { command: cmd })
      expect(isExploringCommandExecution(item)).toBe(true)
    }
  })

  test("returns false for non-exploring commands", () => {
    for (const cmd of [
      "npm test",
      "bun run build",
      "git push",
      "rm -rf node_modules",
      "echo hello",
    ]) {
      const item = makeItem("command_execution", { command: cmd })
      expect(isExploringCommandExecution(item)).toBe(false)
    }
  })

  test("returns false for non command_execution types", () => {
    const item = makeItem("message", { command: "cat foo.ts" })
    expect(isExploringCommandExecution(item)).toBe(false)
  })

  test("handles commandActions array format", () => {
    const item = makeItem("command_execution", {
      commandActions: [{ command: "cat foo.ts" }],
    })
    expect(isExploringCommandExecution(item)).toBe(true)
  })

  test("case-insensitive matching", () => {
    const item = makeItem("command_execution", { command: "CAT foo.ts" })
    expect(isExploringCommandExecution(item)).toBe(true)
  })

  test("array command format", () => {
    const item = makeItem("command_execution", {
      command: ["cat", "foo.ts"],
    })
    expect(isExploringCommandExecution(item)).toBe(true)
  })
})

describe("isExploringToolCall", () => {
  test("returns true for exploring tool names", () => {
    for (const name of [
      "Read",
      "Glob",
      "Grep",
      "LS",
      "WebFetch",
      "WebSearch",
      "read_file",
      "list_files",
      "search_files",
    ]) {
      expect(
        isExploringToolCall(makeItem("tool_call", { toolName: name }))
      ).toBe(true)
    }
  })

  test("returns true for tool_result with exploring tool name", () => {
    expect(
      isExploringToolCall(makeItem("tool_result", { toolName: "Read" }))
    ).toBe(true)
  })

  test("returns false for non-exploring tools", () => {
    for (const name of ["Write", "Edit", "Bash", "NotebookEdit"]) {
      expect(
        isExploringToolCall(makeItem("tool_call", { toolName: name }))
      ).toBe(false)
    }
  })

  test("returns false for non tool_call/tool_result types", () => {
    expect(
      isExploringToolCall(makeItem("message", { toolName: "Read" }))
    ).toBe(false)
  })
})

describe("isExploringItem", () => {
  test("returns true for exploring command or tool", () => {
    expect(
      isExploringItem(makeItem("command_execution", { command: "cat foo.ts" }))
    ).toBe(true)
    expect(
      isExploringItem(makeItem("tool_call", { toolName: "Read" }))
    ).toBe(true)
  })

  test("returns false for non-exploring items", () => {
    expect(
      isExploringItem(makeItem("message", { text: "hello" }))
    ).toBe(false)
  })
})

describe("isCompactableType", () => {
  test("recognizes compactable types", () => {
    expect(isCompactableType("command_execution")).toBe(true)
    expect(isCompactableType("tool_call")).toBe(true)
    expect(isCompactableType("tool_result")).toBe(true)
  })

  test("rejects non-compactable types", () => {
    expect(isCompactableType("message")).toBe(false)
    expect(isCompactableType("file_change")).toBe(false)
    expect(isCompactableType("thinking")).toBe(false)
  })
})
