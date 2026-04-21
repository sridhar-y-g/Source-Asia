import { NextRequest, NextResponse } from 'next/server'
import { extractUser } from '@/lib/auth-guard'
import { processRequest } from '@/lib/store'
import { initDb } from '@/lib/db-init'
import { saveRequest, upsertUserStats } from '@/lib/persistence'

export async function POST(req: NextRequest) {
  // ── Auth guard ────────────────────────────────────────────────────────────
  const { user, error } = await extractUser(req)
  if (error) return error

  await initDb()

  let body: { user_id?: unknown; payload?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { user_id, payload } = body

  if (!user_id || typeof user_id !== 'string' || user_id.trim() === '') {
    return NextResponse.json(
      { error: 'user_id is required and must be a non-empty string' },
      { status: 400 }
    )
  }

  const uid = user_id.trim()
  const result = await processRequest(uid, payload)
  const status: 'success' | 'rate_limited' = result.rateLimited ? 'rate_limited' : 'success'

  await Promise.all([
    saveRequest(result.requestId, uid, payload, status),
    upsertUserStats(uid, status),
  ])

  if (result.rateLimited) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        message: 'You have exceeded the limit of 5 requests per minute.',
        userId: uid,
        requestedBy: user!.username,
        retryAfter: '60 seconds',
      },
      {
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Limit': '5',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Window': '60s',
        },
      }
    )
  }

  return NextResponse.json(
    {
      success: true,
      requestId: result.requestId,
      userId: uid,
      requestedBy: user!.username,
      processedAt: result.processedAt,
      remainingRequests: result.remainingRequests,
      message: 'Request processed successfully',
    },
    {
      status: 200,
      headers: {
        'X-RateLimit-Limit': '5',
        'X-RateLimit-Remaining': String(result.remainingRequests),
        'X-RateLimit-Window': '60s',
      },
    }
  )
}
