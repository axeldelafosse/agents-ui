import { describe, expect, test } from "bun:test"
import { useNewlineGatedText } from "./use-newline-gated-text"

describe("useNewlineGatedText", () => {
  test("returns undefined for undefined input", () => {
    expect(useNewlineGatedText(undefined, true)).toBeUndefined()
    expect(useNewlineGatedText(undefined, false)).toBeUndefined()
  })

  test("returns full text when not streaming", () => {
    expect(useNewlineGatedText("hello world", false)).toBe("hello world")
    expect(useNewlineGatedText("line1\nline2", false)).toBe("line1\nline2")
    expect(useNewlineGatedText("partial", false)).toBe("partial")
  })

  test("returns undefined when streaming with no newlines", () => {
    expect(useNewlineGatedText("partial word", true)).toBeUndefined()
    expect(useNewlineGatedText("no newline here", true)).toBeUndefined()
  })

  test("returns text up to last newline when streaming", () => {
    expect(useNewlineGatedText("line1\npartial", true)).toBe("line1\n")
    expect(useNewlineGatedText("line1\nline2\npartial", true)).toBe(
      "line1\nline2\n"
    )
  })

  test("returns full text when streaming text ends with newline", () => {
    expect(useNewlineGatedText("line1\n", true)).toBe("line1\n")
    expect(useNewlineGatedText("line1\nline2\n", true)).toBe("line1\nline2\n")
  })

  test("handles empty string", () => {
    // Empty string is falsy, returned as-is
    expect(useNewlineGatedText("", true)).toBe("")
    expect(useNewlineGatedText("", false)).toBe("")
  })

  test("handles text that is only newlines", () => {
    expect(useNewlineGatedText("\n", true)).toBe("\n")
    expect(useNewlineGatedText("\n\n", true)).toBe("\n\n")
  })
})
