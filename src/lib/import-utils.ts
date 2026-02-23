/**
 * Pure utility functions for CSV import processing.
 *
 * These are extracted from the import server actions so they can be
 * tested independently without the "use server" constraint (which
 * requires all exports to be async functions).
 */

/**
 * Compute Levenshtein edit distance between two strings.
 * Used for fuzzy duplicate detection — descriptions with distance < 3
 * are flagged for review.
 */
export function levenshtein(a: string, b: string): number {
  const aLower = a.toLowerCase()
  const bLower = b.toLowerCase()
  const m = aLower.length
  const n = bLower.length

  // Optimize: early exit if length difference alone exceeds threshold
  if (Math.abs(m - n) > 10) return Math.abs(m - n)

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = aLower[i - 1] === bLower[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      )
    }
  }

  return dp[m][n]
}
