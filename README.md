# 🚀 Rate Limiter API & Dashboard — Source Asia Backend Assignment

A **production-grade, secure Rate Limiter API** built with Next.js 15, featuring JWT authentication, MySQL persistence, a sliding window rate limiting algorithm, and a beautiful Postman-style dashboard.

🟢 **Live Demo:** [https://source-asia-backend.vercel.app](https://source-asia-backend.vercel.app)

---

## 🏃‍♂️ Steps to run the project (Local Development)

### Prerequisites
- **Node.js 18+** installed.
- **MySQL 8** running locally (or use the provided TiDB Cloud credentials).

### 1. Clone & Install
```bash
git clone https://github.com/sridhar-y-g/Source-Asia.git
cd source-asia-backend
npm install
```

### 2. Environment Variables
Create a file named `.env.local` in the root directory. Paste the following configuration:

```env
# MySQL Database (TiDB Cloud Serverless)
DB_HOST=gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com
DB_PORT=4000
DB_USER=Mo6rahpdav5Y9sK.root
DB_PASSWORD=VR178AOy5dQvc4pH
DB_NAME=test
DB_SSL=true

# JWT Authentication
JWT_SECRET=super-secret-key-2026-asiabackend

# Rate Limiting
RATE_LIMIT_MAX=5
RATE_LIMIT_WINDOW_MS=60000
```

### 3. Run the Development Server
```bash
npm run dev
```

The server will start at **http://localhost:3000**.
*(Note: Do not worry about database migrations. On the very first API hit, the `db-init.ts` script automatically creates all required tables and seeds default demo accounts).*

### Default Demo Accounts
| Username | Password |
|---|---|
| `admin` | `admin123` |
| `demo` | `demo123` |

---

## 🧠 Design Decisions

#### 1. Full-Stack Next.js 15 Environment
Choosing Next.js with App Router allowed both the backend API layer (`/api/request`, `/api/stats`, `/api/auth`) and the interactive frontend dashboard to live cohesively in a single repository. This significantly simplified deployment to Vercel and removed the need for cross-origin (CORS) complexities.

#### 2. Sliding Window Rate Limiting Algorithm
Instead of a simple "Fixed Window" (which is susceptible to burst traffic at window boundaries), a **Sliding Window** algorithm was implemented. The system records the precise timestamp of every request. When evaluating a new request, it evicts timestamps older than 60 seconds. This guarantees a mathematically accurate `max` requests over any `windowMs` rolling timeframe.

#### 3. Concurrency Safety Model (Per-User Async Lock)
Because Node.js is asynchronous, high-concurrency requests from the same user could cause a "Time-of-Check to Time-of-Update" (TOCTOU) race condition—allowing a user to bypass limits by sending 10 requests simultaneously. To solve this, a **per-user async mutex** (a Promise chain) was designed. This ensures that the `check-and-update` step for a specific user is strictly serialized, while requests from *different* users remain fully parallelized for high throughput.

#### 4. JWT Authentication (Jose)
For stateless, fast authentication, APIs are secured with JSON Web Tokens via the highly optimized `jose` edge-compatible library. The system creates a 1-hour session token encoded with the `user_id`. The dashboard captures this and injects it into the HTTP header (`Authorization: Bearer <token>`) flawlessly, just like Postman. 

#### 5. Persistence Layer (MySQL connection pool)
While rate-limit state evaluates entirely in-memory for zero-latency checks, a background persistence hook is fired (`persistence.ts`) parallel to the API response. This logs the request and bumps the analytics counters in a MySQL database so that aggregate statistics survive server restarts. We utilized `mysql2` with a module-singleton connection pool to prevent exhausting connections during hot-reloads.

#### 6. Premium Postman-style UI/UX
Developers use APIs daily. I designed a highly authentic, visually premium dashboard reminiscent of Postman to test the endpoints. It features JSON-syntax highlighting, dynamic JWT rendering (broken out into color-coded header/payload/signature), strength bars on password creation, and real-time toast notifications, crafted completely with Vanilla CSS variables and Tailwind.

---

## 🔮 What you would improve with more time

If granted more time or if transitioning this proof-of-concept into high-scale production, I would prioritize:

1. **Redis Enterprise Integration:**
   - **Current:** The Sliding Window state runs in-process. If deployed to multiple instances (horizontal scaling), the rate limit acts *per-instance* rather than globally.
   - **Improvement:** Migrate the rate limit store to **Redis**. I would utilize an atomic Redis `lua` script implementing `ZREMRANGEBYSCORE` and `ZADD` to maintain a globally enforced, atomic sliding window across all server instances.

2. **Database Read Replicas & CQRS:**
   - **Current:** `GET /api/stats` executes queries against the same MySQL instance accepting writes (`POST /api/request`).
   - **Improvement:** Implement Command Query Responsibility Segregation (CQRS) by routing asynchronous analytic updates into a message queue (e.g., Kafka/RabbitMQ) and serving the `stats` dashboard queries strictly from geographically distributed read-replicas to ensure the core operational API is never dragged down by analytical workloads.

3. **Refresh Token Rotation:**
   - **Current:** JWTs expire after 1 hour, requiring hard re-authentication.
   - **Improvement:** Implement an Oauth2-style short-lived Access Token (15 mins) paired with a persistent, revocable Refresh Token stored as an `httpOnly` secure cookie.

4. **Automated Unit & E2E Testing:**
   - **Improvement:** Write robust unit tests via **Jest** simulating TOCTOU concurrency blasts on the rate limiter logic to mathematically prove limit adherence. Add End-to-End browser tests utilizing **Playwright** to test the complete user registration/login flow.

---

## 📡 API Reference Reference 

| Endpoint | Method | Security | Purpose |
|---|---|---|---|
| `/api/auth/register` | `POST` | Public | Create new user, securely hash password using bcrypt, auto-issue JWT |
| `/api/auth/login` | `POST` | Public | Validate bcrypt hash, return active JWT session |
| `/api/request` | `POST` | JWT Required | Protected Mock API that is mathematically guarded by the Sliding Window limiter |
| `/api/stats` | `GET` | JWT Required | Returns global analytics & counters for all users |

*Comprehensive header behaviors (like `X-RateLimit-Remaining` and `Retry-After`) and detailed JSON schemas are handled gracefully on the live UI Dashboard.*
