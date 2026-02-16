# Grievance Portal

A serverless complaint submission system with AI-generated responses, deployed on AWS.

## Overview

The Grievance Portal is a tongue-in-cheek web application where users can submit complaints for a nominal $5 processing fee. The system generates thoughtful, bureaucratic (yet ultimately noncommittal) AI responses to each complaint.

**Key Features:**
- Complaint submission with Stripe payment processing
- AI-generated responses via AWS Bedrock
- Admin portal for reviewing complaints
- Fully serverless architecture with scale-to-zero cost

**Tech Stack:**
- Frontend: React + Vite
- Backend: Express.js on AWS Lambda
- Database: Aurora DSQL (PostgreSQL-compatible)
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

**AWS Services:**
- **Lambda** - Runs Express.js backend (scales to zero)
- **API Gateway** - HTTP API endpoint
- **S3 + CloudFront** - Static file hosting with CDN
- **Aurora DSQL** - Serverless PostgreSQL database (scales to zero)
- **Cognito** - Admin authentication
- **Bedrock** - AI response generation
- **SSM Parameter Store** - Secrets management (free)

## Cost Estimate

**Monthly cost at low volume:** $4-12/month

This is **83-94% cheaper** than running on ECS Fargate ($71/month) because everything scales to zero when not in use.

## Prerequisites

Before deploying, ensure you have:

1. **AWS Account** with admin access
2. **Node.js** 20.x or later
3. **AWS CLI** configured with credentials
4. **AWS CDK** 2.x installed globally: `npm install -g aws-cdk`
5. **Stripe Test Account** (free at https://stripe.com)

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

# 3. Deploy infrastructure
cd infrastructure
cdk deploy --all
cd ..

# 4. Configure secrets (see Configuration section below)

# 5. Create database tables
npm run setup:db

# 6. Deploy frontend
npm run deploy:frontend

# 7. Create admin user (see Admin Setup section below)
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

### 3. Bootstrap AWS CDK

This is a one-time setup per AWS account/region:

```bash
cd infrastructure
cdk bootstrap
cd ..
```

This creates an S3 bucket and IAM roles that CDK uses for deployments.

### 4. Deploy Infrastructure Stacks

Deploy all stacks in order:

```bash
cd infrastructure

# Deploy all stacks at once
cdk deploy --all

# Or deploy individually in this order:
cdk deploy GrievancePortalParametersStack
cdk deploy GrievancePortalDatabaseStack
cdk deploy GrievancePortalAuthStack
cdk deploy GrievancePortalComputeStack
cdk deploy GrievancePortalFrontendStack

cd ..
```

**Note the outputs** - you'll need:
- API Gateway endpoint URL
- CloudFront distribution URL
- Cognito User Pool ID
- Cognito Client ID

### 5. Create Aurora DSQL Cluster

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

### 6. Configure Secrets

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

### 7. Create Database Tables

```bash
npm run setup:db
```

This creates the three required tables:
- `admin_users` - Admin authentication
- `complaints` - User complaints
- `payments` - Stripe payment records

### 8. Deploy Frontend

```bash
npm run deploy:frontend
```

This builds the React app and uploads it to S3, then invalidates the CloudFront cache.

### 9. Create Admin User

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

### Environment Variables

The application uses SSM Parameter Store instead of environment variables. All secrets are stored at:

- `/grievance-portal/stripe/secret-key`
- `/grievance-portal/stripe/publishable-key`
- `/grievance-portal/stripe/webhook-secret`
- `/grievance-portal/session/secret`
- `/grievance-portal/database/url`

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

**Error:** "Access-Control-Allow-Origin" errors

**Solution:** Verify the frontend is calling the API Gateway URL, not CloudFront. Check browser console for the actual URL being called.

### Database Connection Fails

**Error:** "Connection refused" or "Authentication failed"

**Solution:** 
1. Verify DSQL cluster is ACTIVE: `aws dsql get-cluster --identifier <cluster-id>`
2. Check Lambda has IAM permission: `dsql:DbConnectAdmin`
3. Verify database URL in SSM is correct

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

**Expected monthly cost:** $4-12 at low volume (< 1000 requests/month)

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
