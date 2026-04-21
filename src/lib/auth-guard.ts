/**
 * Auth Guard Helper
 *
 * Call extractUser(req) at the top of any protected route handler.
 * Returns the decoded JWT payload or a ready-to-return 401 NextResponse.
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, type AppJWTPayload } from './jwt'

export async function extractUser(
  req: NextRequest
): Promise<{ user: AppJWTPayload | null; error: NextResponse | null }> {
  const authHeader = req.headers.get('authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    return {
      user: null,
      error: NextResponse.json(
        {
          error: 'Authorization required',
          hint: 'Add header: Authorization: Bearer <token>',
          howToGetToken: 'POST /api/auth/login with { username, password }',
        },
        { status: 401 }
      ),
    }
  }

  const token = authHeader.slice(7)
  try {
    const user = await verifyToken(token)
    return { user, error: null }
  } catch (e: unknown) {
    const isExpired =
      e instanceof Error && e.message.toLowerCase().includes('expired')
    return {
      user: null,
      error: NextResponse.json(
        {
          error: isExpired
            ? 'Token has expired. Please log in again.'
            : 'Invalid or malformed token.',
        },
        { status: 401 }
      ),
    }
  }
}
