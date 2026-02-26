export const DEFAULT_SHIMMER_DURATION_SECONDS = 2
export const DEFAULT_SHIMMER_SPREAD_MULTIPLIER = 2

export function computeShimmerSpread(
  textLength: number,
  spreadMultiplier = DEFAULT_SHIMMER_SPREAD_MULTIPLIER
): number {
  return textLength * spreadMultiplier
}
