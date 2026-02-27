import { describe, expect, test } from "bun:test"

import { isReusableCodexPlaceholder } from "./agent-routing"

describe("isReusableCodexPlaceholder", () => {
  test("returns true for empty connecting placeholders", () => {
    expect(
      isReusableCodexPlaceholder({
        output: "",
        status: "connecting",
      })
    ).toBe(true)
  })

  test("returns true for empty connected placeholders", () => {
    expect(
      isReusableCodexPlaceholder({
        output: "",
        status: "connected",
      })
    ).toBe(true)
  })

  test("returns false when thread is already assigned", () => {
    expect(
      isReusableCodexPlaceholder({
        output: "",
        status: "connected",
        threadId: "thread-1",
      })
    ).toBe(false)
  })

  test("returns false when output already exists", () => {
    expect(
      isReusableCodexPlaceholder({
        output: "hello",
        status: "connected",
      })
    ).toBe(false)
  })

  test("returns false for disconnected or reconnecting agents", () => {
    expect(
      isReusableCodexPlaceholder({
        output: "",
        status: "disconnected",
      })
    ).toBe(false)
    expect(
      isReusableCodexPlaceholder({
        output: "",
        status: "reconnecting",
      })
    ).toBe(false)
  })
})
