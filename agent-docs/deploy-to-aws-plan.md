# AWS Deployment Plan - Grievance Portal

## Executive Summary

Deploy the Replit-based Grievance Portal to AWS with production best practices while maintaining low costs at low volume. The application will be containerized and run on ECS Fargate with Aurora Serverless v2, using Cognito for authentication and Bedrock for AI capabilities.

**Key Decisions:**
- **Compute**: ECS Fargate (containerized, auto-scaling)
- **Database**: Aurora DSQL (scales to zero, ~$0-10/month at low volume)
- **Auth**: Migrate from Replit Auth to AWS Cognito
- **AI**: Migrate from OpenAI to AWS Bedrock
- **CI/CD**: CodePipeline + CodeBuild with GitHub integration
- **Secrets**: AWS Secrets Manager for Stripe keys and other credentials
- **Infrastructure**: AWS CDK (TypeScript) for all infrastructure as code

---

## Architecture Overview

```
GitHub (main branch)
    ↓
CodePipeline (auto-trigger)
    ↓
CodeBuild (build Docker image)
    ↓
ECR (store image)
    ↓
ECS Fargate (run containers)
    ↓
Application Load Balancer (HTTPS)
    ↓
Route 53 (optional custom domain)

Supporting Services:
- Aurora DSQL (PostgreSQL-compatible, scales to zero)
- Cognito (user authentication)
- Bedrock (AI/LLM)
- Secrets Manager (Stripe keys, DB credentials)
- CloudWatch (logs & monitoring)
- S3 (build artifacts, static assets if needed)

**All infrastructure defined in AWS CDK (TypeScript)**
```

---

## Phase 1: AWS Infrastructure Setup

### 1.1 VPC and Networking

**Resources to create:**
- VPC with 2 public subnets (for ALB) and 2 private subnets (for ECS/Aurora) across 2 AZs
- Internet Gateway
- NAT Gateway (1 for cost optimization, can add 2nd for HA later)
- Route tables
- Security Groups:
  - ALB: Allow 80/443 from internet
  - ECS: Allow traffic from ALB only
  - Aurora: Allow 5432 from ECS only

**Cost**: ~$32/month for NAT Gateway (main cost), VPC is free

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

### 1.3 Secrets Manager

**Secrets to store:**
- `grievance-portal/stripe` - Stripe publishable and secret keys
- `grievance-portal/database` - Aurora DSQL connection string
- `grievance-portal/session` - Express session secret
- `grievance-portal/cognito` - Cognito app client credentials

**Cost**: $0.40/secret/month = ~$1.60/month

**CDK Resource**: `Secret` from `aws-cdk-lib/aws-secretsmanager`

### 1.4 Cognito User Pool

**Configuration:**
- User pool for admin authentication
- Email/password authentication
- MFA optional (can enable later)
- Custom attributes if needed
- App client for the web application

**Cost**: Free tier covers 50,000 MAUs (Monthly Active Users)

**CDK Resource**: `UserPool` from `aws-cdk-lib/aws-cognito`

### 1.5 ECR (Elastic Container Registry)

**Purpose**: Store Docker images for the application

**Cost**: $0.10/GB/month storage, negligible for this app

**CDK Resource**: `Repository` from `aws-cdk-lib/aws-ecr`

---

## Phase 2: Infrastructure as Code with AWS CDK

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
│   ├── network-stack.ts        # VPC, subnets, security groups
│   ├── database-stack.ts       # Aurora DSQL
│   ├── compute-stack.ts        # ECS, Fargate, ALB
│   ├── auth-stack.ts           # Cognito
│   ├── secrets-stack.ts        # Secrets Manager
│   └── pipeline-stack.ts       # CodePipeline, CodeBuild
├── cdk.json
├── package.json
└── tsconfig.json
```

### 2.2 CDK Stack Dependencies

**Stack order:**
1. `NetworkStack` - VPC and networking (no dependencies)
2. `SecretsStack` - Secrets Manager (no dependencies)
3. `DatabaseStack` - Aurora DSQL (depends on NetworkStack)
4. `AuthStack` - Cognito (no dependencies)
5. `ComputeStack` - ECS/Fargate/ALB (depends on NetworkStack, DatabaseStack, AuthStack, SecretsStack)
6. `PipelineStack` - CI/CD (depends on ComputeStack)

### 2.3 Key CDK Constructs

**Network Stack:**
- `ec2.Vpc` - VPC with public/private subnets
- `ec2.SecurityGroup` - Security groups for ALB, ECS, DSQL
- `ec2.NatGateway` - NAT gateway for private subnets

**Database Stack:**
- `CfnCluster` from `@aws-cdk/aws-dsql-alpha` - Aurora DSQL cluster
- `secretsmanager.Secret` - Store connection string

**Compute Stack:**
- `ecs.Cluster` - ECS cluster
- `ecs.FargateTaskDefinition` - Task definition
- `ecs.FargateService` - ECS service with auto-scaling
- `elbv2.ApplicationLoadBalancer` - ALB
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
cdk deploy NetworkStack

# Destroy all resources
cdk destroy --all
```

---

## Phase 3: Application Refactoring

### 3.1 Remove Replit Dependencies

**Files to modify:**
- `server/replit_integrations/auth/*` - Replace with Cognito
- `vite.config.ts` - Remove Replit plugins
- `server/stripeClient.ts` - Remove Replit connector logic

**New dependencies to add:**
```json
{
  "amazon-cognito-identity-js": "^6.3.0",
  "@aws-sdk/client-secrets-manager": "^3.x",
  "@aws-sdk/client-bedrock-runtime": "^3.x"
}
```

**Dependencies to remove:**
- `@replit/vite-plugin-*`
- `openid-client` (Replit Auth)
- `stripe-replit-sync`

### 3.2 Aurora DSQL Schema Compatibility

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

### 3.3 Cognito Integration

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

### 3.4 Bedrock Integration (Replace OpenAI)

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

### 3.5 Environment Variables

**New environment variable structure:**
```bash
# Database
DATABASE_URL=<from Secrets Manager>

# AWS Region
AWS_REGION=us-east-1

# Cognito
COGNITO_USER_POOL_ID=<from CloudFormation output>
COGNITO_CLIENT_ID=<from CloudFormation output>
COGNITO_REGION=us-east-1

# Stripe (from Secrets Manager)
STRIPE_SECRET_KEY=<from Secrets Manager>
STRIPE_PUBLISHABLE_KEY=<from Secrets Manager>
STRIPE_WEBHOOK_SECRET=<from Secrets Manager>

# Session
SESSION_SECRET=<from Secrets Manager>

# Application
NODE_ENV=production
PORT=3000
```

---

## Phase 4: Containerization

### 4.1 Dockerfile

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
    privileged: true, // Required for Docker
    environmentVariables: {
      ECR_REGISTRY: { value: ecrRepository.repositoryUri },
      ECR_REPOSITORY: { value: ecrRepository.repositoryName },
      AWS_REGION: { value: this.region },
    },
  },
  buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec.yml'),
});

ecrRepository.grantPullPush(buildProject);
```

**buildspec.yml** (create in repo root):

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

### 10.1 Estimated Monthly Costs (Low Volume)

| Service | Configuration | Monthly Cost |
|---------|--------------|--------------|
| Aurora DSQL | Free tier: 100K DPUs + 1GB | $0-10 |
| ECS Fargate | 1 task, 0.25 vCPU, 512 MB | $15 |
| NAT Gateway | 1 gateway | $32 |
| Application Load Balancer | Base + minimal traffic | $17 |
| Secrets Manager | 4 secrets | $1.60 |
| ECR | <1 GB storage | $0.10 |
| CloudWatch | Logs + metrics | $5 |
| Bedrock | Pay per use | Variable |
| **Total** | | **~$71/month** |

**Key savings vs original plan:**
- Aurora DSQL vs Aurora Serverless v2: **$33-43/month saved**
- DSQL scales to zero when idle (no minimum charges)

### 10.2 Cost Reduction Options

**If costs need to be lower:**
1. Remove NAT Gateway, use public subnets for ECS (less secure, saves $32/month)
2. Use Fargate Spot for 70% discount (less reliable)
3. DSQL already optimized (scales to zero)

**Scaling costs:**
- Auto-scaling adds ~$15/task/month
- Only scales when needed, returns to 1 task when idle
- DSQL charges only for actual usage (DPUs consumed)

---

## Phase 11: Deployment Checklist

### 11.1 Pre-Deployment

- [ ] Create AWS account / ensure access
- [ ] Choose AWS region (recommend us-east-1 for Bedrock/DSQL availability)
- [ ] Install AWS CDK: `npm install -g aws-cdk`
- [ ] Bootstrap CDK: `cdk bootstrap aws://ACCOUNT-ID/REGION`
- [ ] Register domain (optional) or use ALB DNS
- [ ] Set up Stripe webhook endpoint (will be ALB URL)
- [ ] Export Replit database
- [ ] Document current admin users

### 11.2 Infrastructure Deployment (CDK)

- [ ] Create CDK project: `mkdir infrastructure && cd infrastructure && cdk init`
- [ ] Implement all stacks (Network, Database, Auth, Secrets, Compute, Pipeline)
- [ ] Review synthesized templates: `cdk synth`
- [ ] Deploy infrastructure: `cdk deploy --all`
- [ ] Activate GitHub connection in AWS Console
- [ ] Verify all resources created successfully

### 11.3 Application Deployment

- [ ] Refactor code (remove Replit, add Cognito/Bedrock, DSQL compatibility)
- [ ] Update schema for DSQL constraints
- [ ] Create Dockerfile and buildspec.yml
- [ ] Test locally with Docker Compose
- [ ] Push code to GitHub main branch
- [ ] Verify CodePipeline triggers and builds
- [ ] Check ECS service starts successfully

### 11.4 Data Migration

- [ ] Run Drizzle migrations on Aurora DSQL
- [ ] Import data from Replit (in batches if needed)
- [ ] Migrate admin users to Cognito
- [ ] Verify data integrity

### 11.5 Post-Deployment

- [ ] Update Stripe webhook URL to ALB endpoint
- [ ] Test Stripe payment flow
- [ ] Test authentication flow with Cognito
- [ ] Test AI features (Bedrock)
- [ ] Verify CloudWatch alarms configured
- [ ] Test auto-scaling behavior
- [ ] Document deployment process

---

## Phase 12: Local Development Workflow

### 12.1 Development Setup

**One-time setup:**
```bash
# Install Docker Desktop
# Clone repository
git clone https://github.com/pisomojadogrande/grievance-portal.git
cd grievance-portal

# Create .env.local with development credentials
cp .env.example .env.local

# Start local environment
docker-compose up -d

# Run migrations
npm run db:push

# Access application
open http://localhost:3000
```

### 12.2 Development Workflow

**Iterative development:**
1. Make code changes locally
2. Test with `docker-compose up` (hot reload enabled)
3. Commit to feature branch
4. Push to GitHub
5. Create PR to main
6. Merge triggers automatic deployment to AWS

**Testing before push:**
- Unit tests: `npm test`
- Build test: `docker build -t test .`
- Integration test: `docker-compose up` and manual testing

---

## Phase 13: Rollback Strategy

### 13.1 Application Rollback (CDK-managed)

**ECS makes this easy:**
1. Go to ECS Console → Service → Deployments
2. Click "Create new deployment"
3. Select previous task definition revision
4. Deploy

**Or via CLI:**
```bash
aws ecs update-service \
  --cluster grievance-portal-cluster \
  --service grievance-portal-service \
  --task-definition grievance-portal:PREVIOUS_REVISION
```

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

**CodePipeline rollback:**
- View deployment history in console
- Re-run previous successful deployment
- Or push a revert commit to main

---

## Phase 14: Future Enhancements

### 14.1 Short-term (1-3 months)

- [ ] Add staging environment (separate ECS service)
- [ ] Implement blue/green deployments
- [ ] Add CloudFront CDN for static assets
- [ ] Set up custom domain with Route 53
- [ ] Enable WAF (Web Application Firewall) on ALB
- [ ] Add automated testing in pipeline

### 14.2 Long-term (3-6 months)

- [ ] Multi-region DSQL cluster for HA (99.999% availability)
- [ ] Implement caching with ElastiCache
- [ ] Add S3 for file uploads (if needed)
- [ ] Implement comprehensive monitoring dashboard
- [ ] Add cost anomaly detection
- [ ] Implement disaster recovery plan
- [ ] Expand CDK to include staging environment

---

## Appendix A: Key Code Changes Required

### A.1 Schema Changes for DSQL Compatibility

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

### A.2 Authentication Migration

**Remove:**
- `server/replit_integrations/auth/*`
- Passport.js configuration
- OpenID Connect client

**Add:**
- Cognito JWT verification
- Token-based authentication middleware
- Cognito user management utilities

### A.3 AI Migration

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

### A.4 Environment Variable Loading

**Add Secrets Manager integration:**
```typescript
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

async function loadSecrets() {
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION });
  const secrets = await client.send(
    new GetSecretValueCommand({ SecretId: "grievance-portal/stripe" })
  );
  return JSON.parse(secrets.SecretString);
}
```

---

## Appendix B: CDK Code Examples

### B.1 Complete Network Stack

```typescript
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly albSecurityGroup: ec2.SecurityGroup;
  public readonly ecsSecurityGroup: ec2.SecurityGroup;
  public readonly dsqlSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC with public and private subnets
    this.vpc = new ec2.Vpc(this, 'GrievancePortalVpc', {
      maxAzs: 2,
      natGateways: 1, // Cost optimization
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
    });

    // ALB Security Group
    this.albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for Application Load Balancer',
      allowAllOutbound: true,
    });
    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow HTTP'
    );
    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS'
    );

    // ECS Security Group
    this.ecsSecurityGroup = new ec2.SecurityGroup(this, 'EcsSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for ECS tasks',
      allowAllOutbound: true,
    });
    this.ecsSecurityGroup.addIngressRule(
      this.albSecurityGroup,
      ec2.Port.tcp(3000),
      'Allow traffic from ALB'
    );

    // DSQL Security Group
    this.dsqlSecurityGroup = new ec2.SecurityGroup(this, 'DsqlSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for Aurora DSQL',
      allowAllOutbound: false,
    });
    this.dsqlSecurityGroup.addIngressRule(
      this.ecsSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow PostgreSQL from ECS'
    );
  }
}
```

### B.2 Complete Database Stack

```typescript
import * as cdk from 'aws-cdk-lib';
import * as dsql from '@aws-cdk/aws-dsql-alpha';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

interface DatabaseStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  securityGroup: ec2.SecurityGroup;
}

export class DatabaseStack extends cdk.Stack {
  public readonly cluster: dsql.CfnCluster;
  public readonly connectionSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    // Aurora DSQL Cluster
    this.cluster = new dsql.CfnCluster(this, 'GrievancePortalDsql', {
      clusterName: 'grievance-portal-dsql',
      deletionProtectionEnabled: true, // Production safety
    });

    // Store connection string in Secrets Manager
    this.connectionSecret = new secretsmanager.Secret(this, 'DsqlConnectionSecret', {
      secretName: 'grievance-portal/database',
      description: 'Aurora DSQL connection string',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          host: this.cluster.attrEndpoint,
          port: 5432,
          database: 'postgres',
          username: 'admin',
        }),
        generateStringKey: 'password',
      },
    });

    // Output cluster endpoint
    new cdk.CfnOutput(this, 'DsqlEndpoint', {
      value: this.cluster.attrEndpoint,
      description: 'Aurora DSQL cluster endpoint',
    });
  }
}
```

### B.3 AWS CLI Commands

```bash
# CDK Commands
cdk synth                    # Synthesize CloudFormation templates
cdk deploy --all             # Deploy all stacks
cdk deploy NetworkStack      # Deploy specific stack
cdk diff                     # Show changes
cdk destroy --all            # Destroy all resources

# View ECS service status
aws ecs describe-services --cluster grievance-portal-cluster --services grievance-portal-service

# View recent logs
aws logs tail /ecs/grievance-portal --follow

# Trigger manual deployment
aws ecs update-service --cluster grievance-portal-cluster --service grievance-portal-service --force-new-deployment

# View DSQL cluster status
aws dsql get-cluster --identifier grievance-portal-dsql

# Monitor DSQL DPU usage
aws cloudwatch get-metric-statistics \
  --namespace AWS/DSQL \
  --metric-name TotalDPU \
  --dimensions Name=ClusterIdentifier,Value=grievance-portal-dsql \
  --start-time 2026-02-01T00:00:00Z \
  --end-time 2026-02-06T23:59:59Z \
  --period 3600 \
  --statistics Sum
```

### B.4 Docker Commands

```bash
# Build locally
docker build -t grievance-portal .

# Run locally
docker run -p 3000:3000 --env-file .env.local grievance-portal

# Push to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com
docker tag grievance-portal:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/grievance-portal:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/grievance-portal:latest
```

---

## Appendix C: Troubleshooting Guide

### C.1 Common Issues

**ECS tasks failing to start:**
- Check CloudWatch logs for errors
- Verify secrets are accessible
- Ensure security groups allow traffic
- Check task role permissions

**Database connection failures:**
- Verify security group allows ECS → DSQL
- Check connection string in Secrets Manager
- Ensure DSQL cluster is active
- Verify database credentials
- Check for DSQL-specific errors (transaction limits, unsupported features)

**DSQL-specific issues:**
- Transaction too large: Batch operations into <10K rows
- Foreign key errors: Remove from schema, enforce in app
- DDL/DML mixing: Separate into different transactions
- Temporary table errors: Use CTEs or regular tables

**Stripe webhooks not working:**
- Update webhook URL in Stripe dashboard
- Verify ALB security group allows inbound 443
- Check webhook signature verification
- Review CloudWatch logs for errors

**Build failures in CodePipeline:**
- Check CodeBuild logs
- Verify buildspec.yml syntax
- Ensure Docker build succeeds locally
- Check ECR permissions

**CDK deployment failures:**
- Check CloudFormation events in console
- Verify IAM permissions
- Check for resource naming conflicts
- Review CDK synth output for errors

---

## Summary

This plan provides a complete path from Replit to AWS with:
- ✅ Production-ready architecture
- ✅ **Very low cost at low volume (~$71/month, potentially $40-50 with DSQL free tier)**
- ✅ **Aurora DSQL scales to zero (vs $43/month minimum for Aurora Serverless v2)**
- ✅ **All infrastructure defined in AWS CDK (TypeScript)**
- ✅ Auto-scaling for growth
- ✅ Automated deployments from GitHub
- ✅ Local development environment with Docker Compose
- ✅ Security best practices
- ✅ Monitoring and logging
- ✅ Rollback capabilities

**Key Advantages of DSQL:**
- Scales to zero when idle (no minimum charges)
- Free tier: 100K DPUs + 1GB storage/month
- Multi-AZ by default (high availability)
- PostgreSQL wire protocol compatible
- Saves $33-43/month vs Aurora Serverless v2

**Trade-offs:**
- No foreign keys (enforce in application)
- No temporary tables (use CTEs)
- 10K row transaction limit (batch large operations)
- DDL/DML must be in separate transactions

**Next Steps:**
1. Review and approve this plan
2. Set up AWS account and choose region (us-east-1 recommended)
3. Install AWS CDK: `npm install -g aws-cdk`
4. Begin Phase 1 (CDK Infrastructure Setup)
5. Proceed through phases sequentially
6. Test thoroughly at each phase

**Estimated Timeline:**
- CDK infrastructure setup: 2-3 days
- Code refactoring (Cognito/Bedrock/DSQL): 3-5 days
- Testing and deployment: 2-3 days
- **Total: 1-2 weeks**
