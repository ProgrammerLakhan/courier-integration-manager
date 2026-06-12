# Multi-Courier Integration Platform

A production-grade backend service providing a **unified, courier-agnostic REST API** for logistics operations. Integrates with multiple courier partners (UrbaneBolt, MockCourier) via a pluggable **Strategy + Factory** pattern.

---

## Quick Start

### Prerequisites
- Docker 20+
- Node.js 20 LTS (for local dev without Docker)

### 1. Clone and configure
```bash
git clone <repo-url>
cd courier-integration-manager
cp .env.example .env       # edit values if needed (UAT credentials are pre-filled)
```

### 2. Start infrastructure (PostgreSQL + Redis)
```bash
# Start only the infra services
docker run -d --name courier_postgres \
  -e POSTGRES_DB=courier_db -e POSTGRES_USER=courier_user -e POSTGRES_PASSWORD=courier_pass \
  -p 5432:5432 postgres:16-alpine

docker run -d --name courier_redis -p 6379:6379 redis:7-alpine
```

### 3. Install dependencies and run migrations + seed
```bash
npm install
npm run migration:run    # creates all 6 tables
npm run seed             # seeds ADMIN user + courier providers
```

### 4. Start the development server
```bash
npm run dev
```

Server starts on `http://localhost:3000`. Check `GET /health`.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_USER` | `courier_user` | PostgreSQL user |
| `DB_PASSWORD` | `courier_pass` | PostgreSQL password |
| `DB_NAME` | `courier_db` | PostgreSQL database name |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `JWT_ACCESS_SECRET` | *(required in prod)* | JWT signing secret |
| `JWT_REFRESH_SECRET` | *(required in prod)* | Refresh token signing secret |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token lifetime |
| `ADMIN_EMAIL` | `admin@courier.com` | Seeded admin email |
| `ADMIN_PASSWORD` | `Admin@123456` | Seeded admin password |
| `LOG_LEVEL` | `info` | Winston log level (`debug`/`info`/`warn`/`error`) |
| `LOG_DIR` | `logs` | Directory for rotated log files |
| `BULLMQ_CONCURRENCY` | `10` | Parallel workers for bulk orders |
| `RATE_LIMIT_MAX` | `100` | Global requests per window |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Global rate limit window (15 min) |
| `AUTH_RATE_LIMIT_MAX` | `10` | Auth endpoint requests per window |
| `COURIER_RATE_LIMIT_MAX` | `60` | Courier APIs requests per window |
| `COURIER_RATE_LIMIT_WINDOW_MS` | `60000` | Courier rate limit window (1 min) |
| `URBANEBOLT_BASE_URL` | `https://uat.urbanebolt.in/api/v1` | UrbaneBolt base URL |
| `URBANEBOLT_USERNAME` | `info@urbanebolt.com` | UrbaneBolt credentials |
| `URBANEBOLT_PASSWORD` | `EKIcygsLVV5RCtPZ` | UrbaneBolt credentials |
| `URBANEBOLT_CUSTOMER_CODE` | `UEBCUS0008` | UrbaneBolt account code |

---

## API Overview

### Authentication
All `/api/v1/orders/*` and `/api/v1/batches/*` endpoints require:
```
Authorization: Bearer <access_token>
```

### Auth Endpoints
```
POST /api/v1/auth/register     Register a new user  [ADMIN]
POST /api/v1/auth/login        Get access + refresh tokens
POST /api/v1/auth/refresh      Exchange refresh token for new access token
POST /api/v1/auth/logout       Revoke refresh token
```

### Order Endpoints
```
POST   /api/v1/orders                     Create a single order
GET    /api/v1/orders/:id/track           Track a shipment
POST   /api/v1/orders/:id/cancel          Cancel a shipment  [OPS, ADMIN]
GET    /api/v1/orders/partner/:code       Get orders by courier partner (paginated, sorted, filtered)
POST   /api/v1/orders/bulk                Bulk create up to 100 orders  [OPS, ADMIN]
GET    /api/v1/batches/:batch_id          Poll bulk job status  [OPS, ADMIN]
```

### RBAC Roles
| Role | Capabilities |
|------|-------------|
| `ADMIN` | All operations |
| `OPS` | Create, track, cancel, bulk, view orders by partner |
| `CLIENT` | Create orders, track own orders, view own orders by partner |

---

## Supported Couriers

| Code | Name | Notes |
|------|------|-------|
| `urbanebolt` | UrbaneBolt | UAT environment, token-based auth |
| `mock` | Mock Courier | For testing — always succeeds. Use `FAIL_` prefix in order_id to simulate failure |

---

## How to Add a New Courier

1. **Create the adapter** in `src/couriers/<name>/<name>.adapter.ts`:
```typescript
export class DelhiveryAdapter implements ICourierAdapter {
  readonly courierCode = 'delhivery';

  async createOrder(req: CreateOrderRequest) { /* map to Delhivery API */ }
  async trackOrder(awbNumber: string)        { /* fetch from Delhivery */ }
  async cancelOrder(awbNumber: string)       { /* call Delhivery cancel */ }
}
```

2. **Register it** in `src/couriers/register-adapters.ts` — add one `case`:
```typescript
case 'delhivery':
  CourierFactory.register(new DelhiveryAdapter(provider));
  break;
```

3. **Insert the DB row** (or add to seed script):
```sql
INSERT INTO courier_providers (code, display_name, base_url, auth_type, auth_credentials, ...)
VALUES ('delhivery', 'Delhivery', 'https://track.delhivery.com/api', 'API_KEY', '{"apiKey":"..."}', ...);
```

**Zero other changes required** — no controller, route, service, or DTO changes.

---

## Logs

Logs are written to the `logs/` directory with daily rotation:
- `logs/app-YYYY-MM-DD.log` — all levels, retained 14 days, gzip compressed
- `logs/error-YYYY-MM-DD.log` — errors only, retained 30 days

Every log line includes `requestId`, `userId`, `orderId`, `courierPartner` automatically via `AsyncLocalStorage`.

---

## Project Structure

```
src/
├── config/               # Env-driven config
├── database/
│   ├── entities/         # TypeORM entities (6 tables)
│   ├── migrations/       # Schema migrations
│   └── seeds/            # Seed script
├── couriers/
│   ├── interfaces/       # ICourierAdapter + DTOs
│   ├── factory.ts        # CourierFactory (Strategy + Factory)
│   ├── register-adapters.ts
│   ├── urbanebolt/       # UrbaneBolt adapter + token manager
│   └── mock/             # MockCourier adapter
├── modules/
│   ├── auth/             # JWT auth, RBAC, AuthService
│   └── orders/           # OrderService, BulkOrderService, BullMQ worker
└── shared/
    ├── context/          # RequestContext (AsyncLocalStorage)
    ├── errors/           # AppError, CourierError, error codes
    ├── http/             # Axios factory (retry + backoff)
    ├── logger/           # Winston + daily-rotate-file
    └── middleware/       # errorHandler, rateLimiter, requestLogger
```
