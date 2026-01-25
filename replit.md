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
2. Stripe Embedded Checkout session created → payment form displayed inline on page
3. User completes payment → redirected to status page
4. Verify-session endpoint confirms payment → status updated to `received`
5. Webhook (backup) can also confirm payment with idempotency protection
6. AI generates bureaucratic response → status updated to `resolved`

### Admin Authentication
The admin portal at `/admin` supports two authentication methods:

1. **Replit Auth**: The first user to sign in via Replit becomes the primary admin automatically
2. **Email/Password**: Primary admin can create additional admin accounts with email/password credentials

Admin User Management:
- Only the first (primary) admin can add new admin users via the "Add Admin" button
- The "Admin Users" section is only visible to the primary admin (positioned at bottom of page)
- New admins are assigned email/password credentials (shared out-of-band, not through the app)
- Password-based admins log in directly on the /admin page without needing a Replit account
- Sessions are secured with bcrypt password hashing and session regeneration on login

## External Dependencies

### Database
- **PostgreSQL**: Primary data store, configured via `DATABASE_URL` environment variable
- **Drizzle ORM**: Schema management and queries, migrations in `./migrations`

### Payment Processing
- **Stripe**: Handles $5 filing fee payments via Embedded Checkout
- **Credentials**: Uses `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` from secrets (user's own Stripe sandbox account). Falls back to Replit connector if secrets not set.
- **Webhook**: `/api/stripe/webhook` endpoint as backup payment confirmation
- **Test Card**: Use `4242 4242 4242 4242` with any future expiry and any CVC

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