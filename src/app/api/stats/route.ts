import { NextRequest, NextResponse } from 'next/server'
import { extractUser } from '@/lib/auth-guard'
import { initDb } from '@/lib/db-init'
import { getAllUserStats, getSingleUserStats } from '@/lib/persistence'

export async function GET(req: NextRequest) {
  const { user, error } = await extractUser(req)
  if (error) return error

  await initDb()

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('user_id')

  if (userId) {
    const stats = await getSingleUserStats(userId.trim())
    if (!stats) {
      return NextResponse.json(
        { error: `No data found for user_id: ${userId}` },
        { status: 404 }
      )
    }
    return NextResponse.json({ stats, queriedBy: user!.username })
  }

  const stats = await getAllUserStats()
  return NextResponse.json({
    totalUsers: stats.length,
    stats,
    queriedBy: user!.username,
  })
}
