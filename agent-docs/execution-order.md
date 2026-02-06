# AWS Deployment - Correct Execution Order

## Overview

This document provides the correct execution order for deploying the Grievance Portal to AWS. Each phase has clear validation criteria for verifiable progress.

---

## Phase 1: Pre-Deployment Setup

**Goal:** Prepare local environment and AWS account

**Tasks:**
- Install AWS CLI, CDK, SAM CLI, Node.js 20+
- Configure AWS credentials and select region (recommend us-east-1)
- Bootstrap CDK: `cdk bootstrap aws://ACCOUNT-ID/REGION`
- Export Replit database: `pg_dump $REPLIT_DB_URL > backup.sql`
- Document current admin users

**Validation Criteria:**
- [ ] `aws sts get-caller-identity` returns account info
- [ ] `cdk --version` shows version
- [ ] `sam --version` shows version  
- [ ] `node --version` shows v20+
- [ ] `aws cloudformation describe-stacks --stack-name CDKToolkit` succeeds
- [ ] `backup.sql` file exists with database export

**Estimated Time:** 30 minutes

---

## Phase 2: CDK Project Structure

**Goal:** Create infrastructure-as-code framework

**Tasks:**
- Create `infrastructure/` directory
- Initialize CDK project: `npx aws-cdk init app --language typescript`
- Create stack files:
  - `lib/parameters-stack.ts` - SSM Parameter Store
  - `lib/database-stack.ts` - Aurora DSQL
  - `lib/auth-stack.ts` - Cognito
  - `lib/compute-stack.ts` - Lambda + API Gateway
  - `lib/pipeline-stack.ts` - CI/CD (later)
- Define stack dependencies in `bin/grievance-portal.ts`

**Validation Criteria:**
- [ ] CDK project initializes: `cd infrastructure && npm install` succeeds
- [ ] Project compiles: `npm run build` succeeds
- [ ] Synth works: `cdk synth` generates CloudFormation templates
- [ ] All stack files exist and compile
- [ ] `cdk diff` shows expected resources (no deployment yet)

**Estimated Time:** 1-2 hours

---

## Phase 3: Application Refactoring

**Goal:** Make application code AWS-compatible (can overlap with Phase 2)

**Tasks:**
- Install dependencies: `npm install @codegenie/serverless-express @aws-sdk/client-ssm @aws-sdk/client-bedrock-runtime`
- Create Lambda handler: `server/lambda.ts`
- Update Express app to export: `server/index.ts`
- Update schema for DSQL compatibility: `shared/schema.ts` (remove foreign keys, use UUIDs)
- Create SSM parameter loader: `server/aws/ssm.ts`
- Create Bedrock client: `server/aws/bedrock.ts`
- Create Cognito auth middleware: `server/auth/cognito.ts`
- Remove Replit dependencies from `package.json`
- Update build script for Lambda: `script/build.ts`

**Validation Criteria:**
- [ ] Application builds: `npm run build` succeeds
- [ ] Lambda handler exports correctly: `server/lambda.ts` has `export const handler`
- [ ] Express app exports: `server/index.ts` has `export default app`
- [ ] No Replit dependencies in `package.json`
- [ ] Schema compiles without foreign key references
- [ ] All new AWS SDK imports resolve

**Estimated Time:** 3-5 hours

---

## Phase 4: Lambda Build & Local Testing

**Goal:** Verify application works before deploying to AWS

**Tasks:**
- Update `package.json` build scripts
- Build Lambda package: `npm run build && npm run package:lambda`
- Create `sam-template.yaml` for local testing
- Create `.env.local` with local development config
- Start local PostgreSQL: `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:15`
- Run migrations locally: `DATABASE_URL=postgresql://localhost:5432/postgres npm run db:push`
- Test Lambda locally: `sam local start-api`

**Validation Criteria:**
- [ ] Build completes: `npm run build` succeeds
- [ ] Lambda package created: `lambda.zip` exists and is <50MB
- [ ] Package structure correct: unzip and verify `index.js` exists
- [ ] Local PostgreSQL running: `psql postgresql://localhost:5432/postgres -c "SELECT 1;"`
- [ ] Local migrations succeed
- [ ] SAM starts: `sam local start-api` runs without errors
- [ ] Health check responds: `curl http://localhost:3000/api/health` returns 200

**Estimated Time:** 2-3 hours

---

## Phase 5: Deploy Core Infrastructure

**Goal:** Deploy DSQL, SSM, Cognito via CDK

**Tasks:**
- Implement `ParametersStack` with placeholder values
- Implement `DatabaseStack` with Aurora DSQL cluster
- Implement `AuthStack` with Cognito user pool
- Deploy stacks: `cd infrastructure && cdk deploy ParametersStack DatabaseStack AuthStack`
- Update SSM parameters with real values: `aws ssm put-parameter --name /grievance-portal/stripe/secret-key --value "sk_test_..." --type SecureString --overwrite`
- Create Cognito admin user

**Validation Criteria:**
- [ ] CDK deployment succeeds: `cdk deploy ParametersStack DatabaseStack AuthStack` completes
- [ ] DSQL cluster active: `aws dsql get-cluster --identifier grievance-portal-dsql` shows "ACTIVE"
- [ ] Can connect to DSQL: `psql $DSQL_URL -c "SELECT version();"`
- [ ] SSM parameters exist: `aws ssm get-parameters-by-path --path /grievance-portal/ --recursive` shows all params
- [ ] SSM parameters retrievable: `aws ssm get-parameter --name /grievance-portal/session/secret --with-decryption` works
- [ ] Cognito user pool exists: `aws cognito-idp list-user-pools --max-results 10` shows pool
- [ ] Cognito admin user created

**Estimated Time:** 2-3 hours

---

## Phase 6: Deploy Lambda + API Gateway

**Goal:** Deploy application to AWS

**Tasks:**
- Build production Lambda package: `npm run build && npm run package:lambda`
- Upload to S3 (CDK will create bucket): Manual upload or via CDK asset
- Implement `ComputeStack` with Lambda function and API Gateway
- Configure Lambda IAM permissions (SSM, DSQL, Bedrock)
- Deploy: `cd infrastructure && cdk deploy ComputeStack`
- Get API Gateway URL from CDK output

**Validation Criteria:**
- [ ] CDK deployment succeeds: `cdk deploy ComputeStack` completes
- [ ] Lambda function exists: `aws lambda get-function --function-name grievance-portal` succeeds
- [ ] Lambda has correct IAM permissions (check role in console)
- [ ] API Gateway created: `aws apigateway get-rest-apis` shows API
- [ ] API endpoint URL output from CDK
- [ ] Health check works: `curl https://API_ID.execute-api.REGION.amazonaws.com/prod/api/health` returns 200
- [ ] CloudWatch log group exists: `aws logs describe-log-groups --log-group-name-prefix /aws/lambda/grievance-portal`
- [ ] Lambda invocation logs appear in CloudWatch

**Estimated Time:** 2-3 hours

---

## Phase 7: Database Migration

**Goal:** Migrate schema and data to DSQL

**Tasks:**
- Run Drizzle migrations against DSQL: `DATABASE_URL=$DSQL_URL npm run db:push`
- Verify schema: `psql $DSQL_URL -c "\dt"`
- Import data from backup (in batches if needed): `psql $DSQL_URL < backup.sql`
- Verify row counts match
- Migrate admin users to Cognito
- Update application to use DSQL connection string from SSM

**Validation Criteria:**
- [ ] Schema migration completes: `npm run db:push` succeeds
- [ ] All tables created: `psql $DSQL_URL -c "\dt"` shows expected tables
- [ ] Table structure correct: `psql $DSQL_URL -c "\d complaints"` shows columns
- [ ] No foreign key constraints in schema
- [ ] Data import completes without errors
- [ ] Row counts match: `SELECT COUNT(*) FROM complaints` matches old DB
- [ ] Sample queries return expected results
- [ ] Admin users exist in Cognito

**Estimated Time:** 1-2 hours

---

## Phase 8: End-to-End Testing

**Goal:** Verify full application functionality

**Tasks:**
- Test health check endpoint
- Test complaint submission flow
- Test Stripe payment (sandbox)
- Test AI response generation (Bedrock)
- Test admin authentication (Cognito)
- Test admin portal access
- Test Stripe webhook (update URL in Stripe dashboard)
- Load test with 100 concurrent requests

**Validation Criteria:**
- [ ] Health check returns 200: `curl API_ENDPOINT/api/health`
- [ ] Can submit complaint through UI
- [ ] Stripe payment completes (sandbox)
- [ ] AI response generated via Bedrock
- [ ] Admin can login with Cognito
- [ ] Admin can view complaints
- [ ] Stripe webhook processes successfully
- [ ] Load test completes without errors
- [ ] All CloudWatch alarms in "OK" state
- [ ] No errors in CloudWatch logs

**Estimated Time:** 2-3 hours

---

## Phase 9: CI/CD Pipeline

**Goal:** Automate deployments from GitHub

**Tasks:**
- Create `buildspec.yml` in repo root
- Implement `PipelineStack` with CodeBuild and CodePipeline
- Create GitHub connection in AWS Console
- Deploy: `cd infrastructure && cdk deploy PipelineStack`
- Activate GitHub connection in AWS Console
- Test: Push commit to main branch

**Validation Criteria:**
- [ ] CDK deployment succeeds: `cdk deploy PipelineStack` completes
- [ ] GitHub connection created and "Available" status
- [ ] CodeBuild project exists
- [ ] CodePipeline created with Source → Build stages
- [ ] Manual test: Push commit triggers pipeline within 1 minute
- [ ] CodeBuild completes successfully
- [ ] Lambda function code updated automatically
- [ ] Test updated Lambda: `curl API_ENDPOINT/api/health`
- [ ] CloudWatch logs show new deployment

**Estimated Time:** 2-3 hours

---

## Phase 10: Monitoring & Security

**Goal:** Production hardening

**Tasks:**
- Configure CloudWatch alarms (Lambda errors, API Gateway 5xx, DSQL DPU usage)
- Set up SNS topic for alarm notifications
- Review Lambda IAM role (principle of least privilege)
- Configure API Gateway throttling (100 req/sec rate, 200 burst)
- Verify HTTPS enforced on API Gateway
- Review CloudWatch logs for sensitive data
- Test IAM permissions (Lambda can access SSM, DSQL, Bedrock only)
- Verify Cognito password policy

**Validation Criteria:**
- [ ] CloudWatch alarms created and in "OK" state
- [ ] Test alarm: Trigger condition and verify alarm fires
- [ ] SNS notifications work (if configured)
- [ ] Lambda IAM role has minimum required permissions
- [ ] API Gateway throttling configured
- [ ] Test throttling: Burst requests return 429
- [ ] HTTPS enforced: HTTP requests fail or redirect
- [ ] No secrets in CloudWatch logs
- [ ] Unauthenticated requests to protected endpoints return 401

**Estimated Time:** 2-3 hours

---

## Phase 11: Cost Optimization

**Goal:** Verify costs and set budgets

**Tasks:**
- Review AWS Cost Explorer for first week
- Verify services within free tier limits
- Set up AWS Budget alert for $20/month
- Tag all resources with cost allocation tags
- Calculate actual cost per request
- Document any cost surprises

**Validation Criteria:**
- [ ] Cost Explorer shows usage for all services
- [ ] Lambda within free tier (1M requests, 400K GB-seconds)
- [ ] API Gateway within free tier (1M requests first 12 months)
- [ ] DSQL within free tier (100K DPUs, 1GB storage)
- [ ] CloudWatch costs <$2/month
- [ ] Budget alert configured and tested
- [ ] All resources tagged
- [ ] Actual costs match estimates ($4-12/month)

**Estimated Time:** 1 hour

---

## Phase 12: Documentation & Rollback

**Goal:** Finalize procedures and test rollback

**Tasks:**
- Document deployment process
- Document rollback procedures
- Test Lambda rollback (update alias to previous version)
- Create DSQL backup plan via AWS Backup
- Test DSQL restore
- Document local development workflow
- Update agent-docs with final architecture

**Validation Criteria:**
- [ ] Deployment process documented
- [ ] Rollback procedures documented and tested
- [ ] Lambda versions visible: `aws lambda list-versions-by-function`
- [ ] Lambda rollback tested and verified
- [ ] DSQL backup plan configured
- [ ] DSQL restore tested
- [ ] Local development workflow documented
- [ ] All agent-docs updated

**Estimated Time:** 2-3 hours

---

## Total Estimated Time

**Minimum:** 20-25 hours (1-2 weeks part-time)
**Maximum:** 30-35 hours (2-3 weeks part-time)

---

## Success Criteria

**Production Ready When:**
- ✅ All 12 phases validated
- ✅ End-to-end testing complete
- ✅ Costs within expected range ($4-12/month)
- ✅ CI/CD pipeline working
- ✅ Monitoring and alarms configured
- ✅ Rollback procedures tested
- ✅ Documentation complete

---

## Quick Reference: Phase Dependencies

```
Phase 1 (Pre-Deployment)
    ↓
Phase 2 (CDK Structure) ←→ Phase 3 (Code Refactoring) [can overlap]
    ↓                              ↓
    ↓                          Phase 4 (Local Testing)
    ↓                              ↓
Phase 5 (Core Infrastructure) ←────┘
    ↓
Phase 6 (Lambda + API Gateway)
    ↓
Phase 7 (Database Migration)
    ↓
Phase 8 (End-to-End Testing)
    ↓
Phase 9 (CI/CD Pipeline)
    ↓
Phase 10 (Monitoring & Security)
    ↓
Phase 11 (Cost Optimization)
    ↓
Phase 12 (Documentation & Rollback)
```

---

## Next Steps

1. Review this execution order
2. Confirm AWS account access and region selection
3. Begin Phase 1 (Pre-Deployment Setup)
4. Proceed sequentially through phases
5. Validate each phase before moving to next
