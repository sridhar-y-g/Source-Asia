/**
 * Database Initializer
 *
 * Creates all Source_Asia tables on first API call (lazy singleton).
 * Seeds demo users if the users table is empty.
 *
 * Tables:
 *  - users       : credential store (username + bcrypt password)
 *  - requests    : full request log (one row per API call)
 *  - user_stats  : aggregated per-user counters
 */
import type { RowDataPacket } from 'mysql2/promise'
import pool from './db'

let initialized = false

export async function initDb(): Promise<void> {
  if (initialized) return
  initialized = true

  const conn = await pool.getConnection()
  try {
    // ── users table ──────────────────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id         VARCHAR(36)  NOT NULL,
        username   VARCHAR(100) NOT NULL,
        password   VARCHAR(255) NOT NULL,
        created_at DATETIME(3)  DEFAULT NOW(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_username (username)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)

    // ── requests table ───────────────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS requests (
        id         VARCHAR(36)                    NOT NULL,
        user_id    VARCHAR(255)                   NOT NULL,
        payload    JSON                           NULL,
        status     ENUM('success','rate_limited') NOT NULL,
        created_at DATETIME(3) DEFAULT NOW(3)     NOT NULL,
        PRIMARY KEY (id),
        INDEX idx_user_id    (user_id),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)

    // ── user_stats table ─────────────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS user_stats (
        user_id               VARCHAR(255) NOT NULL,
        total_requests        INT UNSIGNED NOT NULL DEFAULT 0,
        successful_requests   INT UNSIGNED NOT NULL DEFAULT 0,
        rate_limited_requests INT UNSIGNED NOT NULL DEFAULT 0,
        last_request_at       DATETIME(3)  NULL,
        updated_at            DATETIME(3)  DEFAULT NOW(3) ON UPDATE NOW(3),
        PRIMARY KEY (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)

    // ── Seed demo users ───────────────────────────────────────────────────────
    const [existing] = await conn.execute<RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM users'
    )
    if (Number(existing[0].cnt) === 0) {
      const bcrypt = await import('bcryptjs')
      const adminHash = await bcrypt.hash('admin123', 10)
      const demoHash = await bcrypt.hash('demo123', 10)

      await conn.execute(
        `INSERT INTO users (id, username, password) VALUES
          (UUID(), 'admin', ?),
          (UUID(), 'demo',  ?)`,
        [adminHash, demoHash]
      )
      console.log('[DB] Demo users seeded: admin/admin123, demo/demo123 ✓')
    }

    console.log('[DB] Tables ready ✓')
  } finally {
    conn.release()
  }
}
