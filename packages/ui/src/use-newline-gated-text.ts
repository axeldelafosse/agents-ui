"use client"

/**
 * Buffers streaming text to the last newline boundary.
 *
 * While `isStreaming` is true, returns text up to (and including) the last
 * `\n` character. The trailing partial line is held back until either another
 * newline arrives or streaming ends.
 *
 * When `isStreaming` is false, the full text is returned immediately.
 */
export function useNewlineGatedText(
  text: string | undefined,
  isStreaming: boolean
): string | undefined {
  if (!text) {
    return text
  }

  if (!isStreaming) {
    return text
  }

  const lastNewline = text.lastIndexOf("\n")
  if (lastNewline === -1) {
    // No complete lines yet — return undefined to show shimmer/placeholder
    return undefined
  }

  return text.slice(0, lastNewline + 1)
}
