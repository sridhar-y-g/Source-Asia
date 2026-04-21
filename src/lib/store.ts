/**
 * In-Memory Store with Thread-Safe Rate Limiting
 *
 * Design decisions:
 * - Node.js is single-threaded (event loop), so Map mutations are safe from
 *   true race conditions. However, async operations can interleave, so we use
 *   a per-user lock (promise chain) to prevent TOCTOU races under concurrent
 *   async requests for the same user.
 *
 * Limitations (documented for production awareness):
 * - State is lost on server restart (no persistence).
 * - Not horizontally scalable — each instance has its own state. Use Redis
 *   (see README Bonus section) for multi-instance deployments.
 * - Memory grows unboundedly if users never repeat requests; a TTL eviction
 *   strategy (e.g., setInterval cleanup) is recommended for large-scale use.
 */

export interface UserStats {
  userId: string
  totalRequests: number
  successfulRequests: number
  rateLimitedRequests: number
  lastRequestAt: string | null
  requestTimestamps: number[] // sliding window for rate limit
}

export interface RequestResult {
  allowed: boolean
  rateLimited: boolean
  requestId: string
  userId: string
  processedAt: string
  remainingRequests: number
}

// ─── In-Memory State ────────────────────────────────────────────────────────

const userStats = new Map<string, UserStats>()

/**
 * Per-user async lock: maps userId → a promise representing the current
 * critical section. New requests chain onto it, ensuring serial execution
 * per user even when multiple async requests arrive concurrently.
 */
const userLocks = new Map<string, Promise<void>>()

// ─── Constants ───────────────────────────────────────────────────────────────

const RATE_LIMIT_MAX = 5          // max requests
const RATE_LIMIT_WINDOW_MS = 60_000 // per 60 seconds

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getOrCreateStats(userId: string): UserStats {
  if (!userStats.has(userId)) {
    userStats.set(userId, {
      userId,
      totalRequests: 0,
      successfulRequests: 0,
      rateLimitedRequests: 0,
      lastRequestAt: null,
      requestTimestamps: [],
    })
  }
  return userStats.get(userId)!
}

/**
 * Acquires a per-user lock and runs `fn` inside it serially.
 * This prevents TOCTOU races when concurrent requests come in for the same user.
 */
async function withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const previous = userLocks.get(userId) ?? Promise.resolve()
  let result!: T
  const next = previous.then(async () => {
    result = await fn()
  })
  userLocks.set(userId, next.then(() => {}, () => {}))
  await next
  return result
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Process a request for a given user, enforcing the sliding-window rate limit.
 */
export async function processRequest(
  userId: string,
  _payload: unknown
): Promise<RequestResult> {
  return withUserLock(userId, async () => {
    const stats = getOrCreateStats(userId)
    const now = Date.now()

    // Evict timestamps outside the current window
    stats.requestTimestamps = stats.requestTimestamps.filter(
      (t) => now - t < RATE_LIMIT_WINDOW_MS
    )

    stats.totalRequests++
    stats.lastRequestAt = new Date(now).toISOString()

    if (stats.requestTimestamps.length >= RATE_LIMIT_MAX) {
      // Rate limit exceeded
      stats.rateLimitedRequests++
      return {
        allowed: false,
        rateLimited: true,
        requestId: crypto.randomUUID(),
        userId,
        processedAt: stats.lastRequestAt,
        remainingRequests: 0,
      }
    }

    // Allow the request
    stats.requestTimestamps.push(now)
    stats.successfulRequests++

    return {
      allowed: true,
      rateLimited: false,
      requestId: crypto.randomUUID(),
      userId,
      processedAt: stats.lastRequestAt,
      remainingRequests: RATE_LIMIT_MAX - stats.requestTimestamps.length,
    }
  })
}

/**
 * Returns a sanitised snapshot of all user stats (no internal timestamp arrays).
 */
export function getAllStats(): Omit<UserStats, 'requestTimestamps'>[] {
  return Array.from(userStats.values()).map(({ requestTimestamps: _, ...rest }) => rest)
}

/**
 * Returns stats for a single user, or null if not found.
 */
export function getUserStats(
  userId: string
): Omit<UserStats, 'requestTimestamps'> | null {
  const stats = userStats.get(userId)
  if (!stats) return null
  const { requestTimestamps: _, ...rest } = stats
  return rest
}

export { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS }
