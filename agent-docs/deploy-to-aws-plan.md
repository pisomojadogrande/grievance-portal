# AWS Deployment Plan - Grievance Portal

**Last Updated:** February 8, 2026  
**Current Status:** Phases 1-3 Complete ✅ | Ready for Phase 4

---

## Executive Summary

Migrate the Replit-based Grievance Portal to AWS using a serverless architecture for maximum cost efficiency at low volume.

**Architecture:**
- **Compute**: AWS Lambda with serverless-express wrapper (scales to zero)
- **API**: API Gateway REST API (scales to zero)
- **Static Files**: S3 + CloudFront (scales to zero)
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
4. ✅ **Phase 4: Deploy Core Infrastructure** - DSQL, SSM, Cognito
5. ✅ **Phase 5: Deploy Application API** - Lambda + API Gateway (API only)
6. ✅ **Phase 6: Deploy Static Frontend** - S3 + CloudFront for React app
7. ✅ **Phase 7: Database Migration** - Migrate schema and data
8. ✅ **Phase 8: End-to-End Testing** - Verify full functionality
9. ⏳ **Phase 9: CI/CD Pipeline** - Automate deployments
10. ⏳ **Phase 10: Custom Domain Setup** - Configure Route 53 and ACM certificate
11. ⏳ **Phase 11: Production Hardening** - Monitoring, security, costs
12. ⏳ **Phase 12: Deployment Documentation** - Complete README for new deployments

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

## Phase 5: Deploy Application ✅ COMPLETED

**Started:** February 8, 2026 22:24 UTC  
**Completed:** February 8, 2026 22:46 UTC  
**Goal:** Deploy Lambda function and API Gateway

### Progress Notes
**2026-02-08 22:46 UTC** - Phase 5 complete! API is live and responding.

#### Checklist for Phase 5 Completion:
- [x] 5.1: Build and package Lambda (372KB)
- [x] 5.2: Deploy Compute Stack
- [x] 5.3: Get API endpoint URL (https://<API_GATEWAY_ID>.execute-api.us-east-1.amazonaws.com/prod/)
- [x] 5.4: Test health check endpoint - Returns 200 OK
- [x] 5.5: Verify Lambda logs in CloudWatch

### Validation Criteria
- [x] CDK deployment succeeds: `cdk deploy ComputeStack`
- [x] Lambda function exists: `aws lambda get-function --function-name grievance-portal`
- [x] Lambda has correct IAM permissions (SSM, Bedrock, DSQL)
- [x] API Gateway REST API created
- [x] API Gateway endpoint URL output from CDK
- [x] Health check responds: `curl $API_ENDPOINT/api/health` returns 200
- [x] CloudWatch log group created: `/aws/lambda/grievance-portal`
- [x] Lambda logs appear in CloudWatch

### Issues Resolved
1. **SSM Parameter Loading**: Added `server/init.ts` to load parameters before app starts
2. **Database Connection**: Made DSQL connection lazy-loaded via `getDb()` function
3. **Native Dependencies**: Replaced bcrypt with bcryptjs (no native compilation)
4. **Build Process**: Updated `script/build.ts` to auto-create lambda.zip
5. **Static Files**: Skip static file serving in Lambda (AWS_EXECUTION_ENV check)
6. **Route Registration**: Fixed async initialization timing - exported `appReady` promise
7. **Health Endpoint**: Added `/api/health` route for testing
8. **Local Testing**: Created `test-lambda-local.cjs` for rapid iteration

### What Was Done
- Deployed GrievancePortalComputeStack with Lambda + API Gateway
- Fixed multiple Lambda initialization issues
- Verified API working with health check: `{"status":"healthy","timestamp":"..."}`
- API endpoint: https://<API_GATEWAY_ID>.execute-api.us-east-1.amazonaws.com/prod/

**Next:** Phase 6 - Deploy Static Frontend

---

## Phase 6: Deploy Static Frontend ✅ COMPLETED

**Started:** February 9, 2026 00:15 UTC  
**Completed:** February 9, 2026 00:30 UTC  
**Goal:** Deploy React frontend to S3 + CloudFront

### Validation Criteria
- [x] S3 bucket created for static files
- [x] CloudFront distribution created
- [x] Frontend files uploaded to S3
- [x] CloudFront serves index.html at root
- [x] Frontend configured to call API Gateway directly (no CloudFront proxy needed)
- [x] HTTPS enabled (CloudFront default certificate)
- [x] Can access website via CloudFront URL
- [x] API calls from frontend work correctly

### What Was Done
- Created FrontendStack with S3 bucket and CloudFront distribution
- Built frontend with Vite to `dist/public/`
- Created `npm run deploy:frontend` script that:
  - Gets API Gateway endpoint from CloudFormation
  - Injects API URL into index.html as `window.__API_BASE_URL__`
  - Uploads files to S3
  - Invalidates CloudFront cache
- Modified `buildUrl()` in `shared/routes.ts` to prepend API base URL
- Frontend now calls API Gateway directly instead of using CloudFront proxy

### Architecture Decision
Instead of proxying `/api/*` through CloudFront to API Gateway, the frontend calls the API Gateway URL directly. This is simpler and avoids CloudFront configuration complexity.

**CloudFront URL:** https://<CLOUDFRONT_DISTRIBUTION>.cloudfront.net  
**API Gateway URL:** https://<API_GATEWAY_ID>.execute-api.us-east-1.amazonaws.com/prod/

**Next:** Phase 7 - Database Migration

---

## Phase 7: Database Migration ✅ COMPLETED

**Started:** February 9, 2026 00:43 UTC  
**Completed:** February 9, 2026 00:52 UTC  
**Goal:** Migrate schema to Aurora DSQL

### Validation Criteria
- [x] Schema migration completes: `npm run db:create` succeeds
- [x] All tables created: admin_users, complaints, payments
- [x] Table structure correct: Verified columns match schema
- [x] No foreign key constraints in database (DSQL doesn't support them)
- [x] Application connects to DSQL successfully

### What Was Done
- Created `script/create-tables.ts` to initialize DSQL tables with IAM auth
- Discovered DSQL limitations: no SERIAL, IDENTITY, or SEQUENCE support
- Implemented manual ID generation using `MAX(id) + 1` pattern
- Updated storage.ts and adminMiddleware.ts to generate IDs before insert
- Successfully created all 3 tables in DSQL

### DSQL Compatibility Notes
- DSQL doesn't support auto-increment (SERIAL, IDENTITY, SEQUENCE)
- Solution: Generate IDs manually using `SELECT MAX(id) + 1` before insert
- DSQL doesn't support foreign key constraints (validation in app layer)
- DSQL requires IAM authentication (can't use psql with password)

**Next:** Phase 8 - End-to-End Testing

---

## Phase 8: End-to-End Testing ✅ COMPLETED

**Started:** February 9, 2026 01:02 UTC  
**Completed:** February 16, 2026 19:27 UTC  
**Goal:** Verify full application functionality

### Progress Notes
**2026-02-09 01:02 UTC** - Started Phase 8 testing:
- ✅ API health check works: Returns 200 OK
- ✅ Frontend loads correctly at CloudFront URL
- ✅ API URL properly injected into HTML
- ❌ Complaint submission failing - frontend was calling CloudFront instead of API Gateway
- 🔧 Fixed: Updated all frontend fetch calls to use `apiUrl()` helper
- 🔧 Fixed: Updated `buildUrl()` usage in use-complaints.ts
- ✅ Frontend deployed with fixes
- ✅ Complaint submission now works end-to-end!
- ❌ AI response too short/generic - needs better prompt for verbose bureaucratic responses

**2026-02-10 03:00 UTC** - Phase 8 improvements:
- ✅ Reverted to original simpler prompt (matches Replit version)
- ✅ Fixed favicon - replaced Replit icon with scale/balance SVG
- ✅ Created safety branch: phase8-current-progress
- ⏳ **NEXT**: Deploy Lambda and test AI responses

**2026-02-10 20:30 UTC** - Implementing Cognito authentication for admin portal:
- ✅ Installed Cognito SDK and JWT libraries
- ✅ Implemented JWT verification and USER_PASSWORD_AUTH flow
- ✅ Updated frontend to store/send JWT tokens
- ✅ Build successful - ready to deploy and test

**2026-02-16 19:27 UTC** - Phase 8 complete! All functionality verified:
- ✅ Complaint submission works end-to-end
- ✅ Stripe test payments process successfully
- ✅ AI responses generate via Bedrock
- ✅ Admin portal login with Cognito works
- ✅ Admin can view complaints and responses
- ✅ CORS fixed to allow credentials

**Remaining Phase 8 Tasks:**
- [x] Deploy Lambda with Cognito auth
- [x] Test admin portal login with Cognito credentials
- [x] Verify admin can view complaints
- [ ] Test Stripe webhook (optional - not critical for MVP)
- [ ] Load testing (optional - can defer to Phase 10)

**Current Status:** Phase 8 complete - application fully functional

### Validation Criteria
- [x] Health check returns 200: `curl $API_ENDPOINT/api/health`
- [x] Can submit complaint through UI
- [x] Stripe payment completes (test card 4242...)
- [x] AI response generated via Bedrock
- [x] Admin can login with Cognito credentials
- [x] Admin can view complaints in admin portal
- [ ] Load test completes: 100 concurrent requests without errors (deferred to Phase 10)
- [x] No errors in CloudWatch logs during testing

### Issues Found & Fixed
1. **Frontend API calls going to CloudFront instead of API Gateway**
   - Root cause: Hardcoded `/api/*` paths not using `apiUrl()` helper
   - Fixed: Updated config.ts to read `window.__API_BASE_URL__`
   - Fixed: All fetch calls now use `apiUrl()` or `buildUrl()`
   - Commit: 88af327

### Tasks

#### 8.1 Test API Endpoints
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

#### 8.3 Test Admin Portal
1. Navigate to admin portal: `$API_ENDPOINT/admin`
2. Login with Cognito credentials
3. Verify can view submitted complaints
4. Verify can see AI responses

**Estimated Time:** 1-2 hours

**Next:** Phase 9 - CI/CD Pipeline

---



---

## Phase 9: CI/CD Pipeline ⏳ NOT STARTED

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

#### 9.1 Create buildspec.yml
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

#### 9.2 Deploy Pipeline Stack
```bash
cd infrastructure

# Deploy CI/CD pipeline
cdk deploy PipelineStack
```

#### 9.3 Activate GitHub Connection
1. Go to AWS Console → Developer Tools → Connections
2. Find the connection "grievance-portal-github"
3. Click "Update pending connection"
4. Authorize AWS to access your GitHub repository

#### 9.4 Test Pipeline
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

**Next:** Phase 10 - Custom Domain Setup

---

## Phase 10: Custom Domain Setup ⏳ NOT STARTED

**Goal:** Configure custom domain with HTTPS for CloudFront distribution

### Validation Criteria
- [ ] Domain registered or available in Route 53
- [ ] Hosted zone created in Route 53
- [ ] ACM certificate requested for domain (must be in us-east-1 for CloudFront)
- [ ] ACM certificate validated (DNS or email validation)
- [ ] ACM certificate status shows "Issued"
- [ ] CloudFront distribution updated with custom domain as alternate domain name (CNAME)
- [ ] CloudFront distribution updated to use ACM certificate
- [ ] Route 53 A record (alias) created pointing to CloudFront distribution
- [ ] Can access application via custom domain over HTTPS
- [ ] Certificate shows valid in browser (no warnings)
- [ ] Old CloudFront URL still works (for rollback)

### Tasks

#### 10.1 Register or Verify Domain
```bash
# If you need to register a new domain
aws route53domains register-domain --domain-name example.com --cli-input-json file://domain-registration.json

# Or check existing domain
aws route53domains get-domain-detail --domain-name example.com
```

#### 10.2 Create Hosted Zone (if not exists)
```bash
# Create hosted zone
aws route53 create-hosted-zone --name example.com --caller-reference $(date +%s)

# Get hosted zone ID
HOSTED_ZONE_ID=$(aws route53 list-hosted-zones-by-name --dns-name example.com --query 'HostedZones[0].Id' --output text)
```

#### 10.3 Request ACM Certificate
```bash
# Request certificate (MUST be in us-east-1 for CloudFront)
CERT_ARN=$(aws acm request-certificate \
  --domain-name example.com \
  --validation-method DNS \
  --region us-east-1 \
  --query 'CertificateArn' \
  --output text)

# Get validation CNAME records
aws acm describe-certificate --certificate-arn $CERT_ARN --region us-east-1 \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord'
```

#### 10.4 Create DNS Validation Record
```bash
# Get validation record details from previous command
VALIDATION_NAME="<from previous output>"
VALIDATION_VALUE="<from previous output>"

# Create validation record in Route 53
aws route53 change-resource-record-sets --hosted-zone-id $HOSTED_ZONE_ID --change-batch '{
  "Changes": [{
    "Action": "CREATE",
    "ResourceRecordSet": {
      "Name": "'$VALIDATION_NAME'",
      "Type": "CNAME",
      "TTL": 300,
      "ResourceRecords": [{"Value": "'$VALIDATION_VALUE'"}]
    }
  }]
}'

# Wait for certificate validation (can take 5-30 minutes)
aws acm wait certificate-validated --certificate-arn $CERT_ARN --region us-east-1
```

#### 10.5 Update CDK Stack with Custom Domain
Add to `infrastructure/lib/frontend-stack.ts`:

```typescript
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';

// Import existing certificate
const certificate = acm.Certificate.fromCertificateArn(
  this,
  'Certificate',
  'arn:aws:acm:us-east-1:ACCOUNT:certificate/CERT_ID'
);

// Update CloudFront distribution
const distribution = new cloudfront.Distribution(this, 'Distribution', {
  // ... existing config ...
  domainNames: ['example.com'],
  certificate: certificate,
});

// Import hosted zone
const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
  domainName: 'example.com',
});

// Create A record pointing to CloudFront
new route53.ARecord(this, 'AliasRecord', {
  zone: hostedZone,
  target: route53.RecordTarget.fromAlias(
    new targets.CloudFrontTarget(distribution)
  ),
});
```

#### 10.6 Deploy Updated Stack
```bash
cd infrastructure
cdk deploy GrievancePortalFrontendStack
```

#### 10.7 Verify Custom Domain
```bash
# Test DNS resolution
dig example.com

# Test HTTPS access
curl -I https://example.com

# Check certificate
openssl s_client -connect example.com:443 -servername example.com < /dev/null 2>/dev/null | openssl x509 -noout -dates
```

**Estimated Time:** 1-2 hours (plus certificate validation wait time)

**Next:** Phase 11 - Production Hardening

---

## Phase 11: Production Hardening ⏳ NOT STARTED

**Goal:** Monitoring, security, and cost optimization

### Validation Criteria
- [ ] CloudWatch log groups exist with correct retention (1 week)
- [ ] CloudWatch alarms created and in "OK" state
- [ ] Test alarm: Trigger condition and verify alarm fires
- [ ] Lambda IAM role has minimum required permissions
- [ ] DSQL application user created with minimal grants (not using admin)
- [ ] Lambda connects with dsql:DbConnect (not DbConnectAdmin)
- [ ] API Gateway throttling configured (100 req/sec rate, 200 burst)
- [ ] Test throttling: Burst requests return 429
- [ ] HTTPS enforced on API Gateway
- [ ] No secrets in CloudWatch logs
- [ ] AWS Budget alert set for $20/month threshold
- [ ] Review AWS Cost Explorer for first week of usage
- [ ] Verify costs within expected range ($4-12/month)

### Tasks

#### 11.1 Configure CloudWatch Alarms
Alarms are defined in CDK stacks:
- Lambda error alarm (>5 errors)
- Lambda duration alarm (>10 seconds)
- DSQL DPU usage alarm (approaching free tier limit)

Verify alarms exist:
```bash
aws cloudwatch describe-alarms --alarm-names grievance-portal-*
```

#### 11.2 Review Security
```bash
# Test Lambda IAM permissions
aws lambda get-function --function-name grievance-portal --query 'Configuration.Role'

# Test API Gateway throttling
ab -n 300 -c 50 $API_ENDPOINT/api/health

# Check logs for secrets
aws logs tail /aws/lambda/grievance-portal | grep -i "password\|secret\|key"
```

#### 11.3 Create DSQL Application User
Currently the Lambda connects to DSQL as `admin` user (requires `dsql:DbConnectAdmin`). 
Create a dedicated application user with minimal permissions:

```bash
# Connect to DSQL as admin
psql $DSQL_URL

# Create application user
CREATE USER grievance_app;

# Grant only necessary permissions
GRANT SELECT, INSERT, UPDATE ON complaints TO grievance_app;
GRANT SELECT, INSERT, UPDATE ON payments TO grievance_app;
GRANT SELECT ON admin_users TO grievance_app;

# Update server/db.ts to use 'grievance_app' instead of 'admin'
# Update Lambda IAM policy to use dsql:DbConnect instead of dsql:DbConnectAdmin
```

#### 11.4 Set Up Cost Monitoring
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

**Next:** Phase 12 - Deployment Documentation

---

## Phase 12: Deployment Documentation ⏳ NOT STARTED

**Goal:** Create comprehensive deployment guide for fresh AWS accounts

### Validation Criteria
- [ ] README.md exists in repository root
- [ ] README includes project overview and architecture diagram
- [ ] Prerequisites section lists all required tools and versions
- [ ] Step-by-step deployment instructions from scratch
- [ ] Instructions for setting up Stripe test account
- [ ] Instructions for configuring SSM parameters
- [ ] Instructions for creating Cognito admin user
- [ ] Instructions for custom domain setup (optional section)
- [ ] Troubleshooting section with common issues
- [ ] Cost estimates documented
- [ ] Instructions for tearing down infrastructure
- [ ] Test: Fresh AWS account user can follow README and deploy successfully
- [ ] DEPLOY.md created with detailed technical deployment steps
- [ ] ARCHITECTURE.md created explaining design decisions

### Tasks

#### 12.1 Create README.md
Create comprehensive user-facing documentation:

**Required Sections:**
- Project overview and purpose
- Architecture overview (Lambda, API Gateway, S3, CloudFront, DSQL, Cognito)
- Prerequisites (AWS account, Node.js, AWS CLI, CDK)
- Quick start guide
- Detailed deployment steps
- Configuration guide (Stripe, SSM parameters)
- Admin user setup
- Testing the deployment
- Cost estimates
- Troubleshooting common issues
- How to tear down

#### 12.2 Create DEPLOY.md
Create detailed technical deployment guide:

**Required Sections:**
- Environment setup
- CDK bootstrap process
- Stack deployment order and dependencies
- SSM parameter configuration
- DSQL cluster setup
- Database schema migration
- Cognito user pool configuration
- Frontend deployment process
- Custom domain setup (optional)
- Rollback procedures
- Validation commands for each phase

#### 12.3 Create ARCHITECTURE.md
Document architecture and design decisions:

**Required Sections:**
- System architecture diagram (text-based or link to diagram)
- Service selection rationale (why Lambda vs ECS, why DSQL, etc.)
- Cost optimization strategies
- Security considerations
- Scalability approach
- Trade-offs and limitations
- Future enhancement opportunities

#### 12.4 Update package.json Scripts
Add helpful deployment scripts:

```json
{
  "scripts": {
    "deploy:all": "npm run build && cd infrastructure && cdk deploy --all",
    "deploy:api": "npm run build && cd infrastructure && cdk deploy GrievancePortalComputeStack",
    "deploy:frontend": "npm run build && tsx script/deploy-frontend.ts",
    "setup:db": "tsx script/create-tables.ts",
    "verify:health": "curl $API_ENDPOINT/api/health",
    "teardown": "cd infrastructure && cdk destroy --all"
  }
}
```

#### 12.5 Create .env.example
Document required environment variables:

```bash
# .env.example
# Copy to .env and fill in your values

# Stripe (get from https://dashboard.stripe.com/test/apikeys)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=123456789012

# Custom Domain (optional)
CUSTOM_DOMAIN=example.com
```

#### 12.6 Test Documentation
Validation steps:
1. Have someone unfamiliar with the project follow README
2. Document any confusion or missing steps
3. Verify all commands work as documented
4. Ensure cost estimates are accurate
5. Test troubleshooting section covers real issues encountered

**Estimated Time:** 3-4 hours

---
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
- Phase 4: Deploy Core Infrastructure ✅ Complete
- Phase 5: Deploy Application API ✅ Complete
- Phase 6: Deploy Static Frontend ✅ Complete
- Phase 7: Database Migration ✅ Complete
- Phase 8: End-to-End Testing ✅ Complete
- Phase 9: CI/CD Pipeline - 2-3 hours
- Phase 10: Custom Domain Setup - 1-2 hours
- Phase 11: Production Hardening - 2-3 hours
- Phase 12: Deployment Documentation - 3-4 hours

**Remaining Time:** 8-12 hours (1-1.5 days)

---

## Future Enhancements

### Stripe Webhook Implementation

**Current Status:** Not implemented. Payment verification uses polling approach via `/api/stripe/verify-session`.

**Why Consider Webhooks:**
- **Reliability**: Webhooks provide async confirmation even if user closes browser
- **Edge Cases**: Handle payment failures, disputes, refunds automatically
- **Scalability**: Reduces polling load on Stripe API
- **Real-time**: Instant notification of payment events

**Current Approach Works Because:**
- Simple happy-path flow (user pays → immediate verification)
- Low volume doesn't strain Stripe API rate limits
- User stays on page during payment

**Implementation Effort:** 2-3 hours
- Configure webhook endpoint in Stripe Dashboard
- Add webhook signature verification
- Handle `payment_intent.succeeded` and `payment_intent.failed` events
- Test with Stripe CLI

**Priority:** Low for MVP, Medium for production scale
