# 🎟️ Event Discovery & Booking Platform — Project Setup Guide

> Based on: `event_platform_features.md`  
> Stack: **NestJS · Prisma · PostgreSQL · Redis · BullMQ · pnpm · Turborepo · Docker**

---

## 📋 Prerequisites

Before you begin, ensure the following are installed on your machine:

| Tool | Version | Install |
|---|---|---|
| Node.js | v20+ (LTS) | [nodejs.org](https://nodejs.org) |
| pnpm | v9+ | `npm i -g pnpm` |
| Docker Desktop | Latest | [docker.com](https://docker.com) |
| Git | Latest | [git-scm.com](https://git-scm.com) |

Verify:
```bash
node -v       # v20+
pnpm -v       # 9+
docker -v     # Docker version 26+
git --version
```

---

## Phase 1 — Monorepo Scaffolding

### 1.1 Initialize the Monorepo

```bash
mkdir event-platform
cd event-platform
git init
pnpm init
```

### 1.2 Install Turborepo

```bash
pnpm add -D turbo
```

### 1.3 Create Monorepo Directory Structure

```
event-platform/
├── apps/
│   ├── api-gateway/
│   ├── users-service/
│   ├── events-service/
│   ├── bookings-service/
│   ├── payments-service/
│   ├── notifications-service/
│   └── analytics-service/
├── packages/
│   ├── shared/          # Shared DTOs, types, constants
│   ├── prisma/          # Shared Prisma client utilities (optional)
│   └── config/          # Shared config helpers
├── docker/
│   └── docker-compose.yml
├── turbo.json
├── pnpm-workspace.yaml
└── .env.example
```

Create the structure:
```bash
# Create app directories
mkdir -p apps/api-gateway apps/users-service apps/events-service apps/bookings-service apps/payments-service apps/notifications-service apps/analytics-service

# Create shared packages
mkdir -p packages/shared packages/config
```

### 1.4 Configure pnpm Workspace

**`pnpm-workspace.yaml`** (in root):
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### 1.5 Configure Turborepo

**`turbo.json`** (in root):
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "lint": {}
  }
}
```

### 1.6 Root `package.json` Scripts

**`package.json`** (in root):
```json
{
  "name": "event-platform",
  "private": true,
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "docker:up": "docker compose -f docker/docker-compose.yml up -d",
    "docker:down": "docker compose -f docker/docker-compose.yml down"
  },
  "devDependencies": {
    "turbo": "latest"
  }
}
```

---

## Phase 2 — Infrastructure with Docker Compose

> Each service has its own database (Database-per-Service pattern) and a shared Redis instance.

### 2.1 Create `docker/docker-compose.yml`

```yaml
version: '3.9'

services:
  # ─── Databases (one per service) ───────────────────────────
  db-users:
    image: postgres:16-alpine
    container_name: db-users
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: users_db
    ports:
      - "5432:5432"
    volumes:
      - db-users-data:/var/lib/postgresql/data

  db-events:
    image: postgis/postgis:16-3.4-alpine   # PostGIS for geospatial search
    container_name: db-events
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: events_db
    ports:
      - "5433:5432"
    volumes:
      - db-events-data:/var/lib/postgresql/data

  db-bookings:
    image: postgres:16-alpine
    container_name: db-bookings
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: bookings_db
    ports:
      - "5434:5432"
    volumes:
      - db-bookings-data:/var/lib/postgresql/data

  db-payments:
    image: postgres:16-alpine
    container_name: db-payments
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: payments_db
    ports:
      - "5435:5432"
    volumes:
      - db-payments-data:/var/lib/postgresql/data

  db-notifications:
    image: postgres:16-alpine
    container_name: db-notifications
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: notifications_db
    ports:
      - "5436:5432"
    volumes:
      - db-notifications-data:/var/lib/postgresql/data

  db-analytics:
    image: postgres:16-alpine
    container_name: db-analytics
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: analytics_db
    ports:
      - "5437:5432"
    volumes:
      - db-analytics-data:/var/lib/postgresql/data

  # ─── Redis (shared) ────────────────────────────────────────
  redis:
    image: redis:7-alpine
    container_name: redis
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes

volumes:
  db-users-data:
  db-events-data:
  db-bookings-data:
  db-payments-data:
  db-notifications-data:
  db-analytics-data:
  redis-data:
```

### 2.2 Start Infrastructure

```bash
pnpm docker:up
```

Verify all containers are running:
```bash
docker ps
# Should see: db-users, db-events, db-bookings, db-payments, db-notifications, db-analytics, redis
```

---

## Phase 3 — Bootstrap Each NestJS Service

Repeat these steps for **each service** in `apps/`. Example shown for `users-service`:

### 3.1 Scaffold a NestJS App

```bash
cd apps/users-service
npx @nestjs/cli new . --package-manager pnpm --skip-git
```

> Repeat for: `api-gateway`, `events-service`, `bookings-service`, `payments-service`, `notifications-service`, `analytics-service`

### 3.2 Install Common Dependencies (per service)

```bash
# Core NestJS microservices + config
pnpm add @nestjs/microservices @nestjs/config @nestjs/jwt @nestjs/passport

# Validation
pnpm add class-validator class-transformer

# Redis / BullMQ
pnpm add ioredis @nestjs/bullmq bullmq

# Prisma ORM
pnpm add prisma @prisma/client

# Logging
pnpm add pino pino-http nestjs-pino

# Dev
pnpm add -D @types/node ts-node typescript
```

### 3.3 Initialize Prisma per Service

```bash
cd apps/users-service
npx prisma init
```

Set the `DATABASE_URL` in `apps/users-service/.env`:
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/users_db"
```

### 3.4 Configure `main.ts` for Hybrid Server

Each service runs as a **hybrid app** — HTTP for health checks + TCP microservice transport:

**`apps/users-service/src/main.ts`**:
```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // HTTP server (health checks, Swagger)
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('v1');

  // TCP Microservice transport (for inter-service sync calls)
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: 3001, // unique per service
    },
  });

  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 3001);
  console.log(`Users service running on port ${process.env.PORT ?? 3001}`);
}
bootstrap();
```

**Service Port Map:**

| Service | HTTP Port | TCP Port |
|---|---|---|
| api-gateway | 3000 | — |
| users-service | 3001 | 4001 |
| events-service | 3002 | 4002 |
| bookings-service | 3003 | 4003 |
| payments-service | 3004 | 4004 |
| notifications-service | 3005 | 4005 |
| analytics-service | 3006 | 4006 |

---

## Phase 4 — Shared Packages

### 4.1 Create Shared Package

```bash
cd packages/shared
pnpm init
```

**`packages/shared/package.json`**:
```json
{
  "name": "@event-platform/shared",
  "version": "1.0.0",
  "main": "src/index.ts",
  "types": "src/index.ts"
}
```

**`packages/shared/src/index.ts`** — export shared items:
```typescript
// Message patterns for inter-service TCP communication
export const USER_PATTERNS = {
  GET_USER: 'get_user',
  VALIDATE_TOKEN: 'validate_token',
  CREATE_USER: 'create_user',
};

export const EVENT_PATTERNS = {
  GET_EVENT: 'get_event',
  CHECK_CAPACITY: 'check_capacity',
};

// Shared enums
export enum BookingStatus {
  PENDING = 'PENDING',
  AWAITING_PAYMENT = 'AWAITING_PAYMENT',
  CONFIRMED = 'CONFIRMED',
  USED = 'USED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

export enum EventStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ONGOING = 'ONGOING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}
```

Reference it in any service:
```bash
pnpm add @event-platform/shared --workspace
```

---

## Phase 5 — Environment Variables

Create a root `.env.example` to document all env vars:

```env
# ─── Service Ports ──────────────────────────────────
API_GATEWAY_PORT=3000
USERS_SERVICE_PORT=3001
EVENTS_SERVICE_PORT=3002
BOOKINGS_SERVICE_PORT=3003
PAYMENTS_SERVICE_PORT=3004
NOTIFICATIONS_SERVICE_PORT=3005
ANALYTICS_SERVICE_PORT=3006

# ─── Databases ──────────────────────────────────────
USERS_DB_URL=postgresql://postgres:password@localhost:5432/users_db
EVENTS_DB_URL=postgresql://postgres:password@localhost:5433/events_db
BOOKINGS_DB_URL=postgresql://postgres:password@localhost:5434/bookings_db
PAYMENTS_DB_URL=postgresql://postgres:password@localhost:5435/payments_db
NOTIFICATIONS_DB_URL=postgresql://postgres:password@localhost:5436/notifications_db
ANALYTICS_DB_URL=postgresql://postgres:password@localhost:5437/analytics_db

# ─── Redis ──────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ─── Auth ───────────────────────────────────────────
JWT_ACCESS_SECRET=your_super_secret_access_key
JWT_REFRESH_SECRET=your_super_secret_refresh_key
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ─── OAuth ──────────────────────────────────────────
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# ─── Payments ───────────────────────────────────────
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
CHAPA_SECRET_KEY=

# ─── Email ──────────────────────────────────────────
RESEND_API_KEY=

# ─── Storage ────────────────────────────────────────
SUPABASE_URL=
SUPABASE_KEY=
# OR
AWS_S3_BUCKET=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

Copy and fill in real values for each service:
```bash
cp .env.example apps/users-service/.env
cp .env.example apps/events-service/.env
# ... repeat
```

---

## Phase 6 — Recommended Build Order

Follow the order from the feature plan to build incrementally:

### ✅ Step 1 — Users Service (first, because everything depends on auth)
- Prisma schema: `User`, `Session`, `RefreshToken`
- Auth module: Register, Login (JWT access + refresh tokens)
- OAuth module: Google & GitHub via Passport.js
- Redis: Token blacklisting on logout
- Expose TCP message patterns: `get_user`, `validate_token`

### ✅ Step 2 — API Gateway
- Proxy all incoming HTTP requests to the correct microservice via TCP `ClientProxy`
- Auth Guard: Calls `users-service` to validate JWT before forwarding
- Rate limiting: `@nestjs/throttler` backed by Redis
- Swagger aggregation (optional, or per-service)

### ✅ Step 3 — Events Service
- Prisma schema: `Event`, `TicketTier`, `EventCategory`
- CRUD endpoints with lifecycle (`DRAFT → PUBLISHED → ...`)
- Redis caching layer (event listings: 5min TTL, single event: 10min TTL)
- Full-text search using PostgreSQL `tsvector`
- PostGIS-based geospatial "events near me" query

### ✅ Step 4 — Bookings Service
- Prisma schema: `Booking`, `Seat`, `Waitlist`
- Redis distributed seat locking (10-minute lock on checkout start)
- Booking state machine (`PENDING → AWAITING_PAYMENT → CONFIRMED`)
- Group bookings + QR code generation (`qrcode` npm package)
- BullMQ job: release expired seat locks (runs every minute)
- BullMQ job: auto-promote waitlist on cancellation

### ✅ Step 5 — Payments Service
- Prisma schema: `Payment`, `Refund`, `OrganizerPayout`
- Stripe integration + webhook endpoint (`/v1/payments/webhook`)
- Idempotent payment processing (Stripe idempotency keys)
- Chapa integration for Ethiopian market
- BullMQ job: retry failed payments with exponential backoff
- Partial refund logic

### ✅ Step 6 — Notifications Service
- Prisma schema: `Notification`, `NotificationPreference`
- BullMQ consumer: listen for `booking.confirmed`, `event.reminder` events
- Email via Resend with Handlebars templates
- In-app via Server-Sent Events (SSE)
- Notification preferences CRUD

### ✅ Step 7 — Analytics Service
- Prisma schema: `EventView`, `BookingStats`, `DailySnapshot`
- BullMQ cron job: aggregate daily stats at midnight
- API: revenue per event, check-in rates, platform GMV
- Redis cache: analytics snapshots (1h TTL)

### ✅ Step 8 — Production Polish
- Add `pino` structured logging with correlation IDs to all services
- Add `/v1/health` endpoint to each service (check DB + Redis connectivity)
- Add OpenTelemetry tracing (install `@opentelemetry/sdk-node`)
- Add Bull Board UI for queue monitoring (`@bull-board/nestjs`)
- Add graceful shutdown hooks to all services
- Generate Swagger docs (`@nestjs/swagger`) on API Gateway

---

## Phase 7 — Running the Full Stack Locally

### Start infrastructure first:
```bash
pnpm docker:up
```

### Run all services in parallel (via Turborepo):
```bash
pnpm dev
```

### Or run a single service:
```bash
cd apps/users-service
pnpm dev
```

### Run Prisma migrations per service:
```bash
cd apps/users-service
npx prisma migrate dev --name init
```

---

## 🔗 Quick Reference — Key URLs (Local)

| Service | URL |
|---|---|
| API Gateway | http://localhost:3000 |
| Users Service (direct) | http://localhost:3001 |
| Events Service (direct) | http://localhost:3002 |
| Bookings Service (direct) | http://localhost:3003 |
| Payments Service (direct) | http://localhost:3004 |
| Swagger Docs | http://localhost:3000/api-docs |
| Bull Board (queue UI) | http://localhost:3000/admin/queues |
| Redis CLI | `docker exec -it redis redis-cli` |

---

> [!TIP]
> **Build order matters.** Always get the `users-service` + `api-gateway` working first — every other service depends on authenticated requests flowing through the gateway.

> [!IMPORTANT]
> The `events-service` uses the **PostGIS** Docker image (`postgis/postgis`), not the standard Postgres image, to enable geospatial queries. Ensure you use that image and run `CREATE EXTENSION postgis;` after the first migration.

> [!NOTE]
> **Inter-service communication** uses two patterns:
> - **Synchronous** (request/response): TCP transport via NestJS `ClientProxy` — e.g., API Gateway validates a token by calling Users Service over TCP.
> - **Asynchronous** (fire and forget / event-driven): Redis pub/sub via BullMQ — e.g., Bookings Service emits `booking.confirmed`, Notifications Service consumes it.
