# Complaints Department

## Overview

A satirical bureaucratic complaint filing system where users submit grievances, pay a $5 filing fee via Stripe, and receive AI-generated official responses. The application combines a React frontend with an Express backend, using PostgreSQL for data persistence and OpenAI for generating bureaucratic responses.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight alternative to React Router)
- **State Management**: TanStack Query for server state, React Hook Form for form handling
- **Styling**: Tailwind CSS with shadcn/ui component library (New York style variant)
- **Animations**: Framer Motion for page transitions
- **Build Tool**: Vite with path aliases (`@/` for client src, `@shared/` for shared code)

### Backend Architecture
- **Framework**: Express 5 on Node.js with TypeScript
- **API Pattern**: REST endpoints defined in `shared/routes.ts` with Zod validation
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Build Process**: esbuild for server, Vite for client, bundled to `dist/`

### Key Design Patterns
- **Shared Types**: The `shared/` directory contains schemas and route definitions used by both frontend and backend, ensuring type safety across the stack
- **API Contract**: Routes are defined with Zod schemas for input validation and response typing
- **Storage Layer**: Database operations abstracted through `server/storage.ts` interface

### AI Integration
- Replit AI Integrations provide OpenAI-compatible endpoints for:
  - Chat completions (generating bureaucratic responses)
  - Image generation
  - Audio/speech processing
- Integration routes registered in `server/replit_integrations/`

### Payment Flow
1. User submits complaint → stored with `pending_payment` status
2. Stripe Checkout session created → user redirected to Stripe
3. Webhook receives payment confirmation → status updated to `received`
4. AI generates bureaucratic response → status updated to `resolved`

## External Dependencies

### Database
- **PostgreSQL**: Primary data store, configured via `DATABASE_URL` environment variable
- **Drizzle ORM**: Schema management and queries, migrations in `./migrations`

### Payment Processing
- **Stripe**: Handles $5 filing fee payments
- **Webhook**: `/api/stripe/webhook` endpoint for payment confirmation
- **Environment Variables**: 
  - `STRIPE_WEBHOOK_SECRET` for webhook signature verification
  - Stripe credentials fetched via Replit Connectors API

### AI Services
- **OpenAI API** (via Replit AI Integrations):
  - `AI_INTEGRATIONS_OPENAI_API_KEY`
  - `AI_INTEGRATIONS_OPENAI_BASE_URL`
- Used for generating satirical bureaucratic responses to complaints

### Frontend Dependencies
- shadcn/ui components (Radix UI primitives)
- TanStack Query for data fetching
- Framer Motion for animations
- date-fns for timestamp formatting