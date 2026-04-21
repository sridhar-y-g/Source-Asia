# Rate Limiter API — Source Asia Backend Assignment

A production-considerate rate-limiting API built with **Next.js 15** (App Router + Route Handlers).

---

## Features

| Feature | Details |
|---|---|
| `POST /api/request` | Accepts `{ user_id, payload }`, enforces rate limit |
| `GET /api/stats` | Per-user stats; filter with `?user_id=` |
| Rate limit | **5 requests per user per minute** (sliding window) |
| Concurrency | Per-user async lock prevents race conditions |
| Storage | In-memory (`Map`) — no DB required |
| Dashboard | Interactive UI to test and visualize stats |

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Install & Run

```bash
cd source-asia-backend
npm install
npm run dev
```

The server starts at **http://localhost:3000**

### Build for Production

```bash
npm run build
npm start
```

---

## API Reference

### `POST /api/request`

**Request body:**
```json
{
  "user_id": "user_001",
  "payload": { "action": "fetch_data" }
}
```

**200 OK:**
```json
{
  "success": true,
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "user_001",
  "processedAt": "2025-01-01T00:00:00.000Z",
  "remainingRequests": 4,
  "message": "Request processed successfully"
}
```

**429 Too Many Requests** (when limit exceeded):
```json
{
  "error": "Rate limit exceeded",
  "message": "You have exceeded the limit of 5 requests per minute.",
  "userId": "user_001",
  "retryAfter": "60 seconds"
}
```

Response headers always include:
```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: <n>
X-RateLimit-Window: 60s
Retry-After: 60   (only on 429)
```

---

### `GET /api/stats`

Returns all users' stats.

```bash
curl http://localhost:3000/api/stats
```

```json
{
  "totalUsers": 2,
  "stats": [
    {
      "userId": "user_001",
      "totalRequests": 7,
      "successfulRequests": 5,
      "rateLimitedRequests": 2,
      "lastRequestAt": "2025-01-01T00:01:00.000Z"
    }
  ]
}
```

**Filter by user:**

```bash
curl http://localhost:3000/api/stats?user_id=user_001
```

---

## Rate Limiting Design

### Algorithm: Sliding Window
- Each user has a list of timestamps for their recent requests.
- On every request, timestamps older than 60 seconds are evicted.
- If the remaining count >= 5, the request is rejected with HTTP 429.
- Otherwise, the timestamp is recorded and the request is allowed.

### Concurrency Safety
Node.js is single-threaded, so Map mutations don't have true data races. However, async/await can cause interleaving (TOCTOU) if multiple concurrent requests arrive for the same user. To prevent this, a **per-user async lock** (promise chaining) serialises the check-and-update critical section per user while allowing full parallelism across different users.

### Limitations (In-Memory Store)
- **No persistence** — state is lost on server restart.
- **Not horizontally scalable** — each process has its own memory; use Redis for multi-instance deployments.
- **Memory growth** — if users never re-request, their entries accumulate. A periodic cleanup (e.g., setInterval) is recommended at scale.

---

## Bonus: Redis Integration (Recommended for Production)

Replace the in-memory store with Redis using ioredis:

```bash
npm install ioredis
```

Use Redis ZADD + ZREMRANGEBYSCORE for atomic sliding window:

```ts
// Atomic sliding window in Redis
await redis.zremrangebyscore(key, 0, now - windowMs)
const count = await redis.zcard(key)
if (count >= limit) { /* 429 */ }
await redis.zadd(key, now, crypto.randomUUID())
await redis.expire(key, 60)
```

---

## Project Structure

```
source-asia-backend/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── request/route.ts   # POST /api/request
│   │   │   └── stats/route.ts     # GET /api/stats
│   │   ├── page.tsx               # Interactive dashboard
│   │   ├── layout.tsx
│   │   └── globals.css
│   └── lib/
│       └── store.ts               # In-memory store + rate limiter
├── package.json
└── README.md
```

---

## Tech Stack

- **Next.js 15** — App Router + Route Handlers
- **TypeScript** — Full type safety
- **In-memory Maps** — Zero-dependency storage
- **React** — Interactive dashboard UI
