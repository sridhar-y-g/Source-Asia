# 🚀 Rate Limiter API — Source Asia Backend Assignment

A **production-grade, secure Rate Limiter API** built with Next.js 15, featuring JWT authentication, MySQL persistence, sliding window rate limiting, and a Postman-style interactive dashboard.

🟢 **Live Demo:** [https://source-asia-backend.vercel.app](https://source-asia-backend.vercel.app)

---

## 🧰 Tech Stack

| Technology | Purpose |
|---|---|
| **Next.js 15** (App Router) | Full-stack React framework — API routes + UI |
| **TypeScript** | End-to-end type safety across API and UI |
| **MySQL 8** | Persistent storage — users, requests, and aggregated stats |
| **mysql2** | Node.js MySQL driver with connection pooling |
| **JSON Web Tokens (JWT)** | Stateless authentication via `jose` library |
| **bcryptjs** | Secure password hashing (cost factor 10) |
| **React** | Interactive Postman-style dashboard UI |
| **Tailwind CSS** | Utility-first CSS (base reset + global tokens) |
| **Vanilla CSS / CSS Variables** | Design system — dark theme, animations, JWT color coding |

---

## ✨ Features

### 🔐 Authentication
- **JWT-based security** — All protected routes require a `Bearer <token>` header
- **1-hour token expiry** — Automatically enforced by the `jose` library
- **bcrypt password hashing** — Passwords never stored in plain text
- **User registration** — New users can self-register via `POST /api/auth/register`
- **Auto-login after registration** — JWT issued immediately on account creation
- **Session persistence** — Token stored in `localStorage`, restored on page reload

### ⚡ Rate Limiting
- **5 requests per user per minute** — Sliding window algorithm
- **Per-user async lock** — Prevents TOCTOU race conditions under concurrent load
- **HTTP 429 response** — Includes `Retry-After` and `X-RateLimit-*` headers
- **User-scoped** — Each `user_id` has its own independent limit

### 🗄️ MySQL Persistence
- **`users` table** — Credential store with bcrypt-hashed passwords
- **`requests` table** — Full log of every API call with status and payload
- **`user_stats` table** — Aggregated counters per user (upserted atomically)
- **Auto-initialized** — Tables and seed users created on first API call
- **Connection pooling** — Reuses connections via `mysql2` pool

### 🖥️ Professional Dashboard (Postman-style)
- **API Tester tab** — Select endpoints from a sidebar collection, edit body, and send requests
- **JSON syntax highlighting** — Keys, strings, numbers, booleans, and nulls color-coded
- **JWT Token Visualizer** — Token split into Header / Payload / Signature with `jwt.io` colors
- **Live JWT Decoder** — Inspect header and payload without leaving the browser
- **Token countdown** — Pulsing live timer shows remaining session time
- **Stats tab** — Animated counters and per-user success rate progress bars
- **Docs tab** — Interactive curl examples with copy button per endpoint
- **Toast notifications** — Success, error, warning, and info alerts with auto-dismiss
- **Register / Sign In tabs** — Password strength meter and confirm-password match indicator

---

## 📡 API Reference

### `POST /api/auth/login` — Public
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```
**200 OK:**
```json
{
  "token": "eyJhbGci...",
  "expiresAt": 1700000000000,
  "user": { "id": "uuid", "username": "admin" },
  "message": "Login successful"
}
```

---

### `POST /api/auth/register` — Public
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"newuser","password":"mypass123","confirmPassword":"mypass123"}'
```
**201 Created:** Returns JWT token (user is immediately logged in)

Validation:
- Username: min 3 chars, `[a-zA-Z0-9_]` only
- Password: min 6 chars
- Returns `409 Conflict` if username is already taken

---

### `POST /api/request` — 🔒 JWT Required
```bash
curl -X POST http://localhost:3000/api/request \
  -H "Authorization: Bearer eyJhbGci..." \
  -H "Content-Type: application/json" \
  -d '{"user_id":"user_001","payload":{"action":"fetch_data","query":"products"}}'
```
**200 OK:**
```json
{
  "success": true,
  "requestId": "uuid",
  "userId": "user_001",
  "processedAt": "2025-01-01T00:00:00.000Z",
  "remainingRequests": 4,
  "message": "Request processed successfully"
}
```
**429 Too Many Requests:**
```json
{
  "error": "Rate limit exceeded",
  "userId": "user_001",
  "retryAfter": "60 seconds"
}
```
**Response headers always include:**
```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: <n>
X-RateLimit-Window: 60s
Retry-After: 60   (only on 429)
```

---

### `GET /api/stats` — 🔒 JWT Required
```bash
# All users
curl http://localhost:3000/api/stats \
  -H "Authorization: Bearer eyJhbGci..."

# Single user
curl "http://localhost:3000/api/stats?user_id=user_001" \
  -H "Authorization: Bearer eyJhbGci..."
```
**200 OK:**
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

---

## 🏗️ Rate Limiting Design

### Algorithm: Sliding Window
- Each user has a list of timestamps for recent requests (stored in-memory and persisted to MySQL).
- On every request, timestamps older than **60 seconds** are evicted.
- If the remaining count ≥ 5, the request is rejected with **HTTP 429**.
- Otherwise the timestamp is recorded and the request is allowed.

### Concurrency Safety
Node.js is single-threaded but `async/await` can cause interleaving (TOCTOU) when multiple requests arrive for the same user simultaneously. A **per-user async lock** (promise chaining) serialises the check-and-update critical section per user, while allowing full parallelism across different users.

---

## 🖥️ Project Structure

```
source-asia-backend/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   ├── login/route.ts       # POST /api/auth/login
│   │   │   │   └── register/route.ts    # POST /api/auth/register
│   │   │   ├── request/route.ts         # POST /api/request (JWT protected)
│   │   │   └── stats/route.ts           # GET  /api/stats   (JWT protected)
│   │   ├── page.tsx                     # Postman-style dashboard UI
│   │   ├── layout.tsx
│   │   └── globals.css                  # Design system + animations
│   └── lib/
│       ├── store.ts                     # In-memory sliding window + per-user lock
│       ├── db.ts                        # MySQL connection pool
│       ├── db-init.ts                   # Auto-create tables + seed users
│       ├── persistence.ts               # MySQL read/write helpers
│       ├── jwt.ts                       # Sign + verify JWT (jose)
│       └── auth-guard.ts               # Middleware to extract & validate JWT
├── .env.local                           # Secrets (NOT committed)
├── package.json
└── README.md
```

---

## ⚙️ Environment Variables

Create a `.env.local` file in the project root. For local development, use your local MySQL server. For production on Vercel, use a cloud database like **TiDB Serverless**.

```env
# MySQL Database (Local or Cloud)
DB_HOST=gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com
DB_PORT=4000
DB_USER=Mo6rahpdav5Y9sK.root
DB_PASSWORD=your_cloud_password
DB_NAME=test
DB_SSL=true  # Required for TiDB Serverless and strictly enforced cloud databases

# JWT Authentication
JWT_SECRET=your-super-secret-key-change-in-production

# Rate Limiting
RATE_LIMIT_MAX=5
RATE_LIMIT_WINDOW_MS=60000
```

---

## 🚀 Deployment (Vercel)

This application is fully compatible with Vercel Serverless Functions.

1. **Database:** Standard Vercel limits prohibit connecting to `localhost`. You **must** provision a cloud MySQL database (e.g., TiDB, Aiven, PlanetScale).
2. **Environment Variables:** Provide all the variables listed above into your Vercel Project Settings.
3. **Database Initialization:** Ensure `DB_SSL=true` is set if your provider requires it. The database tables (`users`, `requests`, `user_stats`) will automatically be created on the first API request via the `db-init.ts` logic.

---

## 💻 Getting Started (Local)

### Prerequisites
- **Node.js 18+**
- **MySQL 8** running locally
- Create a database named `Source_Asia` (tables are auto-created on first run)

### Install & Run

```bash
cd source-asia-backend
npm install
npm run dev
```

The server starts at **http://localhost:3000**

### Default Demo Accounts (auto-seeded)

| Username | Password | Role |
|---|---|---|
| `admin` | `admin123` | Administrator |
| `demo` | `demo123` | Demo user |

---

## 🔒 Security Notes

- `.env.local` is excluded from version control via `.gitignore`
- Passwords are hashed with **bcrypt** (cost factor 10) — never stored in plain text
- JWT tokens expire after **1 hour** and are validated on every protected request
- SQL queries use **parameterised statements** to prevent SQL injection

---

## 🏭 Production Considerations

| Concern | Current Approach | Production Recommendation |
|---|---|---|
| Rate limit state | In-memory `Map` | **Redis** with atomic ZADD/ZRANGEBYSCORE |
| Secrets | `.env.local` | Managed secrets (AWS Secrets Manager, Vault) |
| Database | Single MySQL instance | Read replicas + connection pooling (PgBouncer) |
| Scalability | Single process | Horizontal scaling with shared Redis store |
| Auth | 1-hour JWT | Short-lived access token + refresh token rotation |

---

## 📦 Dependencies

```json
{
  "next": "^15.x",
  "react": "^18.x",
  "typescript": "^5.x",
  "mysql2": "^3.x",
  "jose": "^5.x",
  "bcryptjs": "^3.x",
  "tailwindcss": "^4.x"
}
```
