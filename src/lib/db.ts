/**
 * MySQL Connection Pool Singleton
 *
 * Uses a module-level singleton so Next.js hot-reload doesn't create new
 * pools on every file save in dev mode.
 */
import mysql from 'mysql2/promise'

declare global {
  // eslint-disable-next-line no-var
  var _mysqlPool: mysql.Pool | undefined
}

function createPool(): mysql.Pool {
  return mysql.createPool({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? 'project@1234',
    database: process.env.DB_NAME ?? 'Source_Asia',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: 'Z',
  })
}

// Reuse pool across hot-reloads in dev; create fresh in prod
const pool: mysql.Pool =
  process.env.NODE_ENV === 'production'
    ? createPool()
    : (globalThis._mysqlPool ?? (globalThis._mysqlPool = createPool()))

export default pool
