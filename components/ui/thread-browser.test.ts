import { describe, expect, test } from "bun:test"
import type { CodexThreadListResult } from "@/app/features/agents/hooks/use-codex-runtime"

function makeThreadListResult(
  data: CodexThreadListResult["data"],
  nextCursor: string | null = null
): CodexThreadListResult {
  return { data, nextCursor }
}

describe("ThreadBrowser data", () => {
  test("empty list result has no items and no cursor", () => {
    const result = makeThreadListResult([])
    expect(result.data).toHaveLength(0)
    expect(result.nextCursor).toBeNull()
  })

  test("list result with thread data exposes all fields", () => {
    const result = makeThreadListResult([
      {
        id: "thread-abc-123",
        preview: "Fix the login bug",
        modelProvider: "anthropic",
        createdAt: 1_700_000_000,
        updatedAt: 1_700_001_000,
        cwd: "/home/user/project",
      },
      {
        id: "thread-def-456",
        preview: "Refactor auth module",
        modelProvider: "openai",
        createdAt: 1_700_002_000,
        updatedAt: 1_700_003_000,
        cwd: "/home/user/other",
      },
    ])
    expect(result.data).toHaveLength(2)
    expect(result.data[0].id).toBe("thread-abc-123")
    expect(result.data[0].preview).toBe("Fix the login bug")
    expect(result.data[0].modelProvider).toBe("anthropic")
    expect(result.data[0].createdAt).toBe(1_700_000_000)
    expect(result.data[0].updatedAt).toBe(1_700_001_000)
    expect(result.data[0].cwd).toBe("/home/user/project")
    expect(result.data[1].id).toBe("thread-def-456")
  })

  test("nextCursor present indicates more pages available", () => {
    const result = makeThreadListResult(
      [
        {
          id: "thread-1",
          preview: "First thread",
          modelProvider: "anthropic",
          createdAt: 1_700_000_000,
          updatedAt: 1_700_000_000,
          cwd: "/tmp",
        },
      ],
      "cursor-next-page"
    )
    expect(result.nextCursor).toBe("cursor-next-page")
  })

  test("nextCursor null indicates no more pages", () => {
    const result = makeThreadListResult([
      {
        id: "thread-1",
        preview: "Only thread",
        modelProvider: "anthropic",
        createdAt: 1_700_000_000,
        updatedAt: 1_700_000_000,
        cwd: "/tmp",
      },
    ])
    expect(result.nextCursor).toBeNull()
  })

  test("mutable ref pattern works for thread list result", () => {
    const ref = {
      current: makeThreadListResult([]),
    }
    expect(ref.current.data).toHaveLength(0)

    ref.current = makeThreadListResult([
      {
        id: "thread-new",
        preview: "New thread",
        modelProvider: "anthropic",
        createdAt: 1_700_000_000,
        updatedAt: 1_700_000_000,
        cwd: "/tmp",
      },
    ])
    expect(ref.current.data).toHaveLength(1)
    expect(ref.current.data[0].id).toBe("thread-new")
  })
})
