import { NextRequest, NextResponse } from 'next/server'
import type { RowDataPacket } from 'mysql2/promise'
import bcrypt from 'bcryptjs'

import { initDb } from '@/lib/db-init'
import pool from '@/lib/db'
import { signToken } from '@/lib/jwt'

export async function POST(req: NextRequest) {
  await initDb()

  let body: { username?: unknown; password?: unknown; confirmPassword?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { username, password, confirmPassword } = body

  // ── Validation ──────────────────────────────────────────────────────────────
  if (!username || typeof username !== 'string') {
    return NextResponse.json({ error: 'username is required' }, { status: 400 })
  }
  if (!password || typeof password !== 'string') {
    return NextResponse.json({ error: 'password is required' }, { status: 400 })
  }
  if (username.trim().length < 3) {
    return NextResponse.json({ error: 'Username must be at least 3 characters' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
  }
  if (confirmPassword !== undefined && confirmPassword !== password) {
    return NextResponse.json({ error: 'Passwords do not match' }, { status: 400 })
  }
  // Only allow alphanumeric + underscore usernames
  if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
    return NextResponse.json(
      { error: 'Username may only contain letters, numbers, and underscores' },
      { status: 400 }
    )
  }

  // ── Check for duplicate username ─────────────────────────────────────────
  const [existing] = await pool.execute<RowDataPacket[]>(
    'SELECT id FROM users WHERE username = ?',
    [username.trim().toLowerCase()]
  )
  if (existing.length > 0) {
    return NextResponse.json({ error: 'Username already taken' }, { status: 409 })
  }

  // ── Hash & insert ─────────────────────────────────────────────────────────
  const hash = await bcrypt.hash(password, 10)
  const id   = crypto.randomUUID()

  await pool.execute(
    'INSERT INTO users (id, username, password) VALUES (?, ?, ?)',
    [id, username.trim().toLowerCase(), hash]
  )

  // ── Auto-issue JWT so user is immediately logged in ───────────────────────
  const { token, expiresAt } = await signToken({
    sub: id,
    username: username.trim().toLowerCase(),
  })

  return NextResponse.json(
    {
      token,
      expiresAt,
      user: { id, username: username.trim().toLowerCase() },
      message: 'Account created successfully',
    },
    { status: 201 }
  )
}
