/**
 * JWT Utilities — uses `jose` (works with Next.js App Router)
 *
 * Tokens carry: sub (user DB id), username, iat, exp
 */
import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'source-asia-dev-secret-change-in-production'
)

const EXPIRES_IN = '1h'
const EXPIRES_MS = 60 * 60 * 1000 // 1 h in ms

export interface AppJWTPayload extends JWTPayload {
  sub: string
  username: string
}

export async function signToken(
  payload: Pick<AppJWTPayload, 'sub' | 'username'>
): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = Date.now() + EXPIRES_MS
  const token = await new SignJWT(payload as JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(EXPIRES_IN)
    .sign(secret)
  return { token, expiresAt }
}

export async function verifyToken(token: string): Promise<AppJWTPayload> {
  const { payload } = await jwtVerify(token, secret)
  return payload as AppJWTPayload
}
