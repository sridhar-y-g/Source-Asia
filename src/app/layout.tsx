import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'Rate Limiter API | Source Asia',
  description:
    'Production-grade rate limiting API with per-user request tracking, statistics, and a live interactive dashboard.',
  keywords: ['rate limiter', 'API', 'Next.js', 'Source Asia', 'backend'],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  )
}
