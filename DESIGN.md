# Design Document — Multi-Courier Integration Platform

## 1. Problem Statement

An e-commerce logistics backend must integrate with multiple courier partners (UrbaneBolt today, Delhivery/Shiprocket/Bluedart tomorrow). Each courier has a different API shape, authentication method, and error vocabulary. The platform must:

- Abstract all courier differences behind a single, uniform REST API
- Support high-concurrency bulk order processing without blocking the HTTP thread
- Guarantee idempotency — no duplicate shipments even under retry storms
- Track every operation with full auditability (who created, who cancelled, when, why)
- Be extensible — adding a new courier must require **zero** changes to business logic

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                        HTTP Layer                            │
│  helmet + CORS + JSON body parser                            │
│  RequestContext (AsyncLocalStorage) — seeds requestId        │
│  Rate Limiter (Redis-backed): global 100/15min, auth 10/15m  │
└──────────────────────┬───────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────┐
│                   Auth Middleware                             │
│  jwtAuthMiddleware → verifies Bearer token, attaches req.user│
│  rbac(...roles)    → role-based access control               │
└──────────────────────┬───────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────┐
│               Order / Batch Controllers                       │
│  Thin layer: Zod parse → service call → normalize response   │
└──────────────────────┬───────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────┐
│                    Order Service                              │
│  Idempotency check → CourierFactory.getAdapter() →           │
│  adapter.createOrder() → DB persist → TrackingEvent append   │
└────────────┬──────────────────────────┬──────────────────────┘
             │                          │
┌────────────▼──────────┐   ┌───────────▼──────────────────────┐
│    CourierFactory      │   │        BulkOrderService           │
│  (Strategy + Factory)  │   │  Validate all → enqueue valid     │
│  getAdapter(code)      │   │  to BullMQ → return batch_id     │
└────────────┬──────────┘   └───────────┬──────────────────────┘
             │                          │
┌────────────▼──────────┐   ┌───────────▼──────────────────────┐
│  ICourierAdapter       │   │      BulkOrderWorker (BullMQ)     │
│  ┌─ UrbaneBolt ──────┐ │   │  concurrency=10, processes jobs  │
│  │  TokenManager     │ │   │  updates BatchJob.results[]      │
│  │  HTTP client      │ │   └──────────────────────────────────┘
│  └───────────────────┘ │
│  ┌─ MockCourier ─────┐ │
│  └───────────────────┘ │
└───────────────────────┘
```

---

## 3. Key Design Decisions

### 3.1 Strategy + Factory Pattern for Couriers

**Problem:** Each courier has a different API, auth method, and payload shape.

**Solution:** Every courier implements `ICourierAdapter`:
```typescript
interface ICourierAdapter {
  createOrder(req: CreateOrderRequest): Promise<{ courierOrderId, awbNumber, rawResponse }>
  trackOrder(awbNumber: string):        Promise<{ currentStatus, events, rawResponse }>
  cancelOrder(awbNumber: string):       Promise<{ success, rawResponse }>
}
```

`CourierFactory.getAdapter(code)` resolves the adapter at runtime. Adding a new courier = **one new class + one switch case + one DB row**. Zero changes to controllers, services, or routes.

---

### 3.2 DB-Driven Courier Configuration

All per-courier configuration lives in the `courier_providers` table:

| Column | Purpose |
|--------|---------|
| `base_url` | API base URL |
| `auth_type` | `BEARER_TOKEN` / `API_KEY` / `NONE` |
| `auth_endpoint` | Login/token endpoint |
| `auth_credentials` | Username/password or API key (JSONB, encrypted at rest in prod) |
| `timeout_ms` | Per-request timeout |
| `max_retries` | Retry count |
| `retry_backoff_ms` | Initial backoff delay |
| `retry_backoff_multiplier` | Exponential multiplier |
| `max_backoff_ms` | Backoff ceiling |
| `extra_config` | Courier-specific fields (e.g. `customerCode`) |

This means courier config changes (new URL, new credentials, retry tuning) **do not require a code deploy**.

---

### 3.3 Atomic Idempotency via DB UNIQUE Constraint

The `orders.external_order_id` column has a `UNIQUE` index. On duplicate:
1. Our service layer does an optimistic check first → returns clean `409 DUPLICATE_ORDER`
2. Even if two concurrent requests race through, the DB constraint is the ultimate safety net — only one `INSERT` succeeds

This is safer than application-level locking because it works across multiple app instances.

---

### 3.4 Pre-Failure Order Persistence

On `createOrder`, the order is saved to DB with `status=CREATED` **before** calling the courier API. This means:
- If the courier call fails → order has `status=FAILED` with `failureReason` stored for debugging
- If the app crashes mid-call → order record exists and can be reconciled
- Audit trail is never lost

---

### 3.5 RequestContext via AsyncLocalStorage

Every incoming request seeds an `AsyncLocalStorage` store with:
```typescript
{ requestId, userId, userRole, orderId, courierPartner }
```

The Winston logger reads this store on **every** log call — no need to pass IDs down through every function signature. The assignment requirement _"every failure must log order_id and courier_partner"_ is satisfied automatically.

---

### 3.6 Bulk Order Processing (Fire-and-Forget)

```
POST /api/v1/orders/bulk
  → Zod-validate ALL orders synchronously
  → Invalid orders: immediate results in response (INVALID status)
  → Valid orders: enqueued to BullMQ, return 202 + batch_id
  → Worker processes concurrently (default: 10 parallel)
  → Client polls GET /api/v1/batches/:batch_id for status
```

**Why BullMQ?**
- Processes up to 1000s of orders without blocking HTTP thread
- Built-in retry with exponential backoff per job
- Redis persistence — jobs survive app restarts
- BullMQ `jobId` = `batchId:orderId` prevents duplicate job enqueue

**Crash Recovery & Stalled Jobs:**
- **Redis Persistence:** Ensures that enqueued jobs are never lost in memory if the application process crashes or restarts.
- **Stalled Job Detection:** BullMQ automatically monitors active jobs. If a worker process terminates abruptly, the job will be flagged as stalled and automatically moved back to the wait queue to be picked up by a restarted worker.
- **Idempotency Safeguard:** Since the order creation workflow enforces a DB-level uniqueness constraint on `external_order_id` and checks this before invoking the courier API, any re-attempted batch job will safely ignore already-processed orders and only process those that had not yet succeeded, preventing double-manifestation.

---

### 3.7 JWT Authentication + RBAC

| Token | Lifetime | Storage |
|-------|----------|---------|
| Access token | 15 min (configurable) | Client memory / Authorization header |
| Refresh token | 7 days (configurable) | DB (`refresh_tokens` table, hashed with bcrypt) |

**Security choices:**
- Refresh tokens are **hashed** in DB (bcrypt) — a DB breach doesn't expose live tokens
- Login response uses generic `INVALID_CREDENTIALS` — no email enumeration
- `jwtAuthMiddleware` enriches `RequestContext` with `userId` + `userRole`

**Role matrix:**

| Endpoint | ADMIN | OPS | CLIENT |
|----------|-------|-----|--------|
| Register | ✅ | ✅ | ✅ |
| Create order | ✅ | ✅ | ✅ |
| Track order | ✅ | ✅ | ✅ |
| Cancel order | ✅ | ✅ | ❌ |
| Bulk orders | ✅ | ✅ | ❌ |
| Batch status | ✅ | ✅ | ❌ |
| Get orders by partner | ✅ | ✅ | ✅ (Own only) |

---

### 3.8 Rate Limiting (DDoS / Brute-force Protection)

Three layers, all backed by Redis (survives restarts, works across multiple instances):

| Limiter | Route | Limit |
|---------|-------|-------|
| Global | All `/api/*` | 100 req / 15 min / IP |
| Auth | `POST /auth/login`, `POST /auth/refresh` | 10 req / 15 min / IP |
| Register | `POST /auth/register` | 5 req / 1 hour / IP |

All 429 responses use the same normalized error shape as all other errors.

---

### 3.9 UrbaneBolt Token Management

The `UrbaneBoltTokenManager` keeps a single token in memory with a 55-minute TTL (tokens expire at 60 min — conservative buffer):

- **Proactive**: `getToken()` checks cache before making any API call
- **Reactive**: Axios interceptor catches 401, calls `refreshToken()`, retries once
- **Concurrent-safe**: Multiple simultaneous 401s share a single `refreshPromise` — only one HTTP call goes to the auth endpoint

---

## 4. Database Schema

```
users ←─────────────── refresh_tokens
  │                          
  │ (created_by)        
  ▼                     
orders ─────────────── tracking_events (append-only)
  │                     
  │ (batch_id)          
  ▼                     
batch_jobs              
                        
courier_providers ◄─── orders (via courier_partner code)
```

All tables use `UUID` primary keys (`gen_random_uuid()`). All timestamps are `TIMESTAMPTZ`.

---

## 5. Error Response Shape

Every error response — validation, auth, courier, rate limit, 500 — uses one shape:

```json
{
  "success": false,
  "error": {
    "code":       "COURIER_UNAVAILABLE",
    "message":    "Courier service unavailable after 3 retries",
    "details":    null,
    "request_id": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp":  "2025-01-15T10:30:00.000Z"
  }
}
```

Raw courier responses are **never** forwarded to the client — they are stored in `orders.courier_response_payload` for internal debugging only.

---

## 6. Production Readiness Checklist

| Feature | Implementation |
|---------|---------------|
| Structured logging | Winston JSON format with context injection |
| Log rotation | `winston-daily-rotate-file` (14d combined, 30d errors) |
| Distributed rate limiting | Redis-backed `rate-limit-redis` |
| Security headers | `helmet` middleware |
| Idempotency | DB-level UNIQUE constraint + optimistic check |
| Graceful shutdown | SIGTERM/SIGINT → close HTTP → stop worker → close DB → quit Redis |
| Health check | `GET /health` (unauthenticated, used by Docker HEALTHCHECK) |
| Retry + backoff | Configurable per courier in DB, exponential with ceiling |
| Audit trail | `created_by`, `cancelled_by` on every order |
| Token security | Bcrypt-hashed refresh tokens in DB |
