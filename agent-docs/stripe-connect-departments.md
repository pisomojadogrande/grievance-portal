# Stripe Connect — Complaint Domain Franchises

## Status

- **Step 0:** Manual Stripe dashboard setup (still required before deployment — see instructions below)
- **Steps 1–12:** IMPLEMENTED — build passes, ready to deploy

---

## Context

Adding Stripe Connect to the complaints portal so the platform can host subsidiary "Complaint Domains" (e.g., "Department of Motor Vehicles," "Housing Authority"). Each domain is a Stripe Connect Express connected account. When a complainant selects a domain, the filing fee is split: the platform keeps an application fee ($1), the domain operator receives the rest ($4). Domain operators get a simple admin page to view their complaints and customize the AI response persona.

**Stripe concepts in scope:** Express account creation, account onboarding links, destination charges, application fees, Connect webhooks (`account.updated`).

---

## Step 0 — Stripe Dashboard Setup (manual, before any code)

1. **Enable Connect** in the Stripe test dashboard: Stripe Dashboard → Connect → Get started. You'll need to configure your platform name and a few settings. This only needs to be done once.
2. **Register a Connect webhook endpoint** (separate from the existing webhooks): Stripe Dashboard → Connect → Webhooks → Add endpoint. Point it to `https://<your-api-gateway-url>/api/stripe/connect-webhook`. Events to listen for: `account.updated`. Note the signing secret (`whsec_...`).
3. **Store the Connect webhook secret in SSM:**
   ```bash
   aws ssm put-parameter \
     --name "/grievance-portal/stripe/connect-webhook-secret" \
     --value "whsec_YOUR_SECRET" --type String --profile <profile>
   ```

---

## Step 1 — Database

### New `departments` table (`shared/schema.ts`)
```typescript
export const departments = pgTable('departments', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),                        // URL-safe, unique
  description: text('description'),
  adminEmail: text('admin_email').notNull(),
  stripeAccountId: text('stripe_account_id'),          // null until Connect account created
  chargesEnabled: boolean('charges_enabled').default(false).notNull(),
  payoutsEnabled: boolean('payouts_enabled').default(false).notNull(),
  applicationFeeAmount: integer('application_fee_amount').default(100).notNull(), // cents
  officialTitle: text('official_title'),               // "Deputy Commissioner of..."
  departmentStyle: text('department_style'),           // tone/personality description
  signaturePhrase: text('signature_phrase'),           // always included in responses
  promptAddendum: text('prompt_addendum'),             // freeform prompt injection
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

### Modified `complaints` table (`shared/schema.ts`)
Add optional `departmentId` column:
```typescript
departmentId: integer('department_id'),   // nullable — null means platform-level complaint
```
Also add to `insertComplaintSchema` as optional.

### Storage methods (`server/storage.ts`)
- `createDepartment(dept)` — manual ID pattern
- `getDepartmentBySlug(slug)` — for admin page and complaint lookup
- `getDepartmentByStripeAccountId(accountId)` — for Connect webhook handler
- `getDepartmentById(id)` — for checkout and AI prompt lookup
- `updateDepartment(id, updates)` — for onboarding status + prompt settings
- `getActiveDepartments()` — returns all where `stripeAccountId IS NOT NULL`, for the complaint form dropdown
- `getComplaintsByDepartmentId(departmentId)` — for admin view

### Migration script (`script/migrate-tables.ts`)
Add:
```sql
-- Add department_id to complaints (DSQL: no constraint allowed on ADD COLUMN)
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS department_id INTEGER;

-- Create departments table
CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  admin_email TEXT NOT NULL,
  stripe_account_id TEXT,
  charges_enabled BOOLEAN NOT NULL DEFAULT false,
  payouts_enabled BOOLEAN NOT NULL DEFAULT false,
  application_fee_amount INTEGER NOT NULL DEFAULT 100,
  official_title TEXT,
  department_style TEXT,
  signature_phrase TEXT,
  prompt_addendum TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
```
Also update `script/create-tables.ts` to include both for fresh installs.

---

## Step 2 — Backend: Load SSM Param

**`server/init.ts`** — add:
```typescript
process.env.STRIPE_CONNECT_WEBHOOK_SECRET = params['stripe/connect-webhook-secret'];
```

**`test-lambda-local.cjs`** — add:
```javascript
process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect_mock';
```

**`.env.example`** — add `STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...` and the SSM path.

---

## Step 3 — Backend: Department Routes (`server/routes.ts`)

### `GET /api/departments`
Returns `getActiveDepartments()` — id, name, slug, description only (no sensitive fields). Used by the complaint form dropdown.

### `POST /api/departments/register`
Body: `{ name, slug, description?, adminEmail, officialTitle?, departmentStyle?, signaturePhrase?, promptAddendum? }`
1. Validate slug is unique (reject if `getDepartmentBySlug(slug)` exists)
2. Create a Stripe Connect Express account:
   ```typescript
   const account = await stripe.accounts.create({
     type: 'express',
     country: 'US',
     email: adminEmail,
     capabilities: {
       card_payments: { requested: true },
       transfers: { requested: true },
     },
   });
   ```
3. Insert department row with `stripeAccountId = account.id`, `chargesEnabled: false`
4. Create onboarding link:
   ```typescript
   const link = await stripe.accountLinks.create({
     account: account.id,
     refresh_url: `${baseUrl}/department/onboarding?reauth=1&account=${account.id}`,
     return_url: `${baseUrl}/department/${slug}/onboarding-complete`,
     type: 'account_onboarding',
   });
   ```
5. Return `{ onboardingUrl: link.url, slug }`
   Frontend immediately redirects to `onboardingUrl`.

### `GET /api/departments/:slug`
Returns department public info (name, description, chargesEnabled). Used by onboarding-complete page to verify status.

### `GET /api/departments/:slug/admin`
Returns full department including prompt settings + complaints list (`getComplaintsByDepartmentId`). No auth — this is satire.

### `PUT /api/departments/:slug/admin/settings`
Body: `{ officialTitle?, departmentStyle?, signaturePhrase?, promptAddendum?, applicationFeeAmount? }`
Updates department prompt customization fields.

### `GET /api/departments/:slug/admin/onboarding-link`
Generates a fresh Stripe Express dashboard link (for returning to the Stripe-hosted express dashboard):
```typescript
const loginLink = await stripe.accounts.createLoginLink(dept.stripeAccountId);
res.json({ url: loginLink.url });
```
Requires `charges_enabled: true` on the account.

---

## Step 4 — Backend: Connect Webhook (`server/index.ts`)

Add a third webhook endpoint alongside the existing two:
```typescript
app.post('/api/stripe/connect-webhook',
  express.raw({ type: 'application/json' }),
  makeWebhookHandler('STRIPE_CONNECT_WEBHOOK_SECRET')
);
```

**`server/webhookHandlers.ts`** — add `account.updated` case:
```typescript
case 'account.updated': {
  const account = event.data.object as Stripe.Account;
  // event.account is the connected account ID (same as account.id for account.updated)
  const dept = await storage.getDepartmentByStripeAccountId(account.id);
  if (dept) {
    await storage.updateDepartment(dept.id, {
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
    });
    console.log(`[Connect] Department ${dept.slug} charges_enabled: ${account.charges_enabled}`);
  }
  break;
}
```

Note: Connect webhooks have `event.account` set to the connected account ID. This is how you distinguish "which connected account did this happen to." The handler above uses the account ID embedded in the event object directly.

---

## Step 5 — Backend: Modify Checkout to Support Departments

**`server/routes.ts`** — modify `createEmbeddedCheckoutSession`:

The helper currently takes `(stripe, complaintId, { amount, productName, label })`. Extend it to also look up `complaint.departmentId` and, if set, add `payment_intent_data`:

```typescript
// Inside createEmbeddedCheckoutSession, after getting the complaint:
let paymentIntentData: Stripe.Checkout.SessionCreateParams['payment_intent_data'] = {};

if (complaint.departmentId) {
  const dept = await storage.getDepartmentById(complaint.departmentId);
  if (dept?.stripeAccountId && dept.chargesEnabled) {
    paymentIntentData = {
      application_fee_amount: dept.applicationFeeAmount,
      transfer_data: {
        destination: dept.stripeAccountId,
      },
    };
  }
}

const session = await stripe.checkout.sessions.create({
  // ...existing fields...
  payment_intent_data: Object.keys(paymentIntentData).length ? paymentIntentData : undefined,
});
```

---

## Step 6 — Backend: Modify AI Response for Department Persona

**`server/routes.ts`** — modify `generateBureaucraticResponse(complaintId, content)`:

Add department lookup and inject into the system prompt when a `departmentId` is set on the complaint:

```typescript
// Build department-specific prompt prefix
let departmentContext = '';
if (complaint.departmentId) {
  const dept = await storage.getDepartmentById(complaint.departmentId);
  if (dept) {
    departmentContext = `\nYou are responding specifically on behalf of the ${dept.name}.`;
    if (dept.officialTitle) departmentContext += ` Responses are signed by the ${dept.officialTitle}.`;
    if (dept.departmentStyle) departmentContext += ` Your response style: ${dept.departmentStyle}.`;
    if (dept.signaturePhrase) departmentContext += ` Always include the phrase "${dept.signaturePhrase}" somewhere in your response.`;
    if (dept.promptAddendum) departmentContext += ` ${dept.promptAddendum}`;
  }
}
```

Inject `departmentContext` into the existing system prompt string (append after the base prompt, before "Return your response in JSON format").

---

## Step 7 — Backend: Modify Complaint Creation to Accept Department

**`shared/schema.ts`** — add `departmentId` to `insertComplaintSchema` as optional.

**`server/routes.ts`** — `POST /api/complaints` already uses `api.complaints.create.input.parse(req.body)`. As long as `insertComplaintSchema` includes `departmentId`, it will be stored automatically via `storage.createComplaint`.

---

## Step 8 — Frontend: Department Selection on FileComplaint

**`client/src/pages/FileComplaint.tsx`**:

1. On mount, fetch `GET /api/departments` to get the list of active departments.
2. Add a department selector below the email field and above the complaint text. Render it as a set of small cards or a styled select — matching the existing OfficialCard aesthetic.
3. Include a "None — General Grievance Filing" option (value: `null`) that is selected by default.
4. Pass the selected `departmentId` (or `null`) in the complaint creation body.

The selector label could be: **"Complaint Domain Expertise"** with sub-label "Route your grievance to the appropriate jurisdictional authority, or file as a general matter."

---

## Step 9 — Frontend: Department Registration Page

**New file: `client/src/pages/DepartmentRegister.tsx`**

Form fields:
- Department Name (required)
- Slug (auto-generated from name, editable, shows preview URL)
- Admin Email (required)
- Description (optional)
- Collapsible "Response Persona" section:
  - Official Title (optional)
  - Department Style (optional, with placeholder examples: "imperious and dismissive", "sympathetic but utterly powerless")
  - Signature Phrase (optional)
  - Additional Instructions (optional freeform)

On submit: `POST /api/departments/register` → redirect to the returned `onboardingUrl`.

Add route `/department/register` → `<DepartmentRegister />` in `App.tsx`.

---

## Step 10 — Frontend: Onboarding Complete Page

**New file: `client/src/pages/DepartmentOnboardingComplete.tsx`**

URL: `/department/:slug/onboarding-complete`

On mount, calls `GET /api/departments/:slug` to check if `chargesEnabled` is true.
- If yes: "Your department is active. Complaints will now be routed to you." + link to admin page.
- If no (onboarding still in progress or needs more info): "Stripe is still reviewing your account. Check back shortly or return to complete onboarding." + button to generate fresh onboarding link.

Also handle `/department/onboarding?reauth=1&account=acct_xxx` — the refresh URL when onboarding link expires — which should call `GET /api/departments/:slug/admin/onboarding-link` to get a fresh link and redirect.

---

## Step 11 — Frontend: Department Admin Page

**New file: `client/src/pages/DepartmentAdmin.tsx`**

URL: `/department/:slug/admin`

Sections:
1. **Department header**: name, status (Active/Pending), Stripe Express dashboard link (calls `/api/departments/:slug/admin/onboarding-link`, opens in new tab).
2. **Response Persona settings**: editable fields (officialTitle, departmentStyle, signaturePhrase, promptAddendum, applicationFeeAmount). Save button calls `PUT /api/departments/:slug/admin/settings`.
3. **Complaints list**: table/cards showing complaints filed with this department — email, date, status, AI response (expandable), complexity score.

Add routes in `App.tsx`:
- `/department/register` → `<DepartmentRegister />`
- `/department/:slug/admin` → `<DepartmentAdmin />`
- `/department/:slug/onboarding-complete` → `<DepartmentOnboardingComplete />`

---

## Step 12 — Home Page Link

Add a small "Register a Complaint Domain" link on the Home page below the existing buttons (or in a footer-style section).

---

## Testing Walkthrough (Step by Step)

### A. Enable Connect in Stripe (once)
1. Go to Stripe Test Dashboard → Connect (left nav)
2. Click "Get started" if not already enabled
3. Fill in platform name ("The Complaints Department") and save

### B. Create the Connect Webhook
1. Stripe Dashboard → Connect → Webhooks → Add endpoint
2. URL: `https://<your-api-gateway-url>/api/stripe/connect-webhook`
3. Events: select `account.updated`
4. Copy the signing secret → store in SSM (per Step 0)

### C. Register Test Department #1 (DMV)
1. Deploy the code first
2. Navigate to `/department/register` on your site
3. Fill in: Name = "Department of Motor Vehicles", slug = "dmv", any email
4. Optionally fill persona: Style = "imperious and aggressively unhelpful", Signature Phrase = "Per Regulation 47-C, Subsection 12"
5. Submit → redirected to Stripe test onboarding
6. In test onboarding, use these test values:
   - **Business type**: Individual
   - **Legal name**: any name
   - **Date of birth**: any date 18+ years ago
   - **Last 4 of SSN**: `0000`
   - **Address**: any valid US address (e.g., 123 Main St, San Francisco, CA 94105)
   - **Phone**: any 10-digit number
   - **Bank account** (routing): `110000000`, (account): `000123456789`
7. Click through all steps → "Submit" → redirected to onboarding-complete page
8. Verify "Your department is active" appears (may need ~30 seconds for webhook to arrive)

### D. Register Test Department #2 (Housing)
Repeat Step C with different details (e.g., "Bureau of Housing Complaints", slug "housing", different persona).

### E. Test the Full Flow
1. Go to `/file-complaint`
2. Enter an email, select "Department of Motor Vehicles" from the domain selector
3. Submit the complaint → go to payment page → pay with `4242 4242 4242 4242`
4. Verify in Stripe Dashboard → Connect → Accounts → DMV account → Payments: the transfer appears with your application fee deducted
5. Check the AI response — it should reflect the DMV persona
6. Visit `/department/dmv/admin` — complaint should appear in the list

### F. Verify Fee Split
In Stripe Dashboard: your platform account should show the $1 application fee in its balance; the connected account should show $4.

---

## Critical Files

| File | Change |
|---|---|
| `shared/schema.ts` | Add `departments` table, add `departmentId` to complaints |
| `server/storage.ts` | Add 7 new department methods |
| `server/init.ts` | Load `stripe/connect-webhook-secret` from SSM |
| `server/routes.ts` | 5 new department routes, modified checkout + AI prompt |
| `server/webhookHandlers.ts` | Handle `account.updated` Connect event |
| `server/index.ts` | Add `/api/stripe/connect-webhook` endpoint |
| `script/migrate-tables.ts` | Add `department_id` to complaints, create departments table |
| `script/create-tables.ts` | Add departments table for fresh installs |
| `client/src/pages/FileComplaint.tsx` | Add domain selector |
| `client/src/pages/DepartmentRegister.tsx` | New page |
| `client/src/pages/DepartmentAdmin.tsx` | New page |
| `client/src/pages/DepartmentOnboardingComplete.tsx` | New page |
| `client/src/pages/Home.tsx` | Add register link |
| `client/src/App.tsx` | Add 3 new routes |
| `test-lambda-local.cjs` | Add mock connect webhook secret |
| `.env.example` | Add connect webhook secret |

---

## Key Connect Concepts Demonstrated

- **Express accounts**: `stripe.accounts.create({ type: 'express' })` — Stripe hosts KYC/onboarding
- **Account onboarding links**: `stripe.accountLinks.create(...)` — one-time URLs, must be regenerated if expired
- **Destination charges**: `payment_intent_data.transfer_data.destination` — platform is merchant of record, funds flow to connected account automatically
- **Application fees**: `payment_intent_data.application_fee_amount` — platform's cut, deducted before transfer
- **Connect webhooks**: registered separately from account webhooks, receive events from all connected accounts; `event.account` identifies which connected account the event belongs to
- **Express dashboard links**: `stripe.accounts.createLoginLink(accountId)` — lets connected accounts access their Stripe-hosted dashboard from within your platform
