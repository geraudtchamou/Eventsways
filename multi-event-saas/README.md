# 🎉 EventFlow Pro - Multi-Event SaaS Platform

A production-ready, scalable SaaS platform for managing all types of events: Weddings, Birthdays, Conferences, Meetups, Commemorations, and Custom events.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20-green.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

## 🚀 Features

### Core Capabilities
- **6 Event Types**: Wedding, Birthday, Conference, Meetup, Commemoration, Custom
- **Dynamic Theming**: Real-time theme switching based on event type (NO HARDCODING)
- **Multi-Tenant Architecture**: Organization-based with subdomain support
- **10K+ Guest Scale**: Optimized for large-scale events
- **Real-Time Updates**: Socket.io for live chat, check-ins, and analytics
- **QR Code System**: Guest check-in, validation, and tracking
- **RSVP Management**: Waitlists, reminders, and approval workflows
- **Photo Sharing**: Cloudinary integration with moderation
- **Analytics Dashboard**: Real-time metrics and insights
- **Payment Integration**: Stripe subscriptions and one-time payments

### Monetization Tiers
| Tier | Price | Events | Guests/Event | Features |
|------|-------|--------|--------------|----------|
| Free | $0 | 3 | 100 | Basic features |
| Pro | $29/mo | 25 | 1,000 | All features + Priority support |
| Enterprise | $99/mo | Unlimited | 10,000+ | Custom branding + SLA |

## 🏗️ Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│   Backend API    │────▶│   PostgreSQL    │
│   Next.js 14    │     │   Node.js + Exp  │     │   Neon Serverless│
│   Vercel        │◀────│   Render/Railway │◀────│                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                       │                        │
         │                       ▼                        ▼
         │              ┌──────────────────┐     ┌─────────────────┐
         │              │   Redis Cache    │     │   Cloudinary    │
         │              │   Upstash        │     │   File Storage  │
         │              └──────────────────┘     └─────────────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌──────────────────┐
│   Mobile App    │     │   Stripe/Twilio  │
│   React Native  │     │   Payments/SMS   │
│   Expo          │     └──────────────────┘
└─────────────────┘
```

## 🛠️ Tech Stack

### Backend
- **Runtime**: Node.js 20 + TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL 16 (Neon) + Prisma ORM
- **Cache**: Redis (Upstash)
- **Real-time**: Socket.io
- **Auth**: JWT + Clerk
- **Validation**: Zod
- **Logging**: Winston
- **Payments**: Stripe
- **SMS/WhatsApp**: Twilio
- **Storage**: Cloudinary

### Frontend (Web)
- **Framework**: Next.js 14.2 (App Router)
- **Language**: TypeScript 5.4
- **Styling**: Tailwind CSS 3.4 + shadcn/ui
- **Animations**: Framer Motion 11
- **State**: React Query 5 / tRPC
- **Uploads**: Uploadthing
- **i18n**: i18next

### Mobile
- **Framework**: React Native 0.75 + Expo 51
- **Navigation**: Expo Router
- **Build**: EAS Build
- **Storage**: AsyncStorage + Realm (Offline-first)
- **Real-time**: Socket.io-client
- **QR**: Expo QR Scanner

## 📁 Project Structure

```
multi-event-saas/
├── backend/
│   ├── src/
│   │   ├── config/          # Database, logger, env
│   │   ├── controllers/     # Request handlers
│   │   ├── middleware/      # Auth, validation, errors
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic, Socket.io
│   │   ├── types/           # TypeScript types, Zod schemas
│   │   ├── utils/           # Helper functions
│   │   └── index.ts         # Entry point
│   ├── prisma/
│   │   └── schema.prisma    # Database schema
│   ├── package.json
│   └── .env.example
├── frontend/                # Next.js app (to be created)
├── mobile/                  # React Native app (to be created)
├── docs/
│   ├── requirements.md      # Product requirements
│   ├── architecture.md      # System architecture
│   └── user-stories.json    # User stories
└── README.md
```

## 🚀 Getting Started

### Prerequisites
- Node.js >= 20
- PostgreSQL database (Neon recommended)
- Redis (Upstash recommended)

### Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your credentials

# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push

# Start development server
npm run dev
```

The API will be available at `http://localhost:3001`

### Environment Variables

See `backend/.env.example` for all required variables:
- Database URL (Neon PostgreSQL)
- Redis URL (Upstash)
- JWT Secret
- Stripe keys
- Cloudinary credentials
- Twilio credentials

## 📡 API Endpoints

### Authentication
- `POST /api/v1/auth/webhook` - Clerk webhook
- `GET /api/v1/auth/me` - Get current user

### Organizations
- `POST /api/v1/organizations` - Create organization
- `GET /api/v1/organizations` - List organizations
- `GET /api/v1/organizations/:id` - Get organization

### Events
- `POST /api/v1/events` - Create event
- `GET /api/v1/events` - List events
- `GET /api/v1/events/public/:slug` - Get public event
- `PUT /api/v1/events/:id` - Update event
- `POST /api/v1/events/:id/publish` - Publish event

### Guests
- `POST /api/v1/events/:eventId/guests` - Create guest
- `POST /api/v1/events/:eventId/guests/bulk` - Bulk create
- `GET /api/v1/events/:eventId/guests` - List guests
- `GET /api/v1/guests/:id/qr` - Generate QR code

### RSVP
- `POST /api/v1/events/:eventId/rsvps` - Create RSVP
- `GET /api/v1/rsvp/:token` - Get public RSVP
- `POST /api/v1/rsvp/:token/submit` - Submit RSVP

### Check-in
- `POST /api/v1/checkin/validate` - Validate QR
- `POST /api/v1/checkin/record` - Record check-in

### Analytics
- `GET /api/v1/events/:eventId/analytics` - Get analytics
- `GET /api/v1/analytics/heatmap/:eventId` - Attendance heatmap

## 🔒 Security

- JWT authentication with Clerk integration
- Rate limiting on all endpoints
- Input validation with Zod
- CORS protection
- Helmet security headers
- SQL injection prevention (Prisma ORM)

## 📊 Scalability

- Horizontal scaling ready
- Database connection pooling
- Redis caching layer
- CDN for static assets
- Load balancer compatible

## 🧪 Testing

```bash
# Run tests
npm test

# Test with coverage
npm run test:coverage
```

## 📄 License

MIT License - see LICENSE file for details

## 👥 Contributing

Contributions are welcome! Please read our contributing guidelines first.

## 📞 Support

- Documentation: https://docs.eventflowpro.com
- Email: support@eventflowpro.com
- Discord: https://discord.gg/eventflowpro

---

Built with ❤️ by the EventFlow Pro Team
