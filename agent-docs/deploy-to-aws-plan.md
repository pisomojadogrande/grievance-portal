# AWS Deployment Plan - Grievance Portal

**Last Updated:** February 8, 2026  
**Current Status:** Phases 1-3 Complete ✅ | Ready for Phase 4

---

## Executive Summary

Migrate the Replit-based Grievance Portal to AWS using a serverless architecture for maximum cost efficiency at low volume.

**Architecture:**
- **Compute**: AWS Lambda with serverless-express wrapper (scales to zero)
- **API**: API Gateway REST API (scales to zero)
- **Database**: Aurora DSQL (scales to zero, PostgreSQL-compatible)
- **Auth**: AWS Cognito (replacing Replit Auth)
- **AI**: AWS Bedrock (replacing OpenAI)
- **Secrets**: SSM Parameter Store (free)
- **CI/CD**: CodePipeline + CodeBuild with GitHub integration
- **Infrastructure**: AWS CDK (TypeScript)

**Estimated Monthly Cost:** $4-12 at low volume (vs $71+ for ECS Fargate)

---

## Phase Execution Order

1. ✅ **Phase 1: Prerequisites** - AWS account, tools, CDK bootstrap
2. ✅ **Phase 2: CDK Infrastructure Code** - Create stack definitions
3. ✅ **Phase 3: Application Refactoring** - Make code AWS-compatible
4. ⏳ **Phase 4: Deploy Core Infrastructure** - DSQL, SSM, Cognito
5. ⏳ **Phase 5: Deploy Application** - Lambda + API Gateway
6. ⏳ **Phase 6: Database Migration** - Migrate schema and data
7. ⏳ **Phase 7: End-to-End Testing** - Verify full functionality
8. ⏳ **Phase 8: CI/CD Pipeline** - Automate deployments
9. ⏳ **Phase 9: Production Hardening** - Monitoring, security, costs

---

## Phase 1: Prerequisites ✅ COMPLETED

**Completed:** February 6, 2026

### Validation Criteria
- [x] AWS account accessible
- [x] AWS CLI configured (Region: us-east-1, Account: <AWS_ACCOUNT_ID>)
- [x] Node.js 20.18.0 installed
- [x] AWS CDK 2.1105.0 installed
- [x] CDK bootstrapped in us-east-1 (Status: CREATE_COMPLETE)
- [x] Replit database backed up (112KB in backup.sql)

### What Was Done
- Configured AWS CLI with credentials
- Installed AWS CDK locally
- Bootstrapped CDK in us-east-1
- Exported Replit database to backup.sql

**Next:** Phase 2 - CDK Infrastructure Code

---

## Phase 2: CDK Infrastructure Code ✅ COMPLETED

**Completed:** February 6, 2026

### Validation Criteria
- [x] CDK project initialized in `infrastructure/` directory
- [x] TypeScript compiles: `npm run build` succeeds
- [x] CloudFormation templates synthesize: `cdk synth` succeeds
- [x] All 5 stack files created:
  - [x] `parameters-stack.ts` - SSM Parameter Store
  - [x] `database-stack.ts` - Aurora DSQL
  - [x] `auth-stack.ts` - Cognito user pool
  - [x] `compute-stack.ts` - Lambda + API Gateway
  - [x] `pipeline-stack.ts` - CodePipeline CI/CD
- [x] Stack dependencies configured correctly
- [x] All tests pass: `npm test` (3/3 passing)

### What Was Done
- Created CDK project structure
- Defined all infrastructure stacks
- Configured stack dependencies
- Created placeholder lambda.zip for validation
- Verified CDK synth generates valid CloudFormation templates

**Next:** Phase 3 - Application Refactoring

---

## Phase 3: Application Refactoring ✅ COMPLETED

**Completed:** February 8, 2026

### Validation Criteria
- [x] TypeScript compiles cleanly: `npm run check` passes
- [x] Application builds: `npm run build` succeeds
- [x] Lambda handler created: `server/lambda.ts` exists
- [x] Lambda handler exports correctly: `module.exports.handler` in `dist/lambda.cjs`
- [x] Express app exports for Lambda: `export default app` in `server/index.ts`
- [x] Lambda package created: `lambda.zip` (435KB)
- [x] All Replit dependencies removed from package.json
- [x] Replit integrations directory removed
- [x] AWS SDK packages installed (@aws-sdk/client-ssm, @aws-sdk/client-bedrock-runtime)
- [x] serverless-express installed
- [x] SSM parameter loading function created: `server/aws/ssm.ts`
- [x] Bedrock client created: `server/aws/bedrock.ts` (replaces OpenAI)
- [x] Cognito auth stub created: `server/aws/cognito.ts`
- [x] Stripe client simplified (removed Replit connector)
- [x] Schema is DSQL-compatible (no foreign key constraints)

### What Was Done
- Installed AWS SDK packages and serverless-express
- Created Lambda handler with proper CommonJS exports
- Updated server/index.ts to export app and conditionally start server
- Created AWS integration stubs (SSM, Bedrock, Cognito)
- Replaced OpenAI with Bedrock in routes.ts
- Removed all Replit dependencies and integrations
- Simplified Stripe client to use environment variables
- Updated build script to generate lambda.zip
- Fixed all TypeScript compilation errors

**Next:** Phase 4 - Deploy Core Infrastructure

---

## Phase 4: Deploy Core Infrastructure ✅ COMPLETED

**Completed:** February 8, 2026 22:14 UTC  
**Goal:** Deploy DSQL, SSM Parameter Store, and Cognito via CDK

### Validation Criteria
- [x] CDK deployment succeeds: `npx cdk deploy GrievancePortalParametersStack GrievancePortalDatabaseStack GrievancePortalAuthStack`
- [x] DSQL cluster active: `aws dsql get-cluster --identifier <DSQL_CLUSTER_ID>` shows "ACTIVE"
- [x] SSM parameters exist: `aws ssm get-parameters-by-path --path /grievance-portal/`
- [x] SSM parameters retrievable with decryption
- [x] Cognito user pool exists
- [x] Cognito admin user created and can authenticate

### Progress Notes
**2026-02-08 00:58 UTC** - Deployed three CDK stacks successfully:
- GrievancePortalParametersStack - SSM parameters created with PLACEHOLDER values
- GrievancePortalDatabaseStack - SSM parameter for database URL created
- GrievancePortalAuthStack - Cognito user pool and client created
  - User Pool ID: <COGNITO_USER_POOL_ID>
  - Client ID: <COGNITO_CLIENT_ID>

**2026-02-08 17:54 UTC** - Resuming Phase 4 with step-by-step execution:

#### Checklist for Phase 4 Completion:
- [x] 4.2.1: Update Stripe secret key in SSM
- [x] 4.2.2: Update Stripe publishable key in SSM
- [x] 4.2.3: Update Stripe webhook secret in SSM (placeholder for now)
- [x] 4.2.4: Generate and store session secret in SSM
- [x] 4.2.5: Verify all SSM parameters updated
- [x] 4.3.1: Create Aurora DSQL cluster (ID: <DSQL_CLUSTER_ID>)
- [x] 4.3.2: Wait for DSQL cluster to become ACTIVE
- [x] 4.3.3: Get DSQL endpoint and update SSM parameter
- [x] 4.3.4: Verify DSQL cluster is accessible
- [x] 4.4.1: Create Cognito admin user (UUID: <ADMIN_USER_UUID>)
- [x] 4.4.2: Set permanent password for admin user
- [x] 4.4.3: Verify Cognito user created successfully
- [x] 4.5: Final verification of all Phase 4 infrastructure

**Phase 4 Status: ✅ COMPLETE**

### Tasks

#### 4.1 Deploy Infrastructure Stacks ✅ DONE
```bash
cd infrastructure

# Deploy parameters stack (creates SSM parameters with placeholders)
cdk deploy ParametersStack

# Deploy database stack (creates DSQL cluster)
cdk deploy DatabaseStack

# Deploy auth stack (creates Cognito user pool)
cdk deploy AuthStack
```

#### 4.2 Update SSM Parameters with Real Values
```bash
# Update Stripe keys (use your test keys)
aws ssm put-parameter --name /grievance-portal/stripe/secret-key \
  --value "sk_test_..." --type SecureString --overwrite

aws ssm put-parameter --name /grievance-portal/stripe/publishable-key \
  --value "pk_test_..." --overwrite

aws ssm put-parameter --name /grievance-portal/stripe/webhook-secret \
  --value "whsec_..." --type SecureString --overwrite

# Generate and store session secret
aws ssm put-parameter --name /grievance-portal/session/secret \
  --value "$(openssl rand -base64 32)" --type SecureString --overwrite

# Get DSQL connection string from stack output and store
DSQL_URL=$(aws cloudformation describe-stacks --stack-name DatabaseStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DsqlConnectionString`].OutputValue' --output text)
aws ssm put-parameter --name /grievance-portal/database/url \
  --value "$DSQL_URL" --type SecureString --overwrite
```

#### 4.3 Create Cognito Admin User
```bash
# Get user pool ID
USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name AuthStack \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' --output text)

# Create admin user
aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username admin@example.com \
  --user-attributes Name=email,Value=admin@example.com Name=email_verified,Value=true \
  --temporary-password "TempPassword123!" \
  --message-action SUPPRESS

# Set permanent password
aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username admin@example.com \
  --password "YourSecurePassword123!" \
  --permanent
```

#### 4.4 Verify Infrastructure
```bash
# Test DSQL connection
psql $DSQL_URL -c "SELECT version();"

# Test SSM parameter retrieval
aws ssm get-parameter --name /grievance-portal/session/secret --with-decryption

# Test Cognito user pool
aws cognito-idp list-users --user-pool-id $USER_POOL_ID
```

**Estimated Time:** 2-3 hours

---

## Phase 5: Deploy Application ⏳ NOT STARTED

**Goal:** Deploy Lambda function and API Gateway

### Validation Criteria
- [ ] CDK deployment succeeds: `cdk deploy ComputeStack`
- [ ] Lambda function exists: `aws lambda get-function --function-name grievance-portal`
- [ ] Lambda has correct IAM permissions (SSM, Bedrock, DSQL)
- [ ] API Gateway REST API created
- [ ] API Gateway endpoint URL output from CDK
- [ ] Health check responds: `curl $API_ENDPOINT/api/health` returns 200
- [ ] CloudWatch log group created: `/aws/lambda/grievance-portal`
- [ ] Lambda logs appear in CloudWatch

### Tasks

#### 5.1 Build and Package Lambda
```bash
# Build production Lambda package
npm run build
npm run package:lambda

# Verify package
ls -lh lambda.zip
```

#### 5.2 Deploy Compute Stack
```bash
cd infrastructure

# Deploy Lambda + API Gateway
cdk deploy ComputeStack

# Get API endpoint from output
API_ENDPOINT=$(aws cloudformation describe-stacks --stack-name ComputeStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' --output text)

echo "API Endpoint: $API_ENDPOINT"
```

#### 5.3 Test Deployment
```bash
# Test health check
curl $API_ENDPOINT/api/health

# Should return: {"status":"healthy","timestamp":"..."}

# Check Lambda logs
aws logs tail /aws/lambda/grievance-portal --follow
```

**Estimated Time:** 1-2 hours

---

## Phase 6: Database Migration ⏳ NOT STARTED

**Goal:** Migrate schema and data to Aurora DSQL

### Validation Criteria
- [ ] Schema migration completes: `npm run db:push` succeeds
- [ ] All tables created: `psql $DSQL_URL -c "\dt"` shows expected tables
- [ ] Table structure correct: Verify columns match schema
- [ ] No foreign key constraints in database
- [ ] Data import completes without errors
- [ ] Row counts match between old and new database
- [ ] Sample queries return expected results
- [ ] Application connects to DSQL successfully

### Tasks

#### 6.1 Run Schema Migration
```bash
# Get DSQL connection string
DSQL_URL=$(aws ssm get-parameter --name /grievance-portal/database/url \
  --with-decryption --query 'Parameter.Value' --output text)

# Run Drizzle migration
DATABASE_URL=$DSQL_URL npm run db:push

# Verify tables created
psql $DSQL_URL -c "\dt"
```

#### 6.2 Import Data
```bash
# For small datasets
psql $DSQL_URL < backup.sql

# For large datasets (DSQL has 10K row transaction limit), split into batches
split -l 10000 backup.sql backup_part_
for file in backup_part_*; do
  psql $DSQL_URL < $file
done
```

#### 6.3 Verify Migration
```bash
# Check row counts
psql $DSQL_URL -c "SELECT COUNT(*) FROM complaints;"
psql $DSQL_URL -c "SELECT COUNT(*) FROM payments;"

# Test sample queries
psql $DSQL_URL -c "SELECT * FROM complaints LIMIT 5;"
```

**Estimated Time:** 1-2 hours

---

## Phase 7: End-to-End Testing ⏳ NOT STARTED

**Goal:** Verify full application functionality

### Validation Criteria
- [ ] Health check returns 200: `curl $API_ENDPOINT/api/health`
- [ ] Can submit complaint through UI
- [ ] Stripe payment completes (test card 4242...)
- [ ] AI response generated via Bedrock
- [ ] Admin can login with Cognito credentials
- [ ] Admin can view complaints in admin portal
- [ ] Stripe webhook processes successfully
- [ ] Load test completes: 100 concurrent requests without errors
- [ ] No errors in CloudWatch logs during testing

### Tasks

#### 7.1 Test API Endpoints
```bash
# Test health check
curl $API_ENDPOINT/api/health

# Test Stripe publishable key endpoint
curl $API_ENDPOINT/api/stripe/publishable-key
```

#### 7.2 Test Complaint Submission Flow
1. Open application in browser: `$API_ENDPOINT`
2. Fill out complaint form
3. Submit with Stripe test card: `4242 4242 4242 4242`
4. Verify payment processes
5. Verify AI response is generated
6. Check CloudWatch logs for any errors

#### 7.3 Test Admin Portal
1. Navigate to admin portal: `$API_ENDPOINT/admin`
2. Login with Cognito credentials
3. Verify can view submitted complaints
4. Verify can see AI responses

#### 7.4 Test Stripe Webhook
```bash
# Update Stripe webhook URL in Stripe Dashboard
# URL: $API_ENDPOINT/api/stripe/webhook

# Test webhook with Stripe CLI
stripe listen --forward-to $API_ENDPOINT/api/stripe/webhook
stripe trigger payment_intent.succeeded
```

#### 7.5 Load Testing
```bash
# Run load test (100 requests, 10 concurrent)
ab -n 100 -c 10 $API_ENDPOINT/api/health

# Verify:
# - All requests succeed (200 OK)
# - No failed requests
# - Reasonable response times (<1s for warm Lambda)
```

**Estimated Time:** 2-3 hours

---

## Phase 8: CI/CD Pipeline ⏳ NOT STARTED

**Goal:** Automate deployments from GitHub

### Validation Criteria
- [ ] GitHub connection created and shows "Available" status
- [ ] CodeBuild project created
- [ ] CodePipeline created with Source → Build stages
- [ ] Manual test: Push commit to main branch
- [ ] Pipeline automatically triggers within 1 minute
- [ ] CodeBuild phase completes successfully
- [ ] Lambda function code updated automatically
- [ ] Test updated Lambda: `curl $API_ENDPOINT/api/health`
- [ ] CloudWatch logs show new deployment

### Tasks

#### 8.1 Create buildspec.yml
Create `buildspec.yml` in repository root:

```yaml
version: 0.2

phases:
  install:
    runtime-versions:
      nodejs: 20
  pre_build:
    commands:
      - echo Installing dependencies...
      - npm ci
  build:
    commands:
      - echo Build started on `date`
      - npm run build
      - npm run package:lambda
  post_build:
    commands:
      - echo Build completed on `date`
      - aws s3 cp lambda.zip s3://$S3_BUCKET/lambda.zip
      - aws lambda update-function-code --function-name grievance-portal --s3-bucket $S3_BUCKET --s3-key lambda.zip

artifacts:
  files:
    - lambda.zip
```

#### 8.2 Deploy Pipeline Stack
```bash
cd infrastructure

# Deploy CI/CD pipeline
cdk deploy PipelineStack
```

#### 8.3 Activate GitHub Connection
1. Go to AWS Console → Developer Tools → Connections
2. Find the connection "grievance-portal-github"
3. Click "Update pending connection"
4. Authorize AWS to access your GitHub repository

#### 8.4 Test Pipeline
```bash
# Make a small change and push to main
git commit --allow-empty -m "Test CI/CD pipeline"
git push origin main

# Watch pipeline in AWS Console or CLI
aws codepipeline get-pipeline-state --name grievance-portal-pipeline

# Verify Lambda updated
aws lambda get-function --function-name grievance-portal --query 'Configuration.LastModified'
```

**Estimated Time:** 2-3 hours

---

## Phase 9: Production Hardening ⏳ NOT STARTED

**Goal:** Monitoring, security, and cost optimization

### Validation Criteria
- [ ] CloudWatch log groups exist with correct retention (1 week)
- [ ] CloudWatch alarms created and in "OK" state
- [ ] Test alarm: Trigger condition and verify alarm fires
- [ ] Lambda IAM role has minimum required permissions
- [ ] API Gateway throttling configured (100 req/sec rate, 200 burst)
- [ ] Test throttling: Burst requests return 429
- [ ] HTTPS enforced on API Gateway
- [ ] No secrets in CloudWatch logs
- [ ] AWS Budget alert set for $20/month threshold
- [ ] Review AWS Cost Explorer for first week of usage
- [ ] Verify costs within expected range ($4-12/month)

### Tasks

#### 9.1 Configure CloudWatch Alarms
Alarms are defined in CDK stacks:
- Lambda error alarm (>5 errors)
- Lambda duration alarm (>10 seconds)
- DSQL DPU usage alarm (approaching free tier limit)

Verify alarms exist:
```bash
aws cloudwatch describe-alarms --alarm-names grievance-portal-*
```

#### 9.2 Review Security
```bash
# Test Lambda IAM permissions
aws lambda get-function --function-name grievance-portal --query 'Configuration.Role'

# Test API Gateway throttling
ab -n 300 -c 50 $API_ENDPOINT/api/health

# Check logs for secrets
aws logs tail /aws/lambda/grievance-portal | grep -i "password\|secret\|key"
```

#### 9.3 Set Up Cost Monitoring
```bash
# Create AWS Budget alert
aws budgets create-budget \
  --account-id $(aws sts get-caller-identity --query Account --output text) \
  --budget file://budget.json

# Review costs
aws ce get-cost-and-usage \
  --time-period Start=2026-02-01,End=2026-02-08 \
  --granularity DAILY \
  --metrics BlendedCost
```

**Estimated Time:** 2-3 hours

---

## Cost Estimates

### Monthly Costs (Low Volume)

| Service | Configuration | Monthly Cost |
|---------|--------------|--------------|
| Aurora DSQL | Free tier: 100K DPUs + 1GB | $0-5 |
| Lambda | Free tier: 1M requests + 400K GB-seconds | $0-2 |
| API Gateway | Free tier: 1M requests (first 12 months) | $0-3 |
| SSM Parameter Store | Standard parameters | $0 |
| CloudWatch Logs | ~2 GB ingestion + storage | $2 |
| S3 | Lambda deployment packages | $0.10 |
| CodeBuild | Free tier: 100 build minutes/month | $0 |
| **TOTAL (excluding Bedrock)** | | **$4-12/month** |

**Bedrock costs:** Pay-per-use, varies by model and usage

### Cost Comparison

| Architecture | Monthly Cost | Notes |
|--------------|--------------|-------|
| **Lambda + API Gateway** | **$4-12** | ✅ Scales to zero |
| ECS Fargate + ALB | $71 | Always-on, requires VPC/NAT |

**Savings: 83-94%**

---

## Rollback Procedures

### Lambda Rollback
```bash
# List Lambda versions
aws lambda list-versions-by-function --function-name grievance-portal

# Rollback to previous version
aws lambda update-alias --function-name grievance-portal --name prod --function-version <PREVIOUS_VERSION>
```

### Database Rollback
- Use AWS Backup for point-in-time recovery
- Manual snapshots before major migrations
- Restore creates new cluster (doesn't overwrite)

### Infrastructure Rollback
```bash
# Rollback to previous CDK version
git checkout <previous-commit>
cdk deploy --all
```

---

## Quick Reference Commands

### Validation Commands
```bash
# Check DSQL cluster
aws dsql get-cluster --identifier grievance-portal-dsql

# Check SSM parameters
aws ssm get-parameters-by-path --path /grievance-portal/ --recursive

# Check Lambda function
aws lambda get-function --function-name grievance-portal

# Test API health check
curl $API_ENDPOINT/api/health

# View Lambda logs
aws logs tail /aws/lambda/grievance-portal --follow

# Test database connection
psql $DSQL_URL -c "SELECT version();"
```

### Deployment Commands
```bash
# Deploy all CDK stacks
cd infrastructure && cdk deploy --all

# Deploy specific stack
cdk deploy ComputeStack

# Trigger CodeBuild
aws codebuild start-build --project-name grievance-portal-build

# Check pipeline status
aws codepipeline get-pipeline-state --name grievance-portal-pipeline
```

---

## Success Criteria

**Production Ready When:**
- ✅ All 9 phases validated
- ✅ All validation criteria checked off
- ✅ Load testing complete (100+ concurrent requests)
- ✅ Costs within expected range ($4-12/month)
- ✅ Monitoring and alarms working
- ✅ CI/CD pipeline deploying automatically
- ✅ Rollback procedures tested

---

## Timeline Estimate

- Phase 1: Prerequisites ✅ Complete
- Phase 2: CDK Infrastructure Code ✅ Complete
- Phase 3: Application Refactoring ✅ Complete
- Phase 4: Deploy Core Infrastructure - 2-3 hours
- Phase 5: Deploy Application - 1-2 hours
- Phase 6: Database Migration - 1-2 hours
- Phase 7: End-to-End Testing - 2-3 hours
- Phase 8: CI/CD Pipeline - 2-3 hours
- Phase 9: Production Hardening - 2-3 hours

**Remaining Time:** 11-18 hours (1.5-2.5 days)
