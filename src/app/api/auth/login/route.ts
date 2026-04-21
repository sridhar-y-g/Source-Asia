import { NextRequest, NextResponse } from 'next/server'
import type { RowDataPacket } from 'mysql2/promise'
import bcrypt from 'bcryptjs'
import { initDb } from '@/lib/db-init'
import pool from '@/lib/db'
import { signToken } from '@/lib/jwt'

export async function POST(req: NextRequest) {
  await initDb()

  let body: { username?: unknown; password?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { username, password } = body

  if (
    !username || typeof username !== 'string' ||
    !password || typeof password !== 'string'
  ) {
    return NextResponse.json(
      { error: 'username and password are required strings' },
      { status: 400 }
    )
  }

  // Look up user
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT id, username, password FROM users WHERE username = ?',
    [username.trim()]
  )

  if (!rows.length) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const user = rows[0]
  const valid = await bcrypt.compare(password, user.password as string)

  if (!valid) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const { token, expiresAt } = await signToken({
    sub: user.id as string,
    username: user.username as string,
  })

  return NextResponse.json({
    token,
    expiresAt,
    user: { id: user.id, username: user.username },
    message: 'Login successful',
  })
}
