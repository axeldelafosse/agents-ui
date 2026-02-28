import { describe, expect, test } from "bun:test"
import { truncateMiddle } from "./truncate-output"

describe("truncateMiddle", () => {
  test("returns all lines when under max", () => {
    const result = truncateMiddle(["a", "b", "c"], 5)
    expect(result.head).toEqual(["a", "b", "c"])
    expect(result.tail).toEqual([])
    expect(result.omitted).toBe(0)
  })

  test("returns all lines when exactly at max", () => {
    const result = truncateMiddle(["a", "b", "c", "d", "e"], 5)
    expect(result.head).toEqual(["a", "b", "c", "d", "e"])
    expect(result.tail).toEqual([])
    expect(result.omitted).toBe(0)
  })

  test("splits 10 lines with max 5: head 2, tail 2, omitted 6", () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line-${i}`)
    const result = truncateMiddle(lines, 5)
    expect(result.head).toEqual(["line-0", "line-1"])
    expect(result.tail).toEqual(["line-8", "line-9"])
    expect(result.omitted).toBe(6)
  })

  test("splits 20 lines with max 5: head 2, tail 2, omitted 16", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line-${i}`)
    const result = truncateMiddle(lines, 5)
    expect(result.head).toEqual(["line-0", "line-1"])
    expect(result.tail).toEqual(["line-18", "line-19"])
    expect(result.omitted).toBe(16)
  })

  test("handles max of 1 line", () => {
    const lines = ["a", "b", "c", "d", "e"]
    const result = truncateMiddle(lines, 1)
    expect(result.head).toEqual([])
    expect(result.tail).toEqual([])
    expect(result.omitted).toBe(5)
  })

  test("handles max of 2 lines", () => {
    const lines = ["a", "b", "c", "d", "e"]
    const result = truncateMiddle(lines, 2)
    expect(result.head).toEqual([])
    expect(result.tail).toEqual(["e"])
    expect(result.omitted).toBe(4)
  })

  test("handles max of 3 lines", () => {
    const lines = ["a", "b", "c", "d", "e"]
    const result = truncateMiddle(lines, 3)
    expect(result.head).toEqual(["a"])
    expect(result.tail).toEqual(["e"])
    expect(result.omitted).toBe(3)
  })

  test("empty input returns empty result", () => {
    const result = truncateMiddle([], 5)
    expect(result.head).toEqual([])
    expect(result.tail).toEqual([])
    expect(result.omitted).toBe(0)
  })
})
