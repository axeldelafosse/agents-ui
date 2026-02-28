/**
 * Middle-out truncation: shows head + tail of output with omitted line count.
 */

export interface TruncatedOutput {
  /** First N lines */
  head: string[]
  /** Number of lines omitted from the middle */
  omitted: number
  /** Last N lines */
  tail: string[]
}

/**
 * Split lines into head + tail with an omitted count in the middle.
 *
 * @param lines - Array of output lines
 * @param maxLines - Maximum number of visible lines (head + tail combined)
 * @returns TruncatedOutput with head, tail, and omitted count
 *
 * If lines.length <= maxLines, returns all lines in head with empty tail and 0 omitted.
 *
 * Budget split:
 *   headBudget = floor((maxLines - 1) / 2)
 *   tailBudget = maxLines - headBudget - 1   (the -1 accounts for the ellipsis line)
 */
export function truncateMiddle(
  lines: string[],
  maxLines: number,
): TruncatedOutput {
  if (lines.length <= maxLines) {
    return { head: lines, tail: [], omitted: 0 }
  }

  const headBudget = Math.floor((maxLines - 1) / 2)
  const tailBudget = maxLines - headBudget - 1

  const head = lines.slice(0, headBudget)
  const tail = tailBudget > 0 ? lines.slice(-tailBudget) : []
  const omitted = lines.length - headBudget - tailBudget

  return { head, tail, omitted }
}
