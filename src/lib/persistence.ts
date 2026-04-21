/**
 * MySQL Persistence Layer
 *
 * All writes to the database go through here.
 * Rate limiting itself stays in-memory (src/lib/store.ts) for speed — MySQL
 * is used for durable storage of request logs and aggregated stats.
 */
import type { RowDataPacket } from 'mysql2/promise'
import pool from './db'

export interface DbUserStats {
  userId: string
  totalRequests: number
  successfulRequests: number
  rateLimitedRequests: number
  lastRequestAt: string | null
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Persist a single request log entry to the `requests` table.
 */
export async function saveRequest(
  id: string,
  userId: string,
  payload: unknown,
  status: 'success' | 'rate_limited'
): Promise<void> {
  await pool.execute(
    `INSERT INTO requests (id, user_id, payload, status, created_at)
     VALUES (?, ?, ?, ?, NOW(3))`,
    [id, userId, JSON.stringify(payload ?? null), status]
  )
}

/**
 * Atomically upsert the per-user stats row using MySQL's
 * INSERT … ON DUPLICATE KEY UPDATE pattern.
 */
export async function upsertUserStats(
  userId: string,
  status: 'success' | 'rate_limited'
): Promise<void> {
  const isSuccess = status === 'success'

  await pool.execute(
    `INSERT INTO user_stats
       (user_id, total_requests, successful_requests, rate_limited_requests, last_request_at)
     VALUES (?, 1, ?, ?, NOW(3))
     ON DUPLICATE KEY UPDATE
       total_requests        = total_requests + 1,
       successful_requests   = successful_requests   + ${isSuccess ? 1 : 0},
       rate_limited_requests = rate_limited_requests + ${isSuccess ? 0 : 1},
       last_request_at       = NOW(3)`,
    [userId, isSuccess ? 1 : 0, isSuccess ? 0 : 1]
  )
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Return stats for all users.
 */
export async function getAllUserStats(): Promise<DbUserStats[]> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       user_id               AS userId,
       total_requests        AS totalRequests,
       successful_requests   AS successfulRequests,
       rate_limited_requests AS rateLimitedRequests,
       last_request_at       AS lastRequestAt
     FROM user_stats
     ORDER BY total_requests DESC`
  )
  return rows.map(normalise)
}

/**
 * Return stats for a single user, or null if not found.
 */
export async function getSingleUserStats(
  userId: string
): Promise<DbUserStats | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       user_id               AS userId,
       total_requests        AS totalRequests,
       successful_requests   AS successfulRequests,
       rate_limited_requests AS rateLimitedRequests,
       last_request_at       AS lastRequestAt
     FROM user_stats
     WHERE user_id = ?`,
    [userId]
  )
  if (!rows.length) return null
  return normalise(rows[0])
}

/**
 * Return the last N request logs (optionally filtered by user).
 */
export async function getRecentRequests(
  limit = 50,
  userId?: string
): Promise<{ id: string; userId: string; status: string; createdAt: string }[]> {
  let sql = `SELECT id, user_id AS userId, status, created_at AS createdAt
             FROM requests`
    const params: any[] = []
  if (userId) {
    sql += ' WHERE user_id = ?'
    params.push(userId)
  }
  sql += ' ORDER BY created_at DESC LIMIT ?'
  params.push(limit)

  const [rows] = await pool.execute<RowDataPacket[]>(sql, params)
  return rows as { id: string; userId: string; status: string; createdAt: string }[]
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function normalise(row: RowDataPacket): DbUserStats {
  return {
    userId: row.userId as string,
    totalRequests: Number(row.totalRequests),
    successfulRequests: Number(row.successfulRequests),
    rateLimitedRequests: Number(row.rateLimitedRequests),
    lastRequestAt: row.lastRequestAt
      ? new Date(row.lastRequestAt as string).toISOString()
      : null,
  }
}
