# Grievance Portal

A serverless complaint submission system with AI-generated responses, deployed on AWS.

## Overview

The Grievance Portal is a tongue-in-cheek web application where users can submit complaints for a nominal $5 processing fee. The system generates thoughtful, bureaucratic (yet ultimately noncommittal) AI responses to each complaint.

**Key Features:**

- Complaint submission with Stripe payment processing
- Read-only access to Stripe data synced into Supabase Postgres
- AI-generated responses via AWS Bedrock
- Admin portal for reviewing complaints
- Fully serverless architecture with scale-to-zero cost

**Tech Stack:**

- Frontend: React + Vite
- Backend: Express.js on AWS Lambda
- Application database: Aurora DSQL (PostgreSQL-compatible)
- Stripe data: Stripe-synced Supabase Postgres (separate sandbox and live databases)
- Auth: AWS Cognito
- AI: AWS Bedrock (Claude)
- Payment: Stripe (test mode)
- Infrastructure: AWS CDK (TypeScript)

## Architecture

```
┌─────────────┐
│   Users     │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│  CloudFront + S3    │  Static frontend hosting
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│   API Gateway       │  REST API
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│   Lambda Function   │  Express.js app
└──┬────────┬─────┬───┘
   │        │     │
   ▼        ▼     ▼
┌──────┐ ┌────┐ ┌────────┐
│ DSQL │ │SSM │ │Bedrock │
└──────┘ └────┘ └────────┘
```

The Lambda also connects to two external Supabase Postgres databases populated
by Stripe, one for sandbox data and one for live-mode data. These databases and
their Stripe sync pipelines are not provisioned by CDK.

**AWS Services:**

- **Lambda** - Runs Express.js backend (scales to zero)
- **API Gateway** - HTTP API endpoint
- **S3 + CloudFront** - Static file hosting with CDN
- **Aurora DSQL** - Serverless PostgreSQL database (scales to zero)
- **Cognito** - Admin authentication
- **Bedrock** - AI response generation
- **SSM Parameter Store** - Secrets management (free)

## Cost Estimate

**Monthly AWS cost at low volume:** $4-12/month, plus the cost of the two
Supabase destinations (normally two projects) used for sandbox and live mode.

This is **83-94% cheaper** than running on ECS Fargate ($71/month) because everything scales to zero when not in use.

## Prerequisites

Before deploying, ensure you have:

1. **AWS Account** with admin access
2. **Node.js** 20.x or later
3. **AWS CLI** configured with credentials
4. **AWS CDK** 2.x installed globally: `npm install -g aws-cdk`
5. **Stripe Account** with sandbox and live-mode access (free at https://stripe.com)
6. **Stripe Database early-access enrollment** for that Stripe account. Sign in
   at https://docs.stripe.com/data/database; a not-found page means the account
   is not enrolled yet.
7. **Two Stripe-synced Postgres destinations**, normally two Supabase projects:
   one for sandbox data and one for live-mode data

## Quick Start

```bash
# 1. Clone and install dependencies
git clone <repository-url>
cd grievance-portal
npm install
cd infrastructure && npm install && cd ..

# 2. Bootstrap AWS CDK (one-time setup)
cd infrastructure
cdk bootstrap
cd ..

# 3. Build and deploy infrastructure
npm run build
cd infrastructure
CUSTOM_DOMAIN=none cdk deploy --all
cd ..

# 4. Provision and backfill both Stripe-synced Supabase databases
#    (see step 7 below)

# 5. Configure secrets and both Supabase URLs in SSM (see step 8 below)

# 6. Create application database tables in Aurora DSQL
npm run setup:db

# 7. Deploy frontend
npm run deploy:frontend

# 8. Create admin user (see step 11 below)
```

## Detailed Deployment Steps

### 1. AWS Account Setup

Ensure your AWS CLI is configured:

```bash
aws configure
# Enter your AWS Access Key ID
# Enter your AWS Secret Access Key
# Default region: us-east-1
# Default output format: json
```

Verify configuration:
```bash
aws sts get-caller-identity
```

### 2. Install Dependencies

```bash
# Install application dependencies
npm install

# Install infrastructure dependencies
cd infrastructure
npm install
cd ..
```

### 3. Install AWS CDK CLI

```bash
npm install -g aws-cdk --registry https://registry.npmjs.org
cdk --version
```

### 4. Bootstrap AWS CDK

This is a one-time setup per AWS account/region.

First, set environment variables so CDK knows your account/region:

```bash
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export CDK_DEFAULT_REGION=us-east-1
```

If CDK has trouble finding your credentials (common with SSO or assumed roles), export them explicitly:

```bash
eval "$(aws configure export-credentials --format env)"
```

Then bootstrap:

```bash
cd infrastructure
cdk bootstrap
cd ..
```

This creates an S3 bucket and IAM roles that CDK uses for deployments.

### 5. Deploy Infrastructure Stacks

Build and deploy all stacks:

```bash
# From the repository root, build the frontend and Lambda deployment package.
npm run build

cd infrastructure
npm run build
CUSTOM_DOMAIN=complaints.example.com cdk deploy --all
# or: CUSTOM_DOMAIN=none cdk deploy --all
```

Or deploy individually in this order:

```bash
# From the repository root, build lambda.zip before deploying ComputeStack.
npm run build

cd infrastructure
npm run build
cdk deploy GrievancePortalParametersStack
cdk deploy GrievancePortalDatabaseStack
cdk deploy GrievancePortalAuthStack
cdk deploy GrievancePortalComputeStack
CUSTOM_DOMAIN=complaints.example.com cdk deploy GrievancePortalFrontendStack

# IMPORTANT: After FrontendStack deploys, get the CloudFront URL and redeploy ComputeStack with CORS fix
CLOUDFRONT_URL=$(aws cloudformation describe-stacks --stack-name GrievancePortalFrontendStack \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontUrl`].OutputValue' --output text)

echo "CloudFront URL: $CLOUDFRONT_URL"

# Redeploy ComputeStack with the correct CORS origin
cdk deploy GrievancePortalComputeStack -c frontendUrl=$CLOUDFRONT_URL

cd ..
```

CDK prints outputs at the end of deployment. To retrieve them later:

```bash
# API Gateway endpoint
aws cloudformation describe-stacks --stack-name GrievancePortalComputeStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' --output text

# CloudFront URL
aws cloudformation describe-stacks --stack-name GrievancePortalFrontendStack \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontUrl`].OutputValue' --output text

# Cognito User Pool ID
aws cloudformation describe-stacks --stack-name GrievancePortalAuthStack \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' --output text

# Cognito Client ID
aws cloudformation describe-stacks --stack-name GrievancePortalAuthStack \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' --output text
```

### 6. Create Aurora DSQL Cluster

DSQL clusters must be created manually:

```bash
# Create cluster
aws dsql create-cluster \
  --region us-east-1 \
  --tags Key=Project,Value=grievance-portal

# Wait for cluster to become active (takes 2-3 minutes)
aws dsql get-cluster --identifier <cluster-id> --region us-east-1

# Get the endpoint
DSQL_ENDPOINT=$(aws dsql get-cluster --identifier <cluster-id> --region us-east-1 --query 'endpoint' --output text)

# Store in SSM Parameter Store
aws ssm put-parameter \
  --name /grievance-portal/database/url \
  --value "postgresql://admin@${DSQL_ENDPOINT}:5432/postgres?sslmode=require" \
  --type SecureString \
  --overwrite \
  --region us-east-1
```

### 7. Provision Stripe-Synced Supabase Databases

This branch reads Stripe-owned objects from external Postgres databases in
addition to using Aurora DSQL for application-owned data. CDK does not create
the databases or enable Stripe's sync.

1. Confirm the Stripe account is enrolled in the Database early-access program
   and can open https://docs.stripe.com/data/database while signed in. If it
   cannot, ask the preview contact to enroll the account before continuing.
2. Create two dedicated Supabase Postgres projects or databases: one for the
   Stripe sandbox and one for live mode. Do not point both modes at the same
   database.
3. In each Supabase project's **Connect** dialog, copy a Postgres **Transaction
   pooler** or **Session pooler** connection string. It must be reachable from
   the public internet, include the database password, and use TLS, for example:

   ```text
   postgresql://USER:URL_ENCODED_PASSWORD@POOLER_HOST:PORT/postgres?sslmode=require
   ```

   This must be a Postgres connection string, not the project's HTTPS API URL.
   URL-encode special characters in the password.
4. In Stripe's Database preview setup, select the sandbox and attach its
   Supabase destination. Wait for the initial backfill to finish, then switch to
   live mode and attach the other destination. The preview setup is
   account-gated, so follow the signed-in preview instructions or the steps from
   the preview contact.
5. In the Supabase SQL editor for **each** destination, run:

   ```sql
   SELECT table_name
   FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN (
       'accounts',
       'checkout_sessions',
       'customers',
       'invoices',
       'payment_intents',
       'subscriptions'
     )
   ORDER BY table_name;
   ```

   Both destinations must return all six rows before deployment. If a table is
   missing, the sync pipeline or preview schema needs to be repaired or
   backfilled; changing the application or SSM value will not create it.

Stripe owns and populates these tables. Do **not** run `npm run setup:db`,
`npm run db:push`, or application migrations against either Supabase database.

For local development, export the two reader URLs as `SUPABASE_URL_SBX` and
`SUPABASE_URL_LIVE`; `.env.example` shows the expected names. A
`localhost`/socat tunnel URL is only valid while that tunnel is running; the
values stored for Lambda must use the real, externally reachable pooler hosts.

### 8. Configure Parameters and Secrets

#### Stripe Configuration

1. Get your Stripe test keys from https://dashboard.stripe.com/test/apikeys
2. Store them in SSM Parameter Store:

```bash
# Secret key
aws ssm put-parameter \
  --name /grievance-portal/stripe/secret-key \
  --value "sk_test_YOUR_KEY_HERE" \
  --type SecureString \
  --overwrite \
  --region us-east-1

# Publishable key
aws ssm put-parameter \
  --name /grievance-portal/stripe/publishable-key \
  --value "pk_test_YOUR_KEY_HERE" \
  --overwrite \
  --region us-east-1

# Webhook secret (placeholder for now)
aws ssm put-parameter \
  --name /grievance-portal/stripe/webhook-secret \
  --value "whsec_placeholder" \
  --type SecureString \
  --overwrite \
  --region us-east-1
```

#### Stripe-Synced Supabase Database URLs

The CDK stacks do not create these two parameters. Store both reader connection
strings as `SecureString` values in the **same AWS region as the Lambda**:

```bash
APP_AWS_REGION="${CDK_DEFAULT_REGION:-us-east-1}"

# Read the URLs without placing the credentials in shell history.
read -rsp "Sandbox Supabase pooler URL: " SUPABASE_URL_SBX
echo
read -rsp "Live Supabase pooler URL: " SUPABASE_URL_LIVE
echo

aws ssm put-parameter \
  --name /grievance-portal/supabase/url-sbx \
  --value "$SUPABASE_URL_SBX" \
  --type SecureString \
  --overwrite \
  --region "$APP_AWS_REGION"

aws ssm put-parameter \
  --name /grievance-portal/supabase/url-live \
  --value "$SUPABASE_URL_LIVE" \
  --type SecureString \
  --overwrite \
  --region "$APP_AWS_REGION"

unset SUPABASE_URL_SBX SUPABASE_URL_LIVE

# Confirm that both parameters exist without printing their values.
aws ssm describe-parameters \
  --parameter-filters \
    Key=Name,Option=BeginsWith,Values=/grievance-portal/supabase/ \
  --query 'Parameters[].{Name:Name,Type:Type}' \
  --region "$APP_AWS_REGION"
```

The existing Lambda role can already read `/grievance-portal/*`; no additional
IAM policy or VPC configuration is needed. The process caches SSM values for the
life of a Lambda execution environment. If the function was invoked before the
parameters were set, redeploy `GrievancePortalComputeStack` to force a fresh
environment.

#### Session Secret

Generate and store a session secret:

```bash
aws ssm put-parameter \
  --name /grievance-portal/session/secret \
  --value "$(openssl rand -base64 32)" \
  --type SecureString \
  --overwrite \
  --region us-east-1
```

### 9. Create Application Database Tables

```bash
npm run setup:db
```

This creates the three application-owned tables in Aurora DSQL:

- `admin_users` - Admin authentication
- `complaints` - User complaints
- `payments` - Stripe payment records

It does not create or modify the Stripe-synced Supabase tables.

### 10. Deploy Frontend

```bash
npm run deploy:frontend
```

This builds the React app and uploads it to S3, then invalidates the CloudFront cache.

> **Custom domain:** `CUSTOM_DOMAIN` must be set when deploying. Use your custom domain, or `none` to fall back to the CloudFront domain:
> ```bash
> # With a custom domain
> CUSTOM_DOMAIN=complaints.example.com npm run deploy:frontend
>
> # Without a custom domain
> CUSTOM_DOMAIN=none npm run deploy:frontend
> ```

### 11. Create Admin User

```bash
# Get your Cognito User Pool ID from stack outputs
USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name GrievancePortalAuthStack \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
  --output text \
  --region us-east-1)

# Create admin user
aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username admin@example.com \
  --user-attributes Name=email,Value=admin@example.com Name=email_verified,Value=true \
  --message-action SUPPRESS \
  --region us-east-1

# Set permanent password
aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username admin@example.com \
  --password "YourSecurePassword123!" \
  --permanent \
  --region us-east-1
```

## Testing Your Deployment

### Test the API

```bash
# Get API endpoint
API_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name GrievancePortalComputeStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
  --output text \
  --region us-east-1)

# Test health check
curl $API_ENDPOINT/api/health
```

### Test the Frontend

1. Get your CloudFront URL from the stack outputs
2. Open it in a browser
3. Submit a test complaint using Stripe test card: `4242 4242 4242 4242`
4. Use any future expiry date and any CVC

### Test the Admin Portal

1. Navigate to `<CloudFront-URL>/admin`
2. Login with your Cognito credentials
3. Verify you can see submitted complaints

## Configuration

### Environment Variables and SSM Parameters

Lambda loads production configuration from SSM Parameter Store. Local runs can
provide the corresponding environment variables from `.env.example`. The
deployment parameters include:

- `/grievance-portal/stripe/secret-key`
- `/grievance-portal/stripe/publishable-key`
- `/grievance-portal/stripe/webhook-secret`
- `/grievance-portal/session/secret`
- `/grievance-portal/database/url`
- `/grievance-portal/supabase/url-sbx` (maps to `SUPABASE_URL_SBX`)
- `/grievance-portal/supabase/url-live` (maps to `SUPABASE_URL_LIVE`)

### Stripe Test Mode

The application uses Stripe in test mode. Users should use the test card:
- Card number: `4242 4242 4242 4242`
- Expiry: Any future date
- CVC: Any 3 digits
- ZIP: Any 5 digits

## Troubleshooting

### CDK Bootstrap Fails

**Error:** "Unable to resolve AWS account"

**Solution:** Ensure AWS CLI is configured with valid credentials:
```bash
aws sts get-caller-identity
```

### Lambda Function Timeout

**Error:** Lambda times out when processing requests

**Solution:** Check CloudWatch logs:
```bash
aws logs tail /aws/lambda/grievance-portal --follow
```

Common causes:
- DSQL connection issues (check IAM permissions)
- SSM parameter not found (verify all parameters exist)
- Bedrock model not available in region (must use us-east-1)

### CORS Errors in Browser

**Error:** "Access-Control-Allow-Origin" errors or "Credential is not supported if the CORS header 'Access-Control-Allow-Origin' is '*'"

**Root Cause:** API Gateway CORS is configured with wildcard origin (`*`) but `allowCredentials: true`, which is invalid.

**Solution:** Redeploy ComputeStack with your frontend URL (CloudFront domain, or custom domain if you have one):

```bash
# Use your CloudFront URL, or your custom domain if configured
FRONTEND_URL="https://your-custom-domain.example.com"

# Or get the CloudFront URL from stack outputs if not using a custom domain:
# FRONTEND_URL=$(aws cloudformation describe-stacks --stack-name GrievancePortalFrontendStack \
#   --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontUrl`].OutputValue' --output text)

# Redeploy with correct CORS origin
cd infrastructure
cdk deploy GrievancePortalComputeStack -c frontendUrl=$FRONTEND_URL
cd ..
```

**Verification:**
```bash
# Test CORS headers
curl -I -X OPTIONS \
  -H "Origin: $CLOUDFRONT_URL" \
  -H "Access-Control-Request-Method: POST" \
  <YOUR_API_GATEWAY_URL>/api/admin/login
```

Should see:
```
Access-Control-Allow-Origin: <your-cloudfront-url>
Access-Control-Allow-Credentials: true
```

### Database Connection Fails

**Error:** "Connection refused" or "Authentication failed"

**Solution:** 
1. Verify DSQL cluster is ACTIVE: `aws dsql get-cluster --identifier <cluster-id>`
2. Check Lambda has IAM permission: `dsql:DbConnectAdmin`
3. Verify database URL in SSM is correct

### Stripe-Synced Supabase Connection Fails

**Error:** `[Stripe Sync][test|live] ... is not configured`, `Connection
refused`, authentication errors, or `relation ... does not exist`

**Solution:**

1. Confirm `/grievance-portal/supabase/url-sbx` and `url-live` exist in the
   Lambda's AWS region.
2. Confirm each value is a Postgres pooler URL with `sslmode=require`, not a
   Supabase HTTPS API URL or a local tunnel URL.
3. Confirm special characters in the password are URL-encoded.
4. Run the six-table check from step 7 against both destinations. A missing
   relation must be fixed in the Stripe sync pipeline.
5. If the SSM value was recently changed, redeploy the compute stack so the
   Lambda does not keep using a cached value.

### Admin Login Fails

**Error:** "Invalid credentials"

**Solution:**
1. Verify Cognito user exists: `aws cognito-idp list-users --user-pool-id <pool-id>`
2. Reset password if needed (see Admin Setup section)
3. Check browser console for specific error messages

## Updating the Application

### Update Lambda Code

```bash
npm run build
cd infrastructure
cdk deploy GrievancePortalComputeStack
cd ..
```

### Update Frontend

```bash
npm run deploy:frontend
```

### Update Infrastructure

```bash
cd infrastructure
cdk deploy --all
cd ..
```

## Tearing Down

To delete all resources and stop incurring costs:

```bash
# Delete DSQL cluster first (not managed by CDK)
aws dsql delete-cluster --identifier <cluster-id> --region us-east-1

# Delete all CDK stacks
cd infrastructure
cdk destroy --all
cd ..
```

**Warning:** This will permanently delete all data. Make sure to backup your database first if needed.

## Cost Optimization

The architecture is designed for minimal cost at low volume:

- **Lambda** - Only charged when requests are processed
- **API Gateway** - Only charged per request
- **DSQL** - Scales to zero when idle
- **S3** - Minimal storage costs for static files
- **CloudFront** - Free tier covers most low-volume usage
- **Cognito** - Free tier covers up to 50,000 MAUs
- **SSM Parameter Store** - Free for standard parameters
- **Supabase** - Two projects are required; pricing and free-tier availability
  depend on the selected Supabase plan

**Expected monthly AWS cost:** $4-12 at low volume (< 1000 requests/month), plus
the two Supabase destinations.

## Security Considerations

- All secrets stored in SSM Parameter Store (encrypted)
- Lambda uses IAM roles (no hardcoded credentials)
- DSQL uses IAM authentication
- API Gateway uses HTTPS only
- CloudFront serves frontend over HTTPS
- Cognito handles admin authentication with JWT tokens

## Support

For issues or questions, please check:
1. CloudWatch Logs: `/aws/lambda/grievance-portal`
2. AWS Console for resource status
3. This README's Troubleshooting section

## License

This is a learning project for AWS migration and serverless architecture.
