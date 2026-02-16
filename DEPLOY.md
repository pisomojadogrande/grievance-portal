# Technical Deployment Guide

This document provides detailed technical information for deploying the Grievance Portal to AWS.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Architecture Overview](#architecture-overview)
- [CDK Bootstrap](#cdk-bootstrap)
- [Stack Deployment Order](#stack-deployment-order)
- [SSM Parameter Configuration](#ssm-parameter-configuration)
- [DSQL Setup](#dsql-setup)
- [Database Migration](#database-migration)
- [Cognito Configuration](#cognito-configuration)
- [Frontend Deployment](#frontend-deployment)
- [Validation Commands](#validation-commands)
- [Rollback Procedures](#rollback-procedures)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Tools

- **Node.js**: 20.x or later
- **npm**: 10.x or later
- **AWS CLI**: 2.x or later
- **AWS CDK**: 2.x or later

### AWS Account Requirements

- Admin access to AWS account
- AWS CLI configured with credentials
- Region: us-east-1 (required for Bedrock)

### Verify Setup

```bash
# Check Node.js version
node --version  # Should be 20.x or later

# Check AWS CLI
aws --version

# Check AWS credentials
aws sts get-caller-identity

# Check CDK
cdk --version
```

## Architecture Overview

### Infrastructure Stacks

The application is deployed as 5 CDK stacks:

1. **GrievancePortalParametersStack** - SSM parameters (secrets storage)
2. **GrievancePortalDatabaseStack** - DSQL cluster reference
3. **GrievancePortalAuthStack** - Cognito user pool
4. **GrievancePortalComputeStack** - Lambda + API Gateway
5. **GrievancePortalFrontendStack** - S3 + CloudFront

### Stack Dependencies

```
ParametersStack (no dependencies)
    ↓
DatabaseStack (depends on ParametersStack)
    ↓
AuthStack (no dependencies)
    ↓
ComputeStack (depends on ParametersStack, DatabaseStack, AuthStack)
    ↓
FrontendStack (depends on ComputeStack)
```

## CDK Bootstrap

Bootstrap creates the necessary AWS resources for CDK deployments.

```bash
cd infrastructure

# Bootstrap with default settings
cdk bootstrap

# Or specify account and region explicitly
cdk bootstrap aws://ACCOUNT-ID/us-east-1
```

**What it creates:**
- S3 bucket for CDK assets (CloudFormation templates, Lambda code)
- IAM roles for CloudFormation execution
- ECR repository (not used in this project)

**Verification:**
```bash
aws cloudformation describe-stacks --stack-name CDKToolkit --region us-east-1
```

## Stack Deployment Order

### Option 1: Deploy All at Once

```bash
cd infrastructure
cdk deploy --all --require-approval never
cd ..
```

### Option 2: Deploy Individually

```bash
cd infrastructure

# 1. Parameters (creates SSM parameters with placeholders)
cdk deploy GrievancePortalParametersStack

# 2. Database (creates SSM parameter for DB URL)
cdk deploy GrievancePortalDatabaseStack

# 3. Auth (creates Cognito user pool)
cdk deploy GrievancePortalAuthStack

# 4. Compute (creates Lambda + API Gateway)
cdk deploy GrievancePortalComputeStack

# 5. Frontend (creates S3 + CloudFront)
cdk deploy GrievancePortalFrontendStack

cd ..
```

### Capture Stack Outputs

```bash
# Get all outputs
aws cloudformation describe-stacks --region us-east-1 \
  --query 'Stacks[?starts_with(StackName, `GrievancePortal`)].Outputs' \
  --output table

# Get specific outputs
API_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name GrievancePortalComputeStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
  --output text)

CLOUDFRONT_URL=$(aws cloudformation describe-stacks \
  --stack-name GrievancePortalFrontendStack \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontUrl`].OutputValue' \
  --output text)

USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name GrievancePortalAuthStack \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
  --output text)
```

## SSM Parameter Configuration

### Initial Deployment

CDK creates these parameters with placeholder values:
- `/grievance-portal/stripe/secret-key` → "PLACEHOLDER"
- `/grievance-portal/stripe/publishable-key` → "PLACEHOLDER"
- `/grievance-portal/stripe/webhook-secret` → "PLACEHOLDER"
- `/grievance-portal/session/secret` → "PLACEHOLDER"
- `/grievance-portal/database/url` → "PLACEHOLDER"

### Update with Real Values

#### Stripe Keys

Get your test keys from https://dashboard.stripe.com/test/apikeys

```bash
aws ssm put-parameter \
  --name /grievance-portal/stripe/secret-key \
  --value "sk_test_YOUR_SECRET_KEY" \
  --type SecureString \
  --overwrite \
  --region us-east-1

aws ssm put-parameter \
  --name /grievance-portal/stripe/publishable-key \
  --value "pk_test_YOUR_PUBLISHABLE_KEY" \
  --overwrite \
  --region us-east-1

aws ssm put-parameter \
  --name /grievance-portal/stripe/webhook-secret \
  --value "whsec_placeholder" \
  --type SecureString \
  --overwrite \
  --region us-east-1
```

#### Session Secret

```bash
aws ssm put-parameter \
  --name /grievance-portal/session/secret \
  --value "$(openssl rand -base64 32)" \
  --type SecureString \
  --overwrite \
  --region us-east-1
```

### Verify Parameters

```bash
# List all parameters
aws ssm get-parameters-by-path \
  --path /grievance-portal/ \
  --recursive \
  --region us-east-1

# Get specific parameter (decrypted)
aws ssm get-parameter \
  --name /grievance-portal/session/secret \
  --with-decryption \
  --region us-east-1
```

## DSQL Setup

### Create Cluster

```bash
# Create cluster
CLUSTER_ID=$(aws dsql create-cluster \
  --region us-east-1 \
  --tags Key=Project,Value=grievance-portal \
  --query 'identifier' \
  --output text)

echo "Cluster ID: $CLUSTER_ID"
```

### Wait for Active Status

```bash
# Check status
aws dsql get-cluster --identifier $CLUSTER_ID --region us-east-1

# Wait until status is ACTIVE (takes 2-3 minutes)
while true; do
  STATUS=$(aws dsql get-cluster --identifier $CLUSTER_ID --region us-east-1 --query 'status' --output text)
  echo "Status: $STATUS"
  if [ "$STATUS" = "ACTIVE" ]; then
    break
  fi
  sleep 10
done
```

### Get Endpoint and Update SSM

```bash
# Get endpoint
DSQL_ENDPOINT=$(aws dsql get-cluster \
  --identifier $CLUSTER_ID \
  --region us-east-1 \
  --query 'endpoint' \
  --output text)

echo "DSQL Endpoint: $DSQL_ENDPOINT"

# Update SSM parameter
aws ssm put-parameter \
  --name /grievance-portal/database/url \
  --value "postgresql://admin@${DSQL_ENDPOINT}:5432/postgres?sslmode=require" \
  --type SecureString \
  --overwrite \
  --region us-east-1
```

### Verify Connection

The Lambda function will connect using IAM authentication. To test manually:

```bash
# Install psql-dsql if not already installed
# See: https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-postgresql-client.html

# Connect
psql "postgresql://admin@${DSQL_ENDPOINT}:5432/postgres?sslmode=require"
```

## Database Migration

### Create Tables

```bash
npm run setup:db
```

This runs `script/create-tables.ts` which creates:

1. **admin_users** table
   - id (INTEGER PRIMARY KEY)
   - username (TEXT UNIQUE)
   - password_hash (TEXT)
   - created_at (TIMESTAMP)

2. **complaints** table
   - id (INTEGER PRIMARY KEY)
   - name (TEXT)
   - email (TEXT)
   - complaint (TEXT)
   - response (TEXT)
   - payment_intent_id (TEXT)
   - created_at (TIMESTAMP)

3. **payments** table
   - id (INTEGER PRIMARY KEY)
   - payment_intent_id (TEXT UNIQUE)
   - amount (INTEGER)
   - status (TEXT)
   - created_at (TIMESTAMP)

### Verify Tables

```bash
# Connect to DSQL
psql "postgresql://admin@${DSQL_ENDPOINT}:5432/postgres?sslmode=require"

# List tables
\dt

# Describe table structure
\d complaints
\d payments
\d admin_users
```

### DSQL Limitations

- No SERIAL, IDENTITY, or SEQUENCE support
- No foreign key constraints
- IDs are generated manually using `SELECT MAX(id) + 1`

## Cognito Configuration

### User Pool Details

The CDK stack creates:
- User pool with email sign-in
- App client for authentication
- No MFA (for simplicity)

### Create Admin User

```bash
# Get user pool ID
USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name GrievancePortalAuthStack \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
  --output text)

# Create user
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

### Reset Password

```bash
aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username admin@example.com \
  --password "NewPassword123!" \
  --permanent \
  --region us-east-1
```

### List Users

```bash
aws cognito-idp list-users \
  --user-pool-id $USER_POOL_ID \
  --region us-east-1
```

## Frontend Deployment

### Build and Deploy

```bash
npm run deploy:frontend
```

This script:
1. Gets API Gateway endpoint from CloudFormation
2. Builds React app with Vite
3. Injects API URL into index.html as `window.__API_BASE_URL__`
4. Uploads files to S3
5. Invalidates CloudFront cache

### Manual Deployment

```bash
# Build
npm run build

# Get S3 bucket name
BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name GrievancePortalFrontendStack \
  --query 'Stacks[0].Outputs[?OutputKey==`BucketName`].OutputValue' \
  --output text)

# Upload to S3
aws s3 sync dist/public/ s3://$BUCKET_NAME/ --delete

# Invalidate CloudFront cache
DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
  --stack-name GrievancePortalFrontendStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DistributionId`].OutputValue' \
  --output text)

aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --paths "/*"
```

## Validation Commands

### Check Stack Status

```bash
aws cloudformation describe-stacks \
  --query 'Stacks[?starts_with(StackName, `GrievancePortal`)].{Name:StackName,Status:StackStatus}' \
  --output table
```

### Test API Health

```bash
API_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name GrievancePortalComputeStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
  --output text)

curl $API_ENDPOINT/api/health
```

### Check Lambda Logs

```bash
aws logs tail /aws/lambda/grievance-portal --follow
```

### Test DSQL Connection

```bash
# From Lambda perspective (uses IAM auth)
aws lambda invoke \
  --function-name grievance-portal \
  --payload '{"httpMethod":"GET","path":"/api/health"}' \
  response.json

cat response.json
```

### Verify SSM Parameters

```bash
aws ssm get-parameters-by-path \
  --path /grievance-portal/ \
  --recursive \
  --with-decryption \
  --query 'Parameters[].{Name:Name,Value:Value}' \
  --output table
```

## Rollback Procedures

### Rollback Lambda Code

```bash
# List versions
aws lambda list-versions-by-function \
  --function-name grievance-portal

# Update to specific version
aws lambda update-function-code \
  --function-name grievance-portal \
  --s3-bucket <cdk-assets-bucket> \
  --s3-key <previous-version-key>
```

### Rollback CDK Stack

```bash
cd infrastructure

# Rollback to previous git commit
git log --oneline
git checkout <previous-commit>

# Redeploy
cdk deploy GrievancePortalComputeStack

cd ..
```

### Rollback Database

DSQL doesn't support automated backups. For production:
- Export data before major changes
- Use `pg_dump` for backups
- Restore creates new cluster (can't overwrite)

## Troubleshooting

### CDK Deployment Fails

**Check CloudFormation events:**
```bash
aws cloudformation describe-stack-events \
  --stack-name GrievancePortalComputeStack \
  --max-items 20
```

**Common issues:**
- IAM permissions insufficient
- Resource limits exceeded
- Dependency not satisfied

### Lambda Cold Start Timeout

**Increase timeout in CDK:**
```typescript
// infrastructure/lib/compute-stack.ts
timeout: Duration.seconds(30)  // Increase from default
```

### DSQL Connection Fails

**Check IAM permissions:**
```bash
aws lambda get-function \
  --function-name grievance-portal \
  --query 'Configuration.Role'

# Check role has dsql:DbConnectAdmin permission
```

### Frontend Not Loading

**Check CloudFront distribution:**
```bash
DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
  --stack-name GrievancePortalFrontendStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DistributionId`].OutputValue' \
  --output text)

aws cloudfront get-distribution --id $DISTRIBUTION_ID
```

**Check S3 bucket:**
```bash
BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name GrievancePortalFrontendStack \
  --query 'Stacks[0].Outputs[?OutputKey==`BucketName`].OutputValue' \
  --output text)

aws s3 ls s3://$BUCKET_NAME/
```

### CORS Errors

**Verify API Gateway CORS:**
- Check `server/index.ts` CORS middleware
- Ensure `Access-Control-Allow-Origin` echoes request origin
- Ensure `Access-Control-Allow-Credentials: true` is set

### Bedrock Access Denied

**Enable Bedrock model access:**
1. Go to AWS Console → Bedrock → Model access
2. Request access to Claude models
3. Wait for approval (usually instant)

**Verify region:**
- Bedrock must be called from us-east-1
- Check Lambda region matches

## Performance Optimization

### Lambda Memory

Default: 1024 MB. Adjust based on CloudWatch metrics:

```bash
aws lambda update-function-configuration \
  --function-name grievance-portal \
  --memory-size 2048
```

### CloudFront Caching

Static assets are cached for 1 year. To change:
- Update `infrastructure/lib/frontend-stack.ts`
- Modify `defaultBehavior.cachePolicy`

### DSQL Performance

DSQL auto-scales. Monitor DPU usage:

```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/DSQL \
  --metric-name DPUUtilization \
  --dimensions Name=ClusterId,Value=$CLUSTER_ID \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average
```

## Security Best Practices

1. **Rotate secrets regularly** - Update SSM parameters
2. **Use least-privilege IAM** - Review Lambda execution role
3. **Enable CloudTrail** - Audit API calls
4. **Monitor CloudWatch Logs** - Set up alarms for errors
5. **Use WAF** - Add to CloudFront for production
6. **Enable MFA** - For Cognito users in production

## Cost Monitoring

### Set Up Budget Alert

```bash
aws budgets create-budget \
  --account-id $(aws sts get-caller-identity --query Account --output text) \
  --budget file://budget.json
```

### Check Current Costs

```bash
aws ce get-cost-and-usage \
  --time-period Start=$(date -d '30 days ago' +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=SERVICE
```
