# Multi-Event SaaS Platform - System Architecture

## Executive Summary

This document defines the technical architecture for EventFlow Pro, a multi-tenant SaaS platform supporting 10K+ concurrent guests across multiple event types. The architecture prioritizes scalability, security, real-time performance, and developer productivity.

---

## Architecture Overview

### Architectural Pattern: Modular Monolith with Microservices Evolution

**Rationale**: 
- Start with modular monolith for faster development and simpler deployment
- Clear module boundaries enable future microservices extraction
- Reduces operational complexity in early stages
- Single database simplifies transactions and consistency

**Future Evolution Path**:
- Phase 1 (Months 1-6): Modular monolith
- Phase 2 (Months 7-12): Extract high-load services (QR validation, real-time chat)
- Phase 3 (Year 2+): Full microservices for scale

---

## High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                                   │
├──────────────────────┬──────────────────────┬──────────────────────────┤
│   Next.js Web App    │   React Native App   │    Third-Party Clients   │
│   (Vercel CDN)       │   (Expo EAS)         │    (API Consumers)       │
└──────────┬───────────┴──────────┬───────────┴────────────┬─────────────┘
           │                      │                         │
           │ HTTPS                │ HTTPS                   │ HTTPS
           │ WebSocket            │ WebSocket               │ API Keys
           ▼                      ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         API GATEWAY LAYER                                │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │              Cloudflare Workers / NGINX                          │  │
│  │  • Rate Limiting (10K req/hr free, 100K Pro, 1M Enterprise)     │  │
│  │  • DDoS Protection                                               │  │
│  │  • Request Validation                                            │  │
│  │  • SSL Termination                                               │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        APPLICATION LAYER                                 │
│                    (Render.com / AWS ECS)                                │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                  Node.js 20 + Express + TypeScript               │  │
│  │  ┌────────────┬────────────┬────────────┬────────────┐          │  │
│  │  │   Auth     │   Event    │   Guest    │   Payment  │          │  │
│  │  │   Module   │   Module   │   Module   │   Module   │          │  │
│  │  └────────────┴────────────┴────────────┴────────────┘          │  │
│  │  ┌────────────┬────────────┬────────────┬────────────┐          │  │
│  │  │    RSVP    │  Check-in  │   Chat     │  Analytics │          │  │
│  │  │   Module   │   Module   │   Module   │   Module   │          │  │
│  │  └────────────┴────────────┴────────────┴────────────┘          │  │
│  │  ┌────────────┬────────────┬────────────┬────────────┐          │  │
│  │  │   Photo    │  Waitlist  │   Theme    │   Notify   │          │  │
│  │  │   Module   │   Module   │   Engine   │   Module   │          │  │
│  │  └────────────┴────────────┴────────────┴────────────┘          │  │
│  │                                                                   │  │
│  │  • Socket.io Server (Real-time)                                  │  │
│  │  • BullMQ Job Queue (Background Tasks)                           │  │
│  │  • Winston Logging                                               │  │
│  │  • Zod Validation                                                │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         DATA LAYER                                       │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐            │
│  │ Neon Postgres  │  │  Upstash Redis │  │   Cloudinary   │            │
│  │   (Primary DB) │  │   (Cache/PubSub)│  │  (Media CDN)   │            │
│  │  • Row-Level   │  │  • Session     │  │  • Images      │            │
│  │    Security    │  │  • Real-time   │  │  • Videos      │            │
│  │  • Read        │  │    Pub/Sub     │  │  • Transform   │            │
│  │    Replicas    │  │  • Rate Limit  │  │  • Optimize    │            │
│  │  • Connection  │  │  • Job Queue   │  │  • Deliver     │            │
│  │    Pooling     │  │  • Caching     │  │                │            │
│  └────────────────┘  └────────────────┘  └────────────────┘            │
└─────────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      EXTERNAL SERVICES                                   │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐       │
│  │   Stripe   │  │   Twilio   │  │   Clerk    │  │ SendGrid   │       │
│  │  Payments  │  │ SMS/WhatsApp│  │   Auth     │  │   Email    │       │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack Decisions

### Backend Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Runtime | Node.js 20 LTS | Async I/O for real-time features, large ecosystem |
| Framework | Express 4.x | Lightweight, flexible, proven at scale |
| Language | TypeScript 5.4 | Type safety, better DX, fewer runtime errors |
| ORM | Prisma 5.x | Type-safe queries, migrations, excellent DX |
| Database | PostgreSQL 16 (Neon) | ACID compliance, JSONB flexibility, serverless scaling |
| Cache/PubSub | Redis (Upstash) | Sub-millisecond latency, serverless pricing |
| Real-time | Socket.io 4.x | Automatic reconnection, rooms, fallback transports |
| Validation | Zod | Runtime type checking, schema inference |
| Logging | Winston + Papertrail | Structured logging, log aggregation |
| Job Queue | BullMQ | Redis-based, priority queues, rate limiting |
| Auth | Clerk | Pre-built UI components, MFA, session management |
| Payments | Stripe Connect | Multi-party payments, global support, compliance |
| SMS/WhatsApp | Twilio | Global reach, reliable delivery, WhatsApp Business API |
| Email | SendGrid | High deliverability, templates, analytics |

### Frontend Stack (Web)

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Framework | Next.js 14.2 (App Router) | SSR/SSG, optimized performance, SEO |
| Language | TypeScript 5.4 | Type safety across full stack |
| Styling | Tailwind CSS 3.4 + shadcn/ui | Rapid development, consistent design system |
| Animations | Framer Motion 11 | Declarative animations, gesture support |
| State Management | React Query 5 / tRPC | Server state caching, optimistic updates |
| File Upload | Uploadthing | Secure uploads, progress tracking |
| i18n | i18next | Comprehensive translation ecosystem |
| Forms | React Hook Form + Zod | Performance, validation integration |
| Charts | Recharts | Composable, responsive, accessible |

### Mobile Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Framework | React Native 0.75 + Expo 51 | Cross-platform, fast iteration, OTA updates |
| Navigation | Expo Router | File-based routing, deep linking |
| Build | EAS Build | Cloud builds, custom config |
| Storage | AsyncStorage + Realm | Offline-first, encrypted storage |
| Real-time | Socket.io-client | Consistent with backend |
| QR Scanner | Expo QR Scanner | Native performance, easy integration |
| Push Notifications | Expo Push | Unified API for iOS/Android |
| Camera | Expo Camera | QR scanning, photo uploads |

### Infrastructure Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Hosting (Backend) | Render.com | Simple deployment, auto-scaling, PostgreSQL included |
| Hosting (Frontend) | Vercel | Edge network, instant deploys, preview environments |
| Mobile Distribution | Expo EAS | OTA updates, app store submissions |
| Database | Neon Postgres | Serverless, branching, connection pooling |
| Cache | Upstash Redis | Serverless, per-request pricing |
| Media CDN | Cloudinary | Image optimization, transformations, global CDN |
| Monitoring | Sentry + DataDog | Error tracking, APM, real-user monitoring |
| CI/CD | GitHub Actions | Native GitHub integration, reusable workflows |

---

## Scalability Architecture

### Horizontal Scaling Strategy

**Application Tier**:
- Stateless application servers behind load balancer
- Auto-scaling based on CPU/memory metrics (threshold: 70%)
- Minimum 2 instances for high availability
- Maximum 20 instances for cost control

**Database Tier**:
- Primary writer instance (Neon Standard plan)
- 2 read replicas for analytics and reporting queries
- Connection pooling (PgBouncer) to handle 10K+ connections
- Query optimization with indexes on high-traffic tables

**Caching Strategy**:
```
┌─────────────────────────────────────────────────────┐
│                 Caching Layers                       │
├─────────────────────────────────────────────────────┤
│  L1: Browser Cache (static assets, API responses)   │
│      • Service Worker for offline capability        │
│      • Cache-Control headers (max-age: 3600)        │
├─────────────────────────────────────────────────────┤
│  L2: CDN Cache (Cloudflare + Cloudinary)            │
│      • Static assets: images, JS, CSS               │
│      • API responses (public endpoints)             │
├─────────────────────────────────────────────────────┤
│  L3: Redis Cache (Upstash)                          │
│      • Session data (JWT blacklist)                 │
│      • Real-time presence (online users)            │
│      • Rate limit counters                          │
│      • Frequently accessed data (event themes)      │
├─────────────────────────────────────────────────────┤
│  L4: Database Query Cache                           │
│      • Materialized views for analytics             │
│      • Prepared statements                          │
└─────────────────────────────────────────────────────┘
```

### 10K+ Concurrent Guest Scale Plan

**Scenario**: Conference with 10,000 guests checking in over 2 hours

**Load Profile**:
- Peak check-in rate: 150 guests/minute (2.5/sec)
- API requests: ~50 req/sec (including mobile app polling)
- WebSocket connections: 3,000 concurrent (staff + engaged guests)
- Database writes: 100/min (check-ins, RSVPs)

**Capacity Planning**:
```
Component              Required Capacity     Scaling Trigger
─────────────────────────────────────────────────────────────
App Instances          4 → 8 instances       CPU > 70%
Database Connections   500 pooled            Connection wait > 100ms
Redis Throughput       10K ops/sec           Latency > 5ms
WebSocket Servers      2 → 4 servers         Connections > 2K
Bandwidth              100 Mbps              Throughput > 80%
```

**Optimization Techniques**:
1. **Database**: 
   - Indexes on `guests.event_id`, `rsvps.guest_id`, `checkins.timestamp`
   - Partition `checkins` table by month for time-series data
   - Materialized views for analytics (refresh every 5 minutes)

2. **API**:
   - Response compression (gzip)
   - Pagination on all list endpoints (default: 50, max: 500)
   - Field selection (`?fields=id,name,email`) to reduce payload

3. **Real-time**:
   - Socket.io horizontal scaling with Redis adapter
   - Room-based broadcasting (per-event rooms)
   - Message throttling (max 10 messages/sec per user)

4. **Mobile**:
   - Offline-first architecture with conflict resolution
   - Batched sync when connection restored
   - Image lazy loading and compression

---

## Security Architecture

### Authentication & Authorization

**Authentication Flow**:
```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Client  │────▶│  Clerk   │────▶│  Backend │────▶│ Database │
│          │     │  Auth    │     │  API     │     │          │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
     │                │                │                │
     │ 1. Login       │                │                │
     │───────────────▶│                │                │
     │                │                │                │
     │ 2. JWT Token   │                │                │
     │◀───────────────│                │                │
     │                │                │                │
     │ 3. API Request │                │                │
     │ + JWT          │                │                │
     │───────────────────────────────▶│                │
     │                │                │                │
     │                │ 4. Verify JWT  │                │
     │                │◀───────────────│                │
     │                │                │                │
     │                │ 5. Query User  │                │
     │                │───────────────────────────────▶│
     │                │                │                │
     │                │ 6. User Data   │                │
     │                │◀───────────────────────────────│
     │                │                │                │
     │ 7. Response    │                │                │
     │◀───────────────────────────────│                │
```

**Security Measures**:
- JWT with short expiry (15 minutes) + refresh tokens (7 days)
- Token blacklisting on logout (Redis)
- MFA enforcement for organization owners
- Password requirements: 12+ chars, complexity rules
- OAuth 2.0 for Google/Microsoft login
- Session fixation prevention (token rotation)

**Authorization Model**:
```yaml
Roles:
  Owner:
    - Full access to organization
    - Can delete organization
    - Manage billing
    - Assign/revoke any role
  
  Admin:
    - CRUD on all events
    - Manage team members (except Owner)
    - View analytics
    - Cannot delete organization or change billing
  
  Organizer:
    - CRUD on assigned events only
    - Manage guests, RSVPs, check-ins
    - Cannot access billing or team settings
  
  Viewer:
    - Read-only access to assigned events
    - View analytics (no export)
    - No modification permissions

Permission Matrix:
  Resource          | Owner | Admin | Organizer | Viewer
  ------------------|-------|-------|-----------|--------
  Delete Org        | ✓     | ✗     | ✗         | ✗
  Billing           | ✓     | ✗     | ✗         | ✗
  Team Management   | ✓     | ✓     | ✗         | ✗
  Create Event      | ✓     | ✓     | ✗         | ✗
  Edit Any Event    | ✓     | ✓     | Limited   | ✗
  Delete Event      | ✓     | ✓     | Own only  | ✗
  Manage Guests     | ✓     | ✓     | ✓         | ✗
  Check-in Guests   | ✓     | ✓     | ✓         | ✗
  View Analytics    | ✓     | ✓     | ✓         | ✓ (read-only)
  Export Data       | ✓     | ✓     | ✗         | ✗
```

### Data Protection

**Encryption**:
- At rest: AES-256 (Neon automatic encryption)
- In transit: TLS 1.3 (enforced)
- Sensitive fields (phone, dietary): Application-level encryption

**Data Isolation**:
- Row-Level Security (RLS) policies in PostgreSQL
- Organization ID on every row (multi-tenancy)
- Query middleware to enforce org scoping

**Audit Logging**:
- All write operations logged (who, what, when, IP)
- Logs retained for 1 year (compliance)
- Immutable audit trail (append-only)

### API Security

**Rate Limiting**:
```javascript
// Tier-based rate limits
const rateLimits = {
  free: { requests: 10000, window: '1h' },
  pro: { requests: 100000, window: '1h' },
  enterprise: { requests: 1000000, window: '1h' }
};
```

**Input Validation**:
- Zod schemas for all request bodies
- SQL injection prevention (Prisma parameterized queries)
- XSS prevention (output encoding, CSP headers)
- CSRF protection (SameSite cookies, CSRF tokens)

**DDoS Protection**:
- Cloudflare WAF (Web Application Firewall)
- Automatic IP blocking after 100 failed requests/minute
- Geographic rate limiting (block high-risk regions if needed)

---

## API Design

### RESTful API Structure

```
Base URL: https://api.eventflow.pro/v1

Authentication Endpoints:
  POST   /auth/login              # Email/password login
  POST   /auth/register           # Organization registration
  POST   /auth/refresh            # Refresh access token
  POST   /auth/logout             # Invalidate tokens
  POST   /auth/forgot-password    # Password reset request
  POST   /auth/reset-password     # Password reset confirmation

Organization Endpoints:
  GET    /org                     # Get current org
  PUT    /org                     # Update org
  DELETE /org                     # Delete org (Owner only)
  GET    /org/team                # List team members
  POST   /org/team/invite         # Invite team member
  DELETE /org/team/:userId        # Remove team member

Event Endpoints:
  GET    /events                  # List all events (paginated)
  POST   /events                  # Create event
  GET    /events/:id              # Get event details
  PUT    /events/:id              # Update event
  DELETE /events/:id              # Delete event
  GET    /events/:id/theme        # Get theme config
  PUT    /events/:id/theme        # Update theme
  POST   /events/:id/publish      # Publish draft event
  POST   /events/:id/duplicate    # Duplicate event

Guest Endpoints:
  GET    /events/:eventId/guests          # List guests
  POST   /events/:eventId/guests          # Create guest
  POST   /events/:eventId/guests/bulk     # Bulk import
  GET    /events/:eventId/guests/:id      # Get guest
  PUT    /events/:eventId/guests/:id      # Update guest
  DELETE /events/:eventId/guests/:id      # Delete guest
  GET    /events/:eventId/guests/:id/qr   # Get QR code
  POST   /events/:eventId/guests/:id/qr/regenerate

RSVP Endpoints:
  GET    /events/:eventId/rsvps           # List RSVPs
  POST   /events/:eventId/rsvps           # Create/update RSVP
  GET    /events/:eventId/rsvps/stats     # RSVP statistics
  POST   /events/:eventId/rsvps/remind    # Send reminders
  GET    /waitlist/:eventId               # Get waitlist
  POST   /waitlist/:eventId/join          # Join waitlist

Check-in Endpoints:
  POST   /checkin/validate        # Validate QR code
  GET    /events/:eventId/checkins        # List check-ins
  GET    /events/:eventId/checkins/stats  # Check-in stats
  POST   /events/:eventId/checkins/kiosk  # Kiosk mode start

Payment Endpoints:
  POST   /payments/create-checkout        # Create Stripe checkout
  POST   /payments/webhook        # Stripe webhook handler
  GET    /payments/invoices       # List invoices
  POST   /payments/refund         # Process refund

Chat Endpoints (WebSocket):
  WS     /ws                      # WebSocket connection
  Events:
    - join_room: { eventId, roomType }
    - leave_room: { eventId, roomType }
    - send_message: { eventId, content, type }
    - receive_message: { id, from, content, timestamp }
    - typing_indicator: { eventId, userId }
    - user_presence: { eventId, onlineUsers[] }

Photo Endpoints:
  POST   /events/:eventId/photos/upload-url   # Get presigned URL
  POST   /events/:eventId/photos              # Create photo record
  GET    /events/:eventId/photos              # List photos
  PUT    /photos/:id/approve                  # Approve photo
  DELETE /photos/:id                          # Delete photo

Analytics Endpoints:
  GET    /events/:eventId/analytics/overview  # Dashboard metrics
  GET    /events/:eventId/analytics/rsvp-funnel
  GET    /events/:eventId/analytics/attendance-heatmap
  GET    /events/:eventId/analytics/engagement
  GET    /events/:eventId/analytics/revenue
  POST   /events/:eventId/analytics/export    # Export report

Subscription Endpoints:
  GET    /subscription/current    # Get current plan
  POST   /subscription/upgrade    # Upgrade plan
  POST   /subscription/cancel     # Cancel subscription
  GET    /subscription/invoices   # List invoices
```

### Response Format

**Success Response**:
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2025-01-15T10:30:00Z"
  }
}
```

**Error Response**:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      { "field": "email", "message": "Invalid email format" }
    ],
    "requestId": "req_abc123"
  }
}
```

**Paginated Response**:
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1250,
    "totalPages": 25,
    "hasNext": true,
    "hasPrev": false
  }
}
```

---

## Database Schema

### Core Tables

```sql
-- Organizations (multi-tenancy root)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  subdomain VARCHAR(50) UNIQUE NOT NULL,
  stripe_customer_id VARCHAR(100),
  tier VARCHAR(20) DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'enterprise')),
  logo_url TEXT,
  branding_config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Events
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('wedding', 'birthday', 'conference', 'meetup', 'commemoration', 'custom')),
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(200) NOT NULL,
  description TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  timezone VARCHAR(50) DEFAULT 'UTC',
  location_type VARCHAR(20) CHECK (location_type IN ('physical', 'virtual', 'hybrid')),
  venue_name VARCHAR(200),
  venue_address TEXT,
  virtual_url TEXT,
  capacity INTEGER,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'completed', 'cancelled')),
  theme_config JSONB DEFAULT '{}',
  custom_fields JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, slug)
);

-- Guests
CREATE TABLE guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  role VARCHAR(50) DEFAULT 'attendee',
  table_number INTEGER,
  plus_ones INTEGER DEFAULT 0,
  dietary_prefs TEXT[],
  accessibility_needs TEXT,
  qr_code_hash VARCHAR(64) UNIQUE NOT NULL,
  qr_token_expires_at TIMESTAMPTZ,
  custom_fields JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RSVPs
CREATE TABLE rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'attending', 'declined', 'waitlisted')),
  response_date TIMESTAMPTZ,
  plus_ones_count INTEGER DEFAULT 0,
  notes TEXT,
  custom_answers JSONB DEFAULT '{}',
  reminder_sent_at TIMESTAMPTZ[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(guest_id)
);

-- Check-ins
CREATE TABLE checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  device_id VARCHAR(100),
  location_lat DECIMAL(10, 8),
  location_lng DECIMAL(11, 8),
  method VARCHAR(20) CHECK (method IN ('qr_scan', 'manual', 'self_kiosk'))
);

-- Photos
CREATE TABLE photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  guest_id UUID REFERENCES guests(id),
  cloudinary_url TEXT NOT NULL,
  thumbnail_url TEXT,
  approved BOOLEAN DEFAULT FALSE,
  tags TEXT[],
  uploaded_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat Messages
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  guest_id UUID REFERENCES guests(id),
  room_type VARCHAR(50) DEFAULT 'general',
  content TEXT NOT NULL,
  message_type VARCHAR(20) DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'file')),
  attachments JSONB DEFAULT '[]',
  is_moderated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Waitlist
CREATE TABLE waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(200),
  priority INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'promoted', 'expired')),
  promoted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id UUID,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Indexes

```sql
-- Performance indexes
CREATE INDEX idx_events_org_id ON events(org_id);
CREATE INDEX idx_events_slug ON events(slug);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_guests_event_id ON guests(event_id);
CREATE INDEX idx_guests_qr_hash ON guests(qr_code_hash);
CREATE INDEX idx_rsvps_guest_id ON rsvps(guest_id);
CREATE INDEX idx_rsvps_status ON rsvps(status);
CREATE INDEX idx_checkins_guest_id ON checkins(guest_id);
CREATE INDEX idx_checkins_timestamp ON checkins(timestamp DESC);
CREATE INDEX idx_photos_event_id ON photos(event_id);
CREATE INDEX idx_chat_messages_event_id ON chat_messages(event_id);
CREATE INDEX idx_chat_messages_room ON chat_messages(event_id, room_type);
CREATE INDEX idx_waitlist_event_id ON waitlist(event_id);
CREATE INDEX idx_audit_logs_org_id ON audit_logs(org_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Composite indexes
CREATE INDEX idx_guests_event_role ON guests(event_id, role);
CREATE INDEX idx_rsvps_event_status ON rsvps(event_id, status);
CREATE INDEX idx_checkins_event_time ON checkins(event_id, timestamp DESC);
```

### Materialized Views

```sql
-- RSVP Statistics (refresh every 5 minutes)
CREATE MATERIALIZED VIEW mv_rsvp_stats AS
SELECT 
  e.id as event_id,
  COUNT(DISTINCT g.id) as total_guests,
  COUNT(DISTINCT CASE WHEN r.status = 'attending' THEN g.id END) as attending,
  COUNT(DISTINCT CASE WHEN r.status = 'declined' THEN g.id END) as declined,
  COUNT(DISTINCT CASE WHEN r.status = 'pending' THEN g.id END) as pending,
  COUNT(DISTINCT c.id) as checked_in,
  ROUND(COUNT(DISTINCT CASE WHEN r.status = 'attending' THEN g.id END)::numeric / 
    NULLIF(COUNT(DISTINCT g.id), 0) * 100, 2) as rsvp_rate
FROM events e
LEFT JOIN guests g ON g.event_id = e.id
LEFT JOIN rsvps r ON r.guest_id = g.id
LEFT JOIN checkins c ON c.guest_id = g.id
GROUP BY e.id;

-- Attendance Heatmap (by hour)
CREATE MATERIALIZED VIEW mv_attendance_heatmap AS
SELECT 
  e.id as event_id,
  EXTRACT(HOUR FROM c.timestamp) as hour,
  COUNT(c.id) as checkin_count
FROM events e
JOIN guests g ON g.event_id = e.id
JOIN checkins c ON c.guest_id = g.id
GROUP BY e.id, EXTRACT(HOUR FROM c.timestamp)
ORDER BY e.id, hour;
```

---

## Deployment Architecture

### Environment Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    Environment Pipeline                      │
├────────────┬────────────┬────────────┬─────────────────────┤
│  Local     │  Preview   │  Staging   │  Production         │
│  Dev       │  Envs      │  Env       │  Env                │
├────────────┼────────────┼────────────┼─────────────────────┤
│ Developer  │ PR-based   │ Pre-prod   │ Live customer-facing │
│ machines   │ deployments│ testing    │ environment          │
│            │ per PR     │            │                      │
│ Database:  │ Database:  │ Database:  │ Database:            │
│ Local PG   │ Neon Branch| Neon Staging| Neon Prod + Replica │
│            │ (auto-created)│          │                     │
└────────────┴────────────┴────────────┴─────────────────────┘
```

### CI/CD Pipeline

```yaml
# GitHub Actions Workflow
name: Deploy Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - Checkout code
      - Setup Node.js 20
      - Install dependencies
      - Run linting
      - Run unit tests
      - Run integration tests
      - Generate coverage report

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - Build backend Docker image
      - Build frontend static assets
      - Push to container registry

  deploy-staging:
    needs: build
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    steps:
      - Deploy to Render staging
      - Run database migrations
      - Smoke tests

  deploy-production:
    needs: deploy-staging
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - Blue-green deployment to Render
      - Database migrations (with rollback plan)
      - Health checks
      - Update DNS if needed
      - Notify Slack channel
```

### Infrastructure as Code

**Docker Compose (Local Development)**:
```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: eventflow_dev
      POSTGRES_USER: devuser
      POSTGRES_PASSWORD: devpass
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  backend:
    build: ./backend
    environment:
      DATABASE_URL: postgresql://devuser:devpass@postgres:5432/eventflow_dev
      REDIS_URL: redis://redis:6379
      NODE_ENV: development
    ports:
      - "3001:3001"
    depends_on:
      - postgres
      - redis
    volumes:
      - ./backend:/app
      - /app/node_modules

  frontend:
    build: ./frontend
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3001
    ports:
      - "3000:3000"
    depends_on:
      - backend

volumes:
  pgdata:
```

---

## Monitoring & Observability

### Metrics Collection

**Application Metrics** (Prometheus format):
```
http_requests_total{method, endpoint, status_code}
http_request_duration_seconds{method, endpoint}
active_websocket_connections{server_id}
database_query_duration_seconds{query_type}
cache_hit_ratio{cache_type}
job_queue_length{queue_name}
payment_transactions_total{status, payment_method}
```

**Business Metrics**:
```
events_created_total{org_tier, event_type}
guests_imported_total{import_method}
rsvp_response_rate{event_type}
checkin_throughput_per_minute{event_id}
subscription_upgrades_total{from_tier, to_tier}
churn_rate{reason}
```

### Alerting Rules

```yaml
# Critical Alerts (Page immediately)
- alert: HighErrorRate
  expr: rate(http_requests_total{status_code=~"5.."}[5m]) > 0.05
  for: 2m
  severity: critical
  
- alert: DatabaseConnectionPoolExhausted
  expr: database_connection_pool_available == 0
  for: 1m
  severity: critical

- alert: PaymentWebhookFailures
  expr: rate(payment_webhook_failures_total[10m]) > 0.1
  for: 5m
  severity: critical

# Warning Alerts (Notify Slack)
- alert: HighResponseTime
  expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 0.5
  for: 5m
  severity: warning

- alert: LowCacheHitRatio
  expr: cache_hit_ratio < 0.8
  for: 10m
  severity: warning

- alert: QueueBacklog
  expr: job_queue_length > 1000
  for: 5m
  severity: warning
```

### Logging Strategy

**Log Levels**:
- ERROR: Unexpected failures requiring immediate attention
- WARN: Recoverable issues or degraded performance
- INFO: Normal business operations (user actions, system events)
- DEBUG: Detailed diagnostic information (development only)

**Structured Log Format**:
```json
{
  "timestamp": "2025-01-15T10:30:00.000Z",
  "level": "INFO",
  "service": "eventflow-api",
  "environment": "production",
  "requestId": "req_abc123",
  "userId": "usr_xyz789",
  "organizationId": "org_def456",
  "action": "guest.created",
  "message": "Guest successfully created",
  "metadata": {
    "eventId": "evt_123",
    "guestEmail": "john@example.com"
  },
  "duration_ms": 45
}
```

---

## Disaster Recovery & Business Continuity

### Backup Strategy

**Database Backups**:
- Automated daily snapshots (Neon built-in)
- Point-in-time recovery (PITR) enabled
- Retention: 30 days
- Cross-region replication for disaster recovery

**Application Backups**:
- Infrastructure as Code (Git repository)
- Environment variables backed up securely (Vault)
- SSL certificates auto-renewed (Let's Encrypt)

### Recovery Objectives

- **RTO (Recovery Time Objective)**: 4 hours
- **RPO (Recovery Point Objective)**: 1 hour

### Failover Procedures

1. **Database Failure**:
   - Automatic failover to read replica (promote to primary)
   - Update connection strings via environment variable
   - Notify on-call engineer

2. **Application Failure**:
   - Auto-restart failed containers (Render automatic)
   - Rollback to previous version if health checks fail
   - Scale up additional instances if needed

3. **CDN/Edge Failure**:
   - Failover to backup CDN provider
   - Update DNS records (TTL: 60 seconds)
   - Serve static assets from origin if needed

---

## Performance Optimization

### Database Optimization

**Query Optimization**:
- Use EXPLAIN ANALYZE for slow queries (>100ms)
- Avoid N+1 queries (Prisma `include`/`select`)
- Batch operations where possible
- Use database transactions for atomic operations

**Connection Pooling**:
```javascript
// Prisma connection pool configuration
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: ['query', 'info', 'warn', 'error'],
});

// Pool settings (via DATABASE_URL params)
// ?connection_limit=100&pool_timeout=20&idle_timeout=300
```

### API Optimization

**Response Compression**:
```javascript
import compression from 'compression';
app.use(compression({ level: 6 }));
```

**Caching Headers**:
```javascript
// Static assets: 1 year
Cache-Control: public, max-age=31536000, immutable

// API responses: varies
Cache-Control: private, max-age=0, no-cache (dynamic data)
Cache-Control: public, max-age=3600 (semi-static data)
```

**Pagination**:
- Cursor-based pagination for large datasets
- Default page size: 50 items
- Maximum page size: 500 items

### Frontend Optimization

**Next.js Optimizations**:
- Static Site Generation (SSG) for public event pages
- Incremental Static Regeneration (ISR) for semi-static data
- Server-Side Rendering (SSR) for personalized dashboards
- Image optimization with next/image
- Code splitting by route
- Prefetching for likely navigation paths

**Mobile Optimizations**:
- Hermes engine for faster startup
- FlatList with proper windowSize for long lists
- Image caching with expo-image
- Background sync for offline operations

---

## Appendix: Technology Comparison

### Database Options Considered

| Database | Pros | Cons | Decision |
|----------|------|------|----------|
| PostgreSQL (Neon) | ACID, JSONB, RLS, serverless | Write scaling limits | ✅ Selected |
| MySQL (PlanetScale) | Horizontal scaling, branching | No RLS, limited JSON | ❌ |
| MongoDB Atlas | Flexible schema, horizontal scaling | No transactions (multi-doc), eventual consistency | ❌ |
| Supabase | Built-in auth, real-time, Postgres | Vendor lock-in, less mature | ❌ |

### Authentication Options Considered

| Provider | Pros | Cons | Decision |
|----------|------|------|----------|
| Clerk | Pre-built UI, MFA, session management | Cost at scale, less customization | ✅ Selected |
| Auth0 | Highly customizable, enterprise features | Complex setup, expensive | ❌ |
| Firebase Auth | Free tier, Google integration | Limited B2B features, vendor lock-in | ❌ |
| Supabase Auth | Open source, integrated with DB | Less mature, fewer features | ❌ |

### Hosting Options Considered

| Platform | Pros | Cons | Decision |
|----------|------|------|----------|
| Render | Simple, auto-scaling, Postgres included | Less control than Kubernetes | ✅ Selected (backend) |
| Vercel | Edge network, instant deploys | Serverless limits, cold starts | ✅ Selected (frontend) |
| AWS ECS/Fargate | Full control, enterprise-grade | Complex setup, higher ops overhead | ❌ (future option) |
| Heroku | Easy deployment, add-ons | Expensive at scale, downtime history | ❌ |
