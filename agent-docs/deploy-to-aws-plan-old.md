# AWS Deployment Plan - Grievance Portal

## Executive Summary

Deploy the Replit-based Grievance Portal to AWS with production best practices while maintaining low costs at low volume. The application will be containerized and run on ECS Fargate with Aurora Serverless v2, using Cognito for authentication and Bedrock for AI capabilities.

**Key Decisions:**
- **Compute**: AWS Lambda with serverless-express wrapper (scales to zero)
- **API**: API Gateway REST API (scales to zero, replaces ALB)
- **Database**: Aurora DSQL (scales to zero, ~$0-10/month at low volume)
- **Auth**: Migrate from Replit Auth to AWS Cognito
- **AI**: Migrate from OpenAI to AWS Bedrock
- **Secrets**: SSM Parameter Store (free for standard parameters)
- **CI/CD**: CodePipeline + CodeBuild with GitHub integration
- **Infrastructure**: AWS CDK (TypeScript) for all infrastructure as code

---

## Architecture Overview

```
GitHub (main branch)
    ↓
CodePipeline (auto-trigger)
    ↓
CodeBuild (build Lambda package)
    ↓
S3 (store Lambda zip)
    ↓
Lambda (run Express app via serverless-express)
    ↓
API Gateway (HTTPS endpoints)
    ↓
Route 53 (optional custom domain)

Supporting Services:
- Aurora DSQL (PostgreSQL-compatible, scales to zero)
- Cognito (user authentication)
- Bedrock (AI/LLM)
- SSM Parameter Store (secrets - free)
- CloudWatch (logs & monitoring)

**All infrastructure defined in AWS CDK (TypeScript)**
**No VPC, No NAT Gateway, No ALB needed!**
```

---

## EXECUTION ORDER

**Phases must be completed in this order for verifiable progress:**

1. **Phase 1: Pre-Deployment Setup** - AWS account, CDK bootstrap, prerequisites
2. **Phase 2: CDK Project Structure** - Create infrastructure code framework
3. **Phase 3: Application Refactoring** - Make code AWS-compatible (can overlap with Phase 2)
4. **Phase 4: Lambda Build & Local Testing** - Verify code works before deploying
5. **Phase 5: Deploy Core Infrastructure** - DSQL, SSM, Cognito via CDK
6. **Phase 6: Deploy Lambda + API Gateway** - Deploy application via CDK
7. **Phase 7: Database Migration** - Migrate schema and data
8. **Phase 8: End-to-End Testing** - Verify full application works
9. **Phase 9: CI/CD Pipeline** - Automate deployments
10. **Phase 10: Monitoring & Security** - Production hardening
11. **Phase 11: Cost Optimization** - Verify costs and set budgets
12. **Phase 12: Documentation & Rollback** - Finalize procedures

---

## Phase 1: Pre-Deployment Setup

**Validation Criteria:**
- [ ] AWS account accessible: `aws sts get-caller-identity` returns account info
- [ ] AWS region selected and configured: `echo $AWS_REGION` or check `~/.aws/config`
- [ ] CDK installed: `cdk --version` shows version
- [ ] CDK bootstrapped: `aws cloudformation describe-stacks --stack-name CDKToolkit` succeeds
- [ ] Node.js 20+ installed: `node --version` shows v20+
- [ ] SAM CLI installed: `sam --version` shows version
- [ ] Current Replit database backed up: `backup.sql` file exists
- [ ] Stripe webhook endpoint documented (will update after deployment)

### 1.1 No VPC Required! 🎉

**Lambda runs in AWS-managed VPC by default:**
- No VPC setup needed
- No NAT Gateway needed
- No subnet configuration
- Lambda can access DSQL, Bedrock, SSM Parameter Store directly

**Cost savings: $32/month (NAT Gateway eliminated)**

### 1.2 Aurora DSQL Cluster

**Configuration:**
- Engine: PostgreSQL-compatible (wire protocol v3)
- Serverless distributed SQL database
- Scales to zero when idle (no charges)
- Multi-AZ by default (3 AZs within region)
- Single-region cluster (can add multi-region later if needed)

**Important DSQL Constraints:**
- No foreign key constraints (enforce in application layer)
- No temporary tables (use CTEs or regular tables)
- DDL and DML must be in separate transactions
- 10,000 row limit per transaction
- No auto-increment sequences (use UUIDs or application-generated IDs)

**Cost**: 
- Free tier: 100K DPUs + 1GB storage/month
- Beyond free tier: $8/million DPUs + $0.33/GB-month
- **Estimated: $0-10/month at low volume** (vs $43/month for Aurora Serverless v2)
- Scales to zero when idle = no charges during downtime

**CDK Resource**: `CfnCluster` from `@aws-cdk/aws-dsql-alpha` (L1 construct)

### 1.3 SSM Parameter Store (Replaces Secrets Manager)

**Parameters to store:**
- `/grievance-portal/stripe/secret-key` - Stripe secret key
- `/grievance-portal/stripe/publishable-key` - Stripe publishable key
- `/grievance-portal/stripe/webhook-secret` - Stripe webhook secret
- `/grievance-portal/database/url` - Aurora DSQL connection string
- `/grievance-portal/session/secret` - Express session secret
- `/grievance-portal/cognito/user-pool-id` - Cognito user pool ID
- `/grievance-portal/cognito/client-id` - Cognito client ID

**Cost**: **FREE** for standard parameters (up to 10,000)

**CDK Resource**: `StringParameter` from `aws-cdk-lib/aws-ssm`

**Comparison to Secrets Manager:**
- Secrets Manager: $0.40/secret/month = $2.80/month for 7 secrets
- SSM Parameter Store: $0/month
- **Savings: $2.80/month**

**Trade-off:** No automatic rotation (manual rotation via Lambda if needed)

### 1.4 Cognito User Pool

**Configuration:**
- User pool for admin authentication
- Email/password authentication
- MFA optional (can enable later)
- Custom attributes if needed
- App client for the web application

**Cost**: Free tier covers 50,000 MAUs (Monthly Active Users)

**CDK Resource**: `UserPool` from `aws-cdk-lib/aws-cognito`

### 1.5 S3 Bucket for Lambda Deployment

**Purpose**: Store Lambda deployment packages (zip files)

**Cost**: Negligible (<1 GB storage)

**CDK Resource**: `Bucket` from `aws-cdk-lib/aws-s3`

---

## Phase 2: Infrastructure as Code with AWS CDK

**Validation Criteria:**
- [ ] CDK project initializes successfully: `cdk synth` runs without errors
- [ ] All stack files compile: `npm run build` succeeds
- [ ] CloudFormation templates generated in `cdk.out/` directory
- [ ] Stack dependencies correctly defined (no circular dependencies)
- [ ] `cdk diff` shows expected resources to be created
- [ ] Dry-run deployment succeeds: `cdk deploy --all --dry-run`

### 2.1 CDK Project Structure

**Create CDK project:**
```bash
mkdir infrastructure
cd infrastructure
npx aws-cdk init app --language typescript
```

**Directory structure:**
```
infrastructure/
├── bin/
│   └── grievance-portal.ts    # CDK app entry point
├── lib/
│   ├── database-stack.ts       # Aurora DSQL
│   ├── compute-stack.ts        # Lambda + API Gateway
│   ├── auth-stack.ts           # Cognito
│   ├── parameters-stack.ts     # SSM Parameter Store
│   └── pipeline-stack.ts       # CodePipeline, CodeBuild
├── cdk.json
├── package.json
└── tsconfig.json
```

### 2.2 CDK Stack Dependencies

**Stack order:**
1. `ParametersStack` - SSM Parameter Store (no dependencies)
2. `DatabaseStack` - Aurora DSQL (no dependencies)
3. `AuthStack` - Cognito (no dependencies)
4. `ComputeStack` - Lambda + API Gateway (depends on DatabaseStack, AuthStack, ParametersStack)
5. `PipelineStack` - CI/CD (depends on ComputeStack)

### 2.3 Key CDK Constructs

**Database Stack:**
- `CfnCluster` from `@aws-cdk/aws-dsql-alpha` - Aurora DSQL cluster
- `ssm.StringParameter` - Store connection string

**Parameters Stack:**
- `ssm.StringParameter` - Store all secrets/config

**Compute Stack:**
- `lambda.Function` - Lambda function with Express app
- `apigateway.RestApi` - API Gateway REST API
- `apigateway.LambdaIntegration` - Connect API Gateway to Lambda
- `certificatemanager.Certificate` - SSL certificate (if using custom domain)

**Auth Stack:**
- `cognito.UserPool` - User pool
- `cognito.UserPoolClient` - App client

**Pipeline Stack:**
- `codepipeline.Pipeline` - CI/CD pipeline
- `codebuild.Project` - Build project
- `codestarconnections.CfnConnection` - GitHub connection

### 2.4 CDK Deployment Commands

```bash
# Install dependencies
cd infrastructure
npm install

# Bootstrap CDK (first time only)
cdk bootstrap aws://ACCOUNT-ID/REGION

# Synthesize CloudFormation templates
cdk synth

# Deploy all stacks
cdk deploy --all

# Deploy specific stack
cdk deploy ComputeStack

# Destroy all resources
cdk destroy --all
```

---

## Phase 3: Application Refactoring

**Validation Criteria:**
- [ ] Application builds successfully: `npm run build` completes without errors
- [ ] Lambda handler exports correctly: `server/lambda.ts` has `export const handler`
- [ ] Express app exports for Lambda: `server/index.ts` has `export default app`
- [ ] All Replit dependencies removed from package.json
- [ ] Schema compiles without foreign key references
- [ ] SSM parameter loading function works locally (with AWS credentials)
- [ ] Cognito integration code compiles
- [ ] Bedrock client code compiles
- [ ] Local testing with SAM CLI: `sam local start-api` runs successfully
- [ ] Health check endpoint responds: `curl http://localhost:3000/api/health`

### 3.1 Lambda Adapter for Express App

**Install serverless-express:**
```bash
npm install @codegenie/serverless-express
```

**Create Lambda handler** (`server/lambda.ts`):
```typescript
import serverlessExpress from '@codegenie/serverless-express';
import app from './index'; // Your existing Express app

// Export Lambda handler
export const handler = serverlessExpress({ app });
```

**Update server/index.ts:**
```typescript
// Remove or conditionally include server startup
if (process.env.NODE_ENV !== 'production' || !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(port, "0.0.0.0", () => {
    log(`Server running on port ${port}`);
  });
}

// Export app for Lambda
export default app;
```

**Key changes:**
- Express app runs normally in Lambda
- No code changes to routes or middleware
- API Gateway handles HTTP → Lambda event conversion
- serverless-express handles Lambda event → Express request conversion

### 3.2 Remove Replit Dependencies

**Files to modify:**
- `server/replit_integrations/auth/*` - Replace with Cognito
- `vite.config.ts` - Remove Replit plugins
- `server/stripeClient.ts` - Remove Replit connector logic

**New dependencies to add:**
```json
{
  "@codegenie/serverless-express": "^4.14.0",
  "amazon-cognito-identity-js": "^6.3.0",
  "@aws-sdk/client-ssm": "^3.x",
  "@aws-sdk/client-bedrock-runtime": "^3.x"
}
```

**Dependencies to remove:**
- `@replit/vite-plugin-*`
- `openid-client` (Replit Auth)
- `stripe-replit-sync`

### 3.3 Aurora DSQL Schema Compatibility

**Review current schema for DSQL constraints:**

1. **Remove foreign key constraints** (DSQL doesn't support them):
   ```typescript
   // Before (in shared/schema.ts)
   export const payments = pgTable("payments", {
     complaintId: integer("complaint_id").references(() => complaints.id)
   });
   
   // After
   export const payments = pgTable("payments", {
     complaintId: integer("complaint_id") // Remove .references()
   });
   ```
   - Enforce referential integrity in application code
   - Add validation in storage layer

2. **Replace auto-increment with UUIDs** (if using SERIAL):
   ```typescript
   // Before
   id: serial("id").primaryKey()
   
   // After
   id: uuid("id").defaultRandom().primaryKey()
   ```

3. **Check transaction sizes**:
   - DSQL limits: 10,000 rows per transaction
   - Review bulk operations in `storage.ts`
   - Add batching if needed

4. **Remove temporary tables** (if any):
   - Replace with CTEs or regular tables with cleanup

### 3.4 Cognito Integration

**Backend changes** (`server/auth/cognito.ts` - new file):

- Implement Cognito JWT verification middleware
- Replace `isAuthenticated` checks with Cognito token validation
- Update session management to use Cognito tokens
- Migrate admin user creation to Cognito

**Frontend changes** (`client/src/lib/auth.ts` - new file):
- Implement Cognito authentication flow
- Replace Replit Auth UI with Cognito Hosted UI or custom login
- Update `useAuth` hook to work with Cognito

**Migration strategy:**
- Export existing admin users from current DB
- Create corresponding users in Cognito
- Update user references to use Cognito sub (user ID)

### 3.5 Bedrock Integration (Replace OpenAI)

**Current OpenAI usage locations:**
- `server/routes.ts` - AI complaint response generation
- `server/replit_integrations/audio/client.ts` - Speech-to-text, text-to-speech
- `server/replit_integrations/chat/routes.ts` - Chat completions
- `server/replit_integrations/image/client.ts` - Image generation

**Bedrock equivalents:**
- Text generation: Claude 3 (Anthropic) or Titan
- Speech: Amazon Polly (text-to-speech), Amazon Transcribe (speech-to-text)
- Images: Stable Diffusion via Bedrock

**New file** (`server/bedrock/client.ts`):
- Bedrock runtime client initialization
- Wrapper functions matching OpenAI interface
- Model selection: `anthropic.claude-3-sonnet-20240229-v1:0`

**Changes required:**
- Replace `openai.chat.completions.create()` with Bedrock invoke
- Update prompt formatting for Claude (uses different format than OpenAI)
- Replace audio integrations with Polly/Transcribe
- Update image generation to use Stable Diffusion

### 3.6 SSM Parameter Store Integration

**Load parameters at Lambda startup:**
```typescript
import { SSMClient, GetParameterCommand, GetParametersByPathCommand } from "@aws-sdk/client-ssm";

const ssmClient = new SSMClient({ region: process.env.AWS_REGION });

async function loadParameters() {
  const response = await ssmClient.send(
    new GetParametersByPathCommand({
      Path: '/grievance-portal/',
      Recursive: true,
      WithDecryption: true, // For SecureString parameters
    })
  );
  
  const params: Record<string, string> = {};
  response.Parameters?.forEach(param => {
    const key = param.Name?.replace('/grievance-portal/', '');
    if (key && param.Value) {
      params[key] = param.Value;
    }
  });
  
  return params;
}

// Cache parameters (Lambda container reuse)
let cachedParams: Record<string, string> | null = null;

export async function getParameters() {
  if (!cachedParams) {
    cachedParams = await loadParameters();
  }
  return cachedParams;
}
```

**Use in application:**
```typescript
const params = await getParameters();
const stripeSecretKey = params['stripe/secret-key'];
const dbUrl = params['database/url'];
```

### 3.7 Environment Variables

**New environment variable structure:**
```bash
# AWS Region
AWS_REGION=us-east-1

# Lambda-specific
AWS_LAMBDA_FUNCTION_NAME=grievance-portal-function

# Application
NODE_ENV=production

# All secrets loaded from SSM Parameter Store at runtime
```

---

## Phase 4: Lambda Deployment Package

**Validation Criteria:**
- [ ] Build script completes: `npm run build` succeeds
- [ ] Lambda package created: `lambda.zip` file exists
- [ ] Package size is reasonable (<50MB uncompressed, <10MB compressed)
- [ ] Package contains `index.js` handler
- [ ] Package structure is correct: unzip and verify contents
- [ ] Local Lambda test succeeds: `sam local invoke GrievancePortalFunction`
- [ ] Test event returns expected response
- [ ] No unnecessary files in package (node_modules trimmed to production only)

### 4.1 Build Script

**Update package.json:**
```json
{
  "scripts": {
    "build": "tsx script/build.ts",
    "build:lambda": "npm run build && npm run package:lambda",
    "package:lambda": "cd dist && zip -r ../lambda.zip . && cd .."
  }
}
```

**Update build script** (`script/build.ts`):
```typescript
// Build for Lambda (single file output)
await esbuild({
  entryPoints: ['server/lambda.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: 'dist/index.js',
  external: ['aws-sdk', '@aws-sdk/*'], // AWS SDK available in Lambda runtime
  minify: true,
});
```

### 4.2 Lambda Package Structure

```
lambda.zip
├── index.js           # Bundled Lambda handler
├── node_modules/      # Production dependencies
└── package.json       # For Lambda runtime
```

### 4.3 Local Testing

**Test Lambda locally with SAM CLI:**
```bash
# Install SAM CLI
brew install aws-sam-cli

# Create sam-template.yaml
sam local start-api

# Test endpoint
curl http://localhost:3000/api/health
```

---

## Phase 5: Lambda + API Gateway Setup (via CDK)

**Validation Criteria:**
- [ ] CDK deployment succeeds: `cdk deploy ComputeStack` completes
- [ ] Lambda function appears in AWS Console
- [ ] Lambda function has correct IAM permissions (SSM, Bedrock, DSQL)
- [ ] API Gateway REST API created with correct stage
- [ ] API Gateway endpoint URL output from CDK
- [ ] Test API endpoint: `curl https://API_ID.execute-api.REGION.amazonaws.com/prod/api/health`
- [ ] Health check returns 200 OK with JSON response
- [ ] CloudWatch log group created: `/aws/lambda/grievance-portal`
- [ ] Lambda invocation logs appear in CloudWatch
- [ ] Test cold start time (should be <3 seconds)
- [ ] Test warm invocation time (should be <500ms)

**Create** `Dockerfile`:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.cjs"]
```

### 4.2 .dockerignore

**Create** `.dockerignore`:
```
node_modules
.git
.env
*.log
dist
.replit
replit.nix
```

### 4.3 Docker Compose for Local Development

**Create** `docker-compose.yml`:
```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: grievance_portal
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/grievance_portal
      NODE_ENV: development
      AWS_REGION: us-east-1
      # Add other env vars from .env.local
    depends_on:
      - postgres
    volumes:
      - .:/app
      - /app/node_modules

volumes:
  postgres_data:
```

**Create** `.env.local` for local development (gitignored):
```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/grievance_portal
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
SESSION_SECRET=local-dev-secret
AWS_REGION=us-east-1
# Use AWS credentials from ~/.aws/credentials for local Bedrock testing
```

---

## Phase 5: ECS Fargate Setup (via CDK)

### 5.1 ECS Cluster (CDK)

**CDK Code** (`lib/compute-stack.ts`):
```typescript
const cluster = new ecs.Cluster(this, 'GrievancePortalCluster', {
  vpc,
  clusterName: 'grievance-portal-cluster',
  containerInsights: true,
});
```

### 5.2 Task Definition (CDK)

**CDK Code:**
```typescript
const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
  cpu: 256,
  memoryLimitMiB: 512,
  taskRole: taskRole,
  executionRole: executionRole,
});

const container = taskDefinition.addContainer('app', {
  image: ecs.ContainerImage.fromEcrRepository(ecrRepository, 'latest'),
  logging: ecs.LogDrivers.awsLogs({
    streamPrefix: 'grievance-portal',
    logRetention: logs.RetentionDays.ONE_WEEK,
  }),
  environment: {
    AWS_REGION: this.region,
    NODE_ENV: 'production',
    PORT: '3000',
  },
  secrets: {
    DATABASE_URL: ecs.Secret.fromSecretsManager(dbSecret),
    STRIPE_SECRET_KEY: ecs.Secret.fromSecretsManager(stripeSecret, 'secret_key'),
    STRIPE_PUBLISHABLE_KEY: ecs.Secret.fromSecretsManager(stripeSecret, 'publishable_key'),
    SESSION_SECRET: ecs.Secret.fromSecretsManager(sessionSecret),
    COGNITO_USER_POOL_ID: ecs.Secret.fromSecretsManager(cognitoSecret, 'user_pool_id'),
    COGNITO_CLIENT_ID: ecs.Secret.fromSecretsManager(cognitoSecret, 'client_id'),
  },
});

container.addPortMappings({ containerPort: 3000 });
```

### 5.3 ECS Service (CDK)

**CDK Code:**
```typescript
const service = new ecs.FargateService(this, 'Service', {
  cluster,
  taskDefinition,
  desiredCount: 1,
  minHealthyPercent: 0, // Allow stopping old task before starting new one (cost optimization)
  maxHealthyPercent: 200,
  healthCheckGracePeriod: cdk.Duration.seconds(60),
  circuitBreaker: { rollback: true },
});

// Auto-scaling
const scaling = service.autoScaleTaskCount({
  minCapacity: 1,
  maxCapacity: 3,
});

scaling.scaleOnCpuUtilization('CpuScaling', {
  targetUtilizationPercent: 70,
  scaleInCooldown: cdk.Duration.seconds(60),
  scaleOutCooldown: cdk.Duration.seconds(60),
});
```

**Cost**: ~$15/month (1 task * 0.25 vCPU * $0.04048/hour * 730 hours)

### 5.4 Application Load Balancer (CDK)

**CDK Code:**
```typescript
const alb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
  vpc,
  internetFacing: true,
  loadBalancerName: 'grievance-portal-alb',
});

const targetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroup', {
  vpc,
  port: 3000,
  protocol: elbv2.ApplicationProtocol.HTTP,
  targetType: elbv2.TargetType.IP,
  healthCheck: {
    path: '/api/health',
    interval: cdk.Duration.seconds(30),
    timeout: cdk.Duration.seconds(5),
    healthyThresholdCount: 2,
    unhealthyThresholdCount: 3,
  },
});

service.attachToApplicationTargetGroup(targetGroup);

// HTTP listener (redirect to HTTPS)
alb.addListener('HttpListener', {
  port: 80,
  defaultAction: elbv2.ListenerAction.redirect({
    protocol: 'HTTPS',
    port: '443',
    permanent: true,
  }),
});

// HTTPS listener
const httpsListener = alb.addListener('HttpsListener', {
  port: 443,
  certificates: [certificate], // From ACM
  defaultAction: elbv2.ListenerAction.forward([targetGroup]),
});
```

**Cost**: ~$16/month base + $0.008/LCU-hour

---

## Phase 6: CI/CD Pipeline (via CDK)

**Validation Criteria:**
- [ ] GitHub connection created and shows "Available" status in AWS Console
- [ ] CodeBuild project created and configured correctly
- [ ] CodePipeline created with Source → Build stages
- [ ] S3 bucket for artifacts exists
- [ ] Manual test: Push commit to main branch
- [ ] Pipeline automatically triggers within 1 minute
- [ ] CodeBuild phase completes successfully
- [ ] Lambda function code updated automatically
- [ ] Test updated Lambda: `curl API_ENDPOINT/api/health`
- [ ] CloudWatch logs show new deployment
- [ ] Verify Lambda version incremented
- [ ] Test rollback: Update Lambda to previous version and verify

### 6.1 CodeBuild Project (CDK)

**CDK Code** (`lib/pipeline-stack.ts`):
```typescript
const buildProject = new codebuild.Project(this, 'BuildProject', {
  projectName: 'grievance-portal-build',
  source: codebuild.Source.gitHub({
    owner: 'pisomojadogrande',
    repo: 'grievance-portal',
    webhook: true,
    webhookFilters: [
      codebuild.FilterGroup.inEventOf(codebuild.EventAction.PUSH).andBranchIs('main'),
    ],
  }),
  environment: {
    buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
    environmentVariables: {
      S3_BUCKET: { value: deploymentBucket.bucketName },
      AWS_REGION: { value: this.region },
    },
  },
  buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec.yml'),
});

deploymentBucket.grantReadWrite(buildProject);
lambdaFunction.grantUpdate(buildProject);
```

**buildspec.yml** (create in repo root):
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

```yaml
version: 0.2

phases:
  pre_build:
    commands:
      - echo Logging in to Amazon ECR...
      - aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY
      - COMMIT_HASH=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)
      - IMAGE_TAG=${COMMIT_HASH:=latest}
  build:
    commands:
      - echo Build started on `date`
      - docker build -t $ECR_REPOSITORY:$IMAGE_TAG .
      - docker tag $ECR_REPOSITORY:$IMAGE_TAG $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
      - docker tag $ECR_REPOSITORY:$IMAGE_TAG $ECR_REGISTRY/$ECR_REPOSITORY:latest
  post_build:
    commands:
      - echo Build completed on `date`
      - docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
      - docker push $ECR_REGISTRY/$ECR_REPOSITORY:latest
      - printf '[{"name":"grievance-portal","imageUri":"%s"}]' $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG > imagedefinitions.json

artifacts:
  files: imagedefinitions.json
```

artifacts:
  files: imagedefinitions.json
```

### 6.2 CodePipeline (CDK)

**CDK Code:**
```typescript
const sourceOutput = new codepipeline.Artifact();
const buildOutput = new codepipeline.Artifact();

const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
  pipelineName: 'grievance-portal-pipeline',
  stages: [
    {
      stageName: 'Source',
      actions: [
        new codepipeline_actions.CodeStarConnectionsSourceAction({
          actionName: 'GitHub_Source',
          owner: 'pisomojadogrande',
          repo: 'grievance-portal',
          branch: 'main',
          connectionArn: githubConnection.attrConnectionArn,
          output: sourceOutput,
        }),
      ],
    },
    {
      stageName: 'Build',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Docker_Build',
          project: buildProject,
          input: sourceOutput,
          outputs: [buildOutput],
        }),
      ],
    },
    {
      stageName: 'Deploy',
      actions: [
        new codepipeline_actions.EcsDeployAction({
          actionName: 'ECS_Deploy',
          service: ecsService,
          input: buildOutput,
        }),
      ],
    },
  ],
});
```

**Cost**: Free tier covers first pipeline, then $1/month per pipeline

### 6.3 GitHub Connection (CDK)

**CDK Code:**
```typescript
const githubConnection = new codestarconnections.CfnConnection(this, 'GitHubConnection', {
  connectionName: 'grievance-portal-github',
  providerType: 'GitHub',
});

// Note: Connection must be manually activated in AWS Console after creation
new cdk.CfnOutput(this, 'GitHubConnectionArn', {
  value: githubConnection.attrConnectionArn,
  description: 'Activate this connection in AWS Console',
});
```

**Manual step required:**
1. After CDK deploy, go to AWS Console → Developer Tools → Connections
2. Find the connection and click "Update pending connection"
3. Authorize AWS to access your GitHub repository

---

## Phase 7: Database Migration

**Validation Criteria:**
- [ ] DSQL cluster connection successful: `psql $DSQL_URL -c "SELECT version();"`
- [ ] Schema migration completes: `npm run db:push` succeeds
- [ ] All tables created: `psql $DSQL_URL -c "\dt"` shows expected tables
- [ ] Table structure correct: `psql $DSQL_URL -c "\d complaints"` shows columns
- [ ] No foreign key constraints in schema
- [ ] Data export from Replit successful: `backup.sql` file created
- [ ] Data import to DSQL completes without errors
- [ ] Row counts match: Compare `SELECT COUNT(*) FROM complaints` between old and new DB
- [ ] Sample data queries return expected results
- [ ] Admin users migrated to Cognito
- [ ] Test authentication with migrated user
- [ ] Application connects to DSQL successfully via Lambda

### 7.1 Schema Migration to Aurora DSQL

**Steps:**
1. Update schema to remove DSQL-incompatible features:
   ```bash
   # Edit shared/schema.ts to remove foreign keys
   # Replace SERIAL with UUID if needed
   ```

2. Run Drizzle migrations against Aurora DSQL:
   ```bash
   DATABASE_URL=<dsql-url> npm run db:push
   ```

3. Verify schema:
   ```bash
   psql $DSQL_URL -c "\dt"  # List tables
   ```

### 7.2 Data Export from Replit

**Export data:**
```bash
pg_dump $REPLIT_DB_URL > backup.sql
```

### 7.3 Data Import to Aurora DSQL

**Important**: DSQL has transaction limits (10K rows), so batch large imports:

```bash
# For small datasets
psql $DSQL_URL < backup.sql

# For large datasets, split into batches
split -l 10000 backup.sql backup_part_
for file in backup_part_*; do
  psql $DSQL_URL < $file
done
```

### 7.4 Connection String Format

**Aurora DSQL connection string:**
```
postgresql://username:password@cluster-id.dsql.us-east-1.on.aws:5432/postgres
```

Store in Secrets Manager, reference in ECS task definition via CDK.

---

## Phase 8: Monitoring and Logging

**Validation Criteria:**
- [ ] CloudWatch log groups exist: `/aws/lambda/grievance-portal`, `/aws/codebuild/grievance-portal-build`
- [ ] Lambda logs appear in real-time: `aws logs tail /aws/lambda/grievance-portal --follow`
- [ ] Log retention set correctly (1 week)
- [ ] CloudWatch alarms created and in "OK" state
- [ ] Test alarm: Trigger high CPU/error condition and verify alarm fires
- [ ] SNS topic created for alarm notifications (if configured)
- [ ] Test notification: Manually trigger alarm and verify email received
- [ ] CloudWatch Insights queries work: Run sample query on Lambda logs
- [ ] Metrics dashboard shows Lambda invocations, duration, errors
- [ ] DSQL DPU usage visible in CloudWatch metrics
- [ ] API Gateway metrics visible (request count, latency, errors)

### 8.1 CloudWatch Logs (CDK)

**Configured automatically in task definition:**
```typescript
logging: ecs.LogDrivers.awsLogs({
  streamPrefix: 'grievance-portal',
  logRetention: logs.RetentionDays.ONE_WEEK,
})
```

**Log groups:**
- `/ecs/grievance-portal` - Application logs
- `/aws/codebuild/grievance-portal` - Build logs

### 8.2 CloudWatch Alarms (CDK)

**CDK Code:**
```typescript
// ECS CPU alarm
new cloudwatch.Alarm(this, 'EcsCpuAlarm', {
  metric: service.metricCpuUtilization(),
  threshold: 80,
  evaluationPeriods: 2,
  alarmDescription: 'ECS CPU > 80%',
});

// ALB 5xx errors
new cloudwatch.Alarm(this, 'Alb5xxAlarm', {
  metric: alb.metricHttpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT),
  threshold: 10,
  evaluationPeriods: 1,
  alarmDescription: 'ALB 5xx errors > 10',
});

// DSQL DPU usage (for cost monitoring)
new cloudwatch.Alarm(this, 'DsqlDpuAlarm', {
  metric: new cloudwatch.Metric({
    namespace: 'AWS/DSQL',
    metricName: 'TotalDPU',
    statistic: 'Sum',
    period: cdk.Duration.hours(1),
  }),
  threshold: 50000, // Alert if approaching free tier limit
  evaluationPeriods: 1,
  alarmDescription: 'DSQL DPU usage high',
});
```

**Actions**: SNS topic → Email notification (configure in CDK)

### 8.3 Application Monitoring

**Add health check endpoint** (`server/routes.ts`):
```typescript
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});
```

---

## Phase 9: Security Hardening

**Validation Criteria:**
- [ ] Lambda IAM role has minimum required permissions (principle of least privilege)
- [ ] Test IAM permissions: Lambda can access SSM, DSQL, Bedrock
- [ ] Test IAM restrictions: Lambda cannot access unrelated services
- [ ] All secrets stored in SSM Parameter Store (SecureString type)
- [ ] No secrets in environment variables or code
- [ ] API Gateway has throttling configured (100 req/sec rate, 200 burst)
- [ ] Test throttling: Send burst of requests and verify 429 responses
- [ ] HTTPS enforced on API Gateway (no HTTP access)
- [ ] Test security: `curl http://API_ENDPOINT` should fail or redirect
- [ ] CloudWatch logs don't contain sensitive data (passwords, keys)
- [ ] Review IAM policy simulator for Lambda role
- [ ] Verify Cognito user pool has secure password policy
- [ ] Test authentication: Unauthenticated requests to protected endpoints return 401

### 9.1 IAM Roles (CDK)

**ECS Task Role:**
```typescript
const taskRole = new iam.Role(this, 'TaskRole', {
  assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
  managedPolicies: [
    iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
  ],
});

// Secrets Manager access
dbSecret.grantRead(taskRole);
stripeSecret.grantRead(taskRole);
sessionSecret.grantRead(taskRole);

// Bedrock access
taskRole.addToPolicy(new iam.PolicyStatement({
  actions: ['bedrock:InvokeModel'],
  resources: ['*'], // Or specific model ARNs
}));
```

**ECS Execution Role:**
```typescript
const executionRole = new iam.Role(this, 'ExecutionRole', {
  assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
  managedPolicies: [
    iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
  ],
});

ecrRepository.grantPull(executionRole);
```

### 9.2 Security Groups (CDK)

**Configured in NetworkStack:**
```typescript
// ALB Security Group
const albSg = new ec2.SecurityGroup(this, 'AlbSg', {
  vpc,
  description: 'ALB security group',
  allowAllOutbound: true,
});
albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));
albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443));

// ECS Security Group
const ecsSg = new ec2.SecurityGroup(this, 'EcsSg', {
  vpc,
  description: 'ECS tasks security group',
});
ecsSg.addIngressRule(albSg, ec2.Port.tcp(3000));

// DSQL Security Group
const dsqlSg = new ec2.SecurityGroup(this, 'DsqlSg', {
  vpc,
  description: 'Aurora DSQL security group',
});
dsqlSg.addIngressRule(ecsSg, ec2.Port.tcp(5432));
```

### 9.3 Secrets Rotation

**Enable automatic rotation (CDK):**
```typescript
const dbSecret = new secretsmanager.Secret(this, 'DbSecret', {
  secretName: 'grievance-portal/database',
  generateSecretString: {
    secretStringTemplate: JSON.stringify({ username: 'admin' }),
    generateStringKey: 'password',
  },
});

// Enable rotation (requires Lambda function)
dbSecret.addRotationSchedule('RotationSchedule', {
  automaticallyAfter: cdk.Duration.days(30),
});
```

---

## Phase 10: Cost Optimization

**Validation Criteria:**
- [ ] Review AWS Cost Explorer for first week of usage
- [ ] Verify Lambda stays within free tier (1M requests, 400K GB-seconds)
- [ ] Verify API Gateway stays within free tier (1M requests for first 12 months)
- [ ] Verify DSQL stays within free tier (100K DPUs, 1GB storage)
- [ ] Check CloudWatch costs (<$2/month for logs)
- [ ] Set up AWS Budget alert for $20/month threshold
- [ ] Test budget alert: Verify email notification received
- [ ] Review Cost Allocation Tags on all resources
- [ ] Verify no unexpected charges (NAT Gateway, ALB, etc.)
- [ ] Calculate actual cost per request based on first week
- [ ] Compare actual costs to estimates in plan
- [ ] Document any cost surprises or optimizations needed

### 10.1 Estimated Monthly Costs (Low Volume) - UPDATED FOR LAMBDA

| Service | Configuration | Monthly Cost |
|---------|--------------|--------------|
| Aurora DSQL | Free tier: 100K DPUs + 1GB | **$0-5** |
| Lambda | Free tier: 1M requests + 400K GB-seconds<br>Beyond: $0.20/1M requests | **$0-2** |
| API Gateway | Free tier: 1M requests (first 12 months)<br>Beyond: $3.50/1M requests | **$0-3** |
| SSM Parameter Store | Standard parameters (free) | **$0** |
| CloudWatch Logs | ~2 GB ingestion + storage | **$2** |
| S3 | Lambda deployment packages | **$0.10** |
| CodeBuild | Free tier: 100 build minutes/month | **$0** |
| Bedrock | Pay-per-use | **Variable** |
| **TOTAL (excluding Bedrock)** | | **~$4-12/month** |

**Massive savings: $59-67/month vs ECS Fargate approach!** 🎉

### 10.2 Cost Comparison

| Architecture | Monthly Cost | Notes |
|--------------|--------------|-------|
| **Lambda + API Gateway** | **$4-12** | ✅ Scales to zero, no VPC |
| ECS Fargate + ALB | $71 | Always-on, requires VPC/NAT |
| Aurora Serverless v2 + ECS | $114 | Original plan with Aurora Serverless |

**Total savings: 83-94% cost reduction!**

### 10.3 Scaling Costs (Lambda Architecture)

**At 1M requests/month (free tier limit):**
- Lambda: Still free (within 400K GB-seconds)
- API Gateway: $0 (first 12 months), then $3.50/month
- **Total: ~$4-8/month**

**At 10M requests/month:**
- Lambda: ~$2 (1M free + 9M × $0.20)
- API Gateway: $35 (10M × $3.50)
- DSQL: ~$10-20 (increased usage)
- **Total: ~$47-57/month**

**Lambda scales linearly with usage - you only pay for what you use!**

---

## Phase 11: Deployment Checklist

**Validation Criteria:**
- [ ] All pre-deployment checklist items completed
- [ ] All infrastructure deployment items completed
- [ ] All application deployment items completed
- [ ] All data migration items completed
- [ ] All post-deployment items completed
- [ ] End-to-end test: Submit complaint through UI
- [ ] Test payment flow: Complete Stripe payment
- [ ] Test authentication: Login/logout with Cognito
- [ ] Test AI features: Generate AI response with Bedrock
- [ ] Test webhook: Trigger Stripe webhook and verify processing
- [ ] Load test: Send 100 concurrent requests and verify no errors
- [ ] Verify all CloudWatch alarms in "OK" state
- [ ] Document deployment date, versions, and any issues encountered

### 11.1 Pre-Deployment

- [ ] Create AWS account / ensure access
- [ ] Choose AWS region (recommend us-east-1 for Bedrock/DSQL availability)
- [ ] Install AWS CDK: `npm install -g aws-cdk`
- [ ] Bootstrap CDK: `cdk bootstrap aws://ACCOUNT-ID/REGION`
- [ ] Register domain (optional) or use API Gateway URL
- [ ] Set up Stripe webhook endpoint (will be API Gateway URL)
- [ ] Export Replit database
- [ ] Document current admin users

### 11.2 Infrastructure Deployment (CDK)

- [ ] Create CDK project: `mkdir infrastructure && cd infrastructure && cdk init`
- [ ] Implement all stacks (Database, Auth, Parameters, Compute, Pipeline)
- [ ] Review synthesized templates: `cdk synth`
- [ ] Deploy infrastructure: `cdk deploy --all`
- [ ] Verify all resources created successfully

### 11.3 Application Deployment

- [ ] Install serverless-express: `npm install @codegenie/serverless-express`
- [ ] Create Lambda handler (`server/lambda.ts`)
- [ ] Update Express app to export for Lambda
- [ ] Refactor code (remove Replit, add Cognito/Bedrock, DSQL compatibility, SSM)
- [ ] Update schema for DSQL constraints
- [ ] Create buildspec.yml
- [ ] Test locally with SAM CLI
- [ ] Push code to GitHub main branch
- [ ] Verify CodeBuild triggers and deploys Lambda
- [ ] Test API Gateway endpoint

### 11.4 Data Migration

- [ ] Run Drizzle migrations on Aurora DSQL
- [ ] Import data from Replit (in batches if needed)
- [ ] Migrate admin users to Cognito
- [ ] Verify data integrity

### 11.5 Post-Deployment

- [ ] Update Stripe webhook URL to API Gateway endpoint
- [ ] Test Stripe payment flow
- [ ] Test authentication flow with Cognito
- [ ] Test AI features (Bedrock)
- [ ] Verify CloudWatch logs working
- [ ] Test cold start performance
- [ ] Document deployment process

---

## Phase 12: Local Development Workflow

**Validation Criteria:**
- [ ] SAM CLI installed: `sam --version` shows version
- [ ] Local PostgreSQL running: `psql postgresql://localhost:5432/postgres -c "SELECT 1;"`
- [ ] Local environment variables configured in `.env.local`
- [ ] Local database migrations succeed: `npm run db:push`
- [ ] Local SAM API starts: `sam local start-api` runs without errors
- [ ] Local health check responds: `curl http://localhost:3000/api/health`
- [ ] Local development server runs: `npm run dev` starts successfully
- [ ] Hot reload works: Change code and verify auto-reload
- [ ] Local tests pass: `npm test` succeeds
- [ ] Local build succeeds: `npm run build && npm run package:lambda`
- [ ] Can test Lambda locally with sample events
- [ ] Local debugging works with breakpoints

### 12.1 Development Setup

**One-time setup:**
```bash
# Install SAM CLI for local Lambda testing
brew install aws-sam-cli

# Clone repository
git clone https://github.com/pisomojadogrande/grievance-portal.git
cd grievance-portal

# Install dependencies
npm install

# Create .env.local with development credentials
cp .env.example .env.local

# Start local PostgreSQL (or use Docker)
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:15

# Run migrations
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres npm run db:push

# Test Lambda locally
sam local start-api

# Access application
open http://localhost:3000
```

### 12.2 Development Workflow

**Iterative development:**
1. Make code changes locally
2. Test with `sam local start-api` or `npm run dev`
3. Commit to feature branch
4. Push to GitHub
5. Create PR to main
6. Merge triggers automatic deployment to AWS Lambda

**Testing before push:**
- Unit tests: `npm test`
- Build test: `npm run build && npm run package:lambda`
- Local Lambda test: `sam local start-api`

---

## Phase 13: Rollback Strategy

**Validation Criteria:**
- [ ] Lambda versions visible: `aws lambda list-versions-by-function` shows multiple versions
- [ ] Lambda alias configured: `aws lambda get-alias --function-name grievance-portal --name prod`
- [ ] Test Lambda rollback: Update alias to previous version and verify
- [ ] Verify rolled-back version works: Test API endpoint
- [ ] DSQL backup plan configured in AWS Backup
- [ ] Manual DSQL snapshot created before migration
- [ ] Test DSQL restore: Create test restore and verify data
- [ ] CDK rollback tested: `git checkout` previous commit and redeploy
- [ ] CloudFormation stack rollback tested (in non-prod environment)
- [ ] Document rollback procedures and time estimates
- [ ] Test complete rollback scenario: Lambda + Database + Infrastructure

### 13.1 Lambda Rollback

**Lambda versions:**
```bash
# List Lambda versions
aws lambda list-versions-by-function --function-name grievance-portal

# Rollback to previous version
aws lambda update-alias --function-name grievance-portal --name prod --function-version <PREVIOUS_VERSION>
```

**Or via Console:**
1. Go to Lambda Console → grievance-portal
2. Versions tab → Select previous version
3. Update alias to point to that version

### 13.2 Database Rollback (Aurora DSQL)

**Aurora DSQL backups:**
- Use AWS Backup for point-in-time recovery
- Manual snapshots before major migrations
- Restore creates new cluster (doesn't overwrite)

**CDK-managed backups:**
```typescript
// In database-stack.ts
const backupPlan = new backup.BackupPlan(this, 'DsqlBackupPlan', {
  backupPlanRules: [
    new backup.BackupPlanRule({
      ruleName: 'DailyBackup',
      scheduleExpression: events.Schedule.cron({ hour: '2', minute: '0' }),
      deleteAfter: cdk.Duration.days(7),
    }),
  ],
});

backupPlan.addSelection('DsqlSelection', {
  resources: [backup.BackupResource.fromArn(dsqlCluster.attrArn)],
});
```

### 13.3 Infrastructure Rollback (CDK)

**CDK stack rollback:**
```bash
# Rollback to previous CDK version
git checkout <previous-commit>
cdk deploy --all

# Or use CloudFormation console to rollback individual stacks
```

**CodeBuild rollback:**
- Push a revert commit to main
- CodeBuild automatically triggers and deploys

---

## Phase 14: Future Enhancements

### 14.1 Short-term (1-3 months)

- [ ] Add staging environment (separate Lambda + API Gateway)
- [ ] Implement Lambda provisioned concurrency (eliminate cold starts)
- [ ] Add CloudFront CDN for static assets and API caching
- [ ] Set up custom domain with Route 53
- [ ] Enable WAF (Web Application Firewall) on API Gateway
- [ ] Add automated testing in CodeBuild

### 14.2 Long-term (3-6 months)

- [ ] Multi-region DSQL cluster for HA (99.999% availability)
- [ ] Implement caching with ElastiCache or DynamoDB
- [ ] Add S3 for file uploads (if needed)
- [ ] Implement comprehensive monitoring dashboard
- [ ] Add cost anomaly detection
- [ ] Implement disaster recovery plan
- [ ] Expand CDK to include staging environment

---

## Appendix A: Key Code Changes Required

### A.1 Lambda Handler Creation

**New file** (`server/lambda.ts`):
```typescript
import serverlessExpress from '@codegenie/serverless-express';
import app from './index';

// Wrap Express app for Lambda
export const handler = serverlessExpress({ app });
```

**Update** (`server/index.ts`):
```typescript
// Conditionally start server (not in Lambda)
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(port, "0.0.0.0", () => {
    log(`Server running on port ${port}`);
  });
}

// Export for Lambda
export default app;
```

### A.2 Schema Changes for DSQL Compatibility

**Remove foreign keys:**
```typescript
// Before (shared/schema.ts)
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  complaintId: integer("complaint_id").references(() => complaints.id).notNull(),
  // ...
});

// After
export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(), // Changed to UUID
  complaintId: uuid("complaint_id").notNull(), // No .references()
  // ...
});

// Add validation in storage layer
async createPayment(payment: InsertPayment) {
  // Validate complaint exists
  const complaint = await this.getComplaint(payment.complaintId);
  if (!complaint) {
    throw new Error('Complaint not found');
  }
  return db.insert(payments).values(payment).returning();
}
```

### A.3 Authentication Migration

**Remove:**
- `server/replit_integrations/auth/*`
- Passport.js configuration
- OpenID Connect client

**Add:**
- Cognito JWT verification
- Token-based authentication middleware
- Cognito user management utilities

### A.4 AI Migration

**Replace OpenAI calls with Bedrock:**

**Before:**
```typescript
const response = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [{ role: "user", content: prompt }]
});
```

**After:**
```typescript
const response = await bedrockClient.invokeModel({
  modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
  body: JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 1024
  })
});
```

### A.5 SSM Parameter Store Loading

**Load parameters at Lambda startup:**
```typescript
import { SSMClient, GetParametersByPathCommand } from "@aws-sdk/client-ssm";

const ssmClient = new SSMClient({ region: process.env.AWS_REGION });
let cachedParams: Record<string, string> | null = null;

async function loadParameters() {
  const response = await ssmClient.send(
    new GetParametersByPathCommand({
      Path: '/grievance-portal/',
      Recursive: true,
      WithDecryption: true,
    })
  );
  
  const params: Record<string, string> = {};
  response.Parameters?.forEach(param => {
    const key = param.Name?.replace('/grievance-portal/', '');
    if (key && param.Value) params[key] = param.Value;
  });
  
  return params;
}

export async function getParameters() {
  if (!cachedParams) cachedParams = await loadParameters();
  return cachedParams;
}
```

## Appendix B: CDK Code Examples

### B.1 Complete Lambda + API Gateway Stack

```typescript
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export class ComputeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Lambda function
    const lambdaFunction = new lambda.Function(this, 'GrievancePortalFunction', {
      functionName: 'grievance-portal',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../lambda.zip'),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        NODE_ENV: 'production',
        AWS_REGION: this.region,
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    // Grant permissions
    lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter', 'ssm:GetParametersByPath'],
      resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/grievance-portal/*`],
    }));

    lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: ['*'],
    }));

    // API Gateway
    const api = new apigateway.RestApi(this, 'GrievancePortalApi', {
      restApiName: 'Grievance Portal API',
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
      },
    });

    // Lambda integration (proxy all requests)
    const integration = new apigateway.LambdaIntegration(lambdaFunction, { proxy: true });
    api.root.addProxy({ defaultIntegration: integration, anyMethod: true });

    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: api.url,
      description: 'API Gateway endpoint URL',
    });
  }
}
```

### B.2 Complete SSM Parameters Stack

```typescript
import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export class ParametersStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Stripe parameters
    new ssm.StringParameter(this, 'StripeSecretKey', {
      parameterName: '/grievance-portal/stripe/secret-key',
      stringValue: 'PLACEHOLDER', // Update manually after deployment
      type: ssm.ParameterType.SECURE_STRING,
    });

    new ssm.StringParameter(this, 'StripePublishableKey', {
      parameterName: '/grievance-portal/stripe/publishable-key',
      stringValue: 'PLACEHOLDER',
    });

    new ssm.StringParameter(this, 'StripeWebhookSecret', {
      parameterName: '/grievance-portal/stripe/webhook-secret',
      stringValue: 'PLACEHOLDER',
      type: ssm.ParameterType.SECURE_STRING,
    });

    // Session secret
    new ssm.StringParameter(this, 'SessionSecret', {
      parameterName: '/grievance-portal/session/secret',
      stringValue: 'PLACEHOLDER',
      type: ssm.ParameterType.SECURE_STRING,
    });
  }
}
```

### B.3 AWS CLI Commands

```bash
# CDK Commands
cdk synth                    # Synthesize CloudFormation templates
cdk deploy --all             # Deploy all stacks
cdk deploy ComputeStack      # Deploy specific stack
cdk diff                     # Show changes
cdk destroy --all            # Destroy all resources

# Lambda Commands
aws lambda list-functions
aws lambda get-function --function-name grievance-portal
aws lambda update-function-code --function-name grievance-portal --s3-bucket BUCKET --s3-key lambda.zip
aws lambda invoke --function-name grievance-portal output.json

# API Gateway Commands
aws apigateway get-rest-apis
aws apigateway test-invoke-method --rest-api-id API_ID --resource-id RESOURCE_ID --http-method GET

# View Lambda logs
aws logs tail /aws/lambda/grievance-portal --follow

# View DSQL cluster status
aws dsql get-cluster --identifier grievance-portal-dsql

# SSM Parameter Store Commands
aws ssm get-parameters-by-path --path /grievance-portal/ --recursive --with-decryption
aws ssm put-parameter --name /grievance-portal/stripe/secret-key --value "sk_live_..." --type SecureString --overwrite
```

### B.4 Local Testing Commands

```bash
# Build Lambda package
npm run build
npm run package:lambda

# Test Lambda locally with SAM
sam local start-api
curl http://localhost:3000/api/health

# Test specific Lambda function
sam local invoke GrievancePortalFunction --event test-event.json

# Run Express app normally (development)
npm run dev
```

---

## Appendix C: Troubleshooting Guide

### C.1 Common Issues

**Lambda cold starts:**
- First request after idle: 1-3 seconds
- Solution: Enable provisioned concurrency (costs extra)
- Or: Accept cold starts for low-volume app

**Lambda timeout errors:**
- Check CloudWatch logs for actual error
- Increase timeout in CDK (max 15 minutes)
- Optimize database queries

**API Gateway 502 errors:**
- Lambda function crashed or timed out
- Check CloudWatch logs: `/aws/lambda/grievance-portal`
- Verify Lambda has correct IAM permissions

**SSM Parameter Store access denied:**
- Verify Lambda IAM role has `ssm:GetParameter` permission
- Check parameter path matches: `/grievance-portal/*`
- Ensure parameters exist in correct region

**Database connection failures:**
- Verify security group allows Lambda → DSQL (Lambda uses AWS-managed VPC)
- Check connection string in SSM Parameter Store
- Ensure DSQL cluster is active
- Verify database credentials
- Check for DSQL-specific errors (transaction limits, unsupported features)

**DSQL-specific issues:**
- Transaction too large: Batch operations into <10K rows
- Foreign key errors: Remove from schema, enforce in app
- DDL/DML mixing: Separate into different transactions
- Temporary table errors: Use CTEs or regular tables

**Stripe webhooks not working:**
- Update webhook URL in Stripe dashboard to API Gateway URL
- Verify webhook signature verification
- Check CloudWatch logs for errors
- Test with Stripe CLI: `stripe listen --forward-to YOUR_API_URL/api/stripe/webhook`

**CodeBuild failures:**
- Check CodeBuild logs in CloudWatch
- Verify buildspec.yml syntax
- Ensure build succeeds locally: `npm run build && npm run package:lambda`
- Check Lambda update permissions

**CDK deployment failures:**
- Check CloudFormation events in console
- Verify IAM permissions
- Check for resource naming conflicts
- Review CDK synth output for errors

---

---

## Quick Validation Reference

### Infrastructure Validation Commands
```bash
# Check DSQL cluster
aws dsql get-cluster --identifier grievance-portal-dsql

# Check SSM parameters
aws ssm get-parameters-by-path --path /grievance-portal/ --recursive

# Check Lambda function
aws lambda get-function --function-name grievance-portal

# Check API Gateway
aws apigateway get-rest-apis
```

### Testing Commands
```bash
# Test API health check
curl https://YOUR_API_ID.execute-api.REGION.amazonaws.com/prod/api/health

# Test Lambda locally
sam local start-api
curl http://localhost:3000/api/health

# View Lambda logs
aws logs tail /aws/lambda/grievance-portal --follow

# Test database connection
psql $DSQL_URL -c "SELECT version();"
```

### Monitoring Commands
```bash
# Check CloudWatch alarms
aws cloudwatch describe-alarms --alarm-names grievance-portal-*

# View recent Lambda invocations
aws lambda get-function --function-name grievance-portal --query 'Configuration.LastModified'

# Check costs
aws ce get-cost-and-usage --time-period Start=2026-02-01,End=2026-02-07 --granularity DAILY --metrics BlendedCost
```

### Deployment Commands
```bash
# Deploy CDK stacks
cdk deploy --all

# Trigger CodeBuild
aws codebuild start-build --project-name grievance-portal-build

# Check pipeline status
aws codepipeline get-pipeline-state --name grievance-portal-pipeline
```

---

## Success Criteria Summary

**Phases 1-6 Complete When:**
- All infrastructure deployed via CDK
- Lambda function running and accessible via API Gateway
- CI/CD pipeline automatically deploying from GitHub
- All validation tests passing

**Phases 7-9 Complete When:**
- Database migrated with all data intact
- Monitoring and alarms configured and working
- Security hardening complete and tested
- No security vulnerabilities in IAM policies

**Phases 10-13 Complete When:**
- Costs within expected range ($4-12/month)
- Local development workflow documented and tested
- Rollback procedures tested and documented
- Full end-to-end testing complete

**Production Ready When:**
- All 13 phases validated
- Load testing complete (100+ concurrent requests)
- Disaster recovery plan documented
- Team trained on deployment and rollback procedures

---

## Summary

This plan provides a complete serverless path from Replit to AWS with:
- ✅ **Production-ready serverless architecture**
- ✅ **Extremely low cost: $4-12/month at low volume (83-94% savings)**
- ✅ **True scale-to-zero: Lambda, API Gateway, and DSQL all scale to zero**
- ✅ **All infrastructure defined in AWS CDK (TypeScript)**
- ✅ **No VPC, No NAT Gateway, No ALB needed**
- ✅ **Automated deployments from GitHub**
- ✅ **Local development with SAM CLI**
- ✅ **Security best practices**
- ✅ **Monitoring and logging**
- ✅ **Easy rollback capabilities**

**Key Advantages:**
- **Lambda**: Scales to zero, pay per request ($0.20/1M requests)
- **API Gateway**: Scales to zero, pay per request ($3.50/1M requests)
- **Aurora DSQL**: Scales to zero, free tier 100K DPUs/month
- **SSM Parameter Store**: Free for standard parameters
- **No always-on infrastructure costs**

**Trade-offs:**
- Cold starts (1-3 seconds after idle)
- 15-minute Lambda timeout limit
- 6MB API Gateway payload limit
- Requires Express app wrapper (serverless-express)
- DSQL constraints (no foreign keys, 10K row transactions)

**Cost Comparison:**
| Volume | Lambda Architecture | ECS Fargate | Savings |
|--------|---------------------|-------------|---------|
| Low (<100K requests/month) | $4-12 | $71 | 83-94% |
| Medium (1M requests/month) | $4-8 | $71 | 89-94% |
| High (10M requests/month) | $47-57 | $71+ | 20-34% |

**Next Steps:**
1. Review and approve this serverless plan
2. Set up AWS account and choose region (us-east-1 recommended)
3. Install AWS CDK: `npm install -g aws-cdk`
4. Install SAM CLI: `brew install aws-sam-cli`
5. Begin Phase 1 (CDK Infrastructure Setup)
6. Proceed through phases sequentially
7. Test thoroughly at each phase

**Estimated Timeline:**
- CDK infrastructure setup: 1-2 days
- Code refactoring (Lambda wrapper, Cognito/Bedrock/DSQL, SSM): 3-5 days
- Testing and deployment: 2-3 days
- **Total: 1-2 weeks**
