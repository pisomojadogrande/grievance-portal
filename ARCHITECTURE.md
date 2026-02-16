# Architecture Documentation

## Overview

The Grievance Portal is a serverless web application built on AWS, designed for minimal cost at low volume through scale-to-zero architecture.

## System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         Internet                              │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │   Route 53 (DNS)     │  Optional custom domain
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  CloudFront (CDN)    │  Static content delivery
              │  + S3 Bucket         │  React SPA hosting
              └──────────┬───────────┘
                         │
                         │ API calls
                         ▼
              ┌──────────────────────┐
              │   API Gateway        │  REST API endpoint
              │   (HTTP API)         │  Request routing
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │   Lambda Function    │  Express.js application
              │   (Node.js 20)       │  Business logic
              └─┬────────┬─────┬─────┘
                │        │     │
       ┌────────┘        │     └────────┐
       │                 │              │
       ▼                 ▼              ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│ Aurora DSQL │   │ SSM Params  │   │  Bedrock    │
│ (Postgres)  │   │ (Secrets)   │   │  (Claude)   │
└─────────────┘   └─────────────┘   └─────────────┘
       │
       │ IAM Auth
       ▼
┌─────────────┐
│  Cognito    │  Admin authentication
│ User Pool   │  JWT tokens
└─────────────┘

External:
┌─────────────┐
│   Stripe    │  Payment processing
│   (Test)    │  Webhooks (future)
└─────────────┘
```

## Service Selection Rationale

### Lambda vs ECS Fargate

**Why Lambda:**
- **Cost**: Scales to zero when idle ($0 vs $71/month for always-on Fargate)
- **Simplicity**: No container management, VPC configuration, or load balancer
- **Serverless-express**: Existing Express.js app runs with minimal changes
- **Cold starts**: Acceptable for low-traffic application (<1s)

**Trade-offs:**
- Cold start latency (mitigated by keeping Lambda warm with periodic pings)
- 15-minute execution limit (not an issue for API requests)
- Stateless (session state in cookies/JWT, not in-memory)

### Aurora DSQL vs RDS/DynamoDB

**Why DSQL:**
- **Scale-to-zero**: No cost when idle (RDS requires always-on instance)
- **PostgreSQL-compatible**: Standard SQL, easy migration
- **Serverless**: Auto-scales with demand
- **IAM authentication**: No password management

**vs RDS:**
- RDS requires minimum t3.micro instance ($15-20/month always-on)
- RDS requires VPC, security groups, subnet configuration
- DSQL simpler for low-volume workloads

**vs DynamoDB:**
- DynamoDB would be cheaper at scale
- DSQL chosen for PostgreSQL compatibility (easier migration from Replit)
- Relational model fits complaint/payment data structure

**Trade-offs:**
- DSQL limitations: No SERIAL/IDENTITY, no foreign keys, no sequences
- Manual ID generation required
- Newer service (less mature than RDS)

### API Gateway vs ALB

**Why API Gateway:**
- **Serverless**: No always-on cost
- **Scales automatically**: No capacity planning
- **Built-in features**: Throttling, API keys, usage plans
- **Lambda integration**: Native support

**vs ALB:**
- ALB requires always-on cost ($16/month minimum)
- ALB requires VPC configuration
- API Gateway simpler for Lambda-only workloads

### S3 + CloudFront vs Amplify Hosting

**Why S3 + CloudFront:**
- **Cost control**: Pay only for storage and data transfer
- **Flexibility**: Full control over caching, headers, behaviors
- **CDK integration**: Infrastructure as code

**vs Amplify Hosting:**
- Amplify simpler but less flexible
- S3 + CloudFront chosen for learning CDK patterns
- CloudFront provides global CDN at low cost

### Cognito vs Custom Auth

**Why Cognito:**
- **Managed service**: No password storage, hashing, or session management
- **JWT tokens**: Stateless authentication
- **Free tier**: Up to 50,000 MAUs
- **Security**: Built-in protection against common attacks

**Trade-offs:**
- Overkill for single admin user
- Could use simpler approach (basic auth, API key)
- Chosen for production-ready pattern

### Bedrock vs OpenAI

**Why Bedrock:**
- **AWS-native**: No external API keys, uses IAM
- **Cost**: Pay-per-use, no subscription
- **Claude models**: High-quality responses
- **Regional**: Stays within AWS infrastructure

**vs OpenAI:**
- Original Replit version used OpenAI
- Bedrock chosen to eliminate external dependencies
- Similar quality, better AWS integration

## Cost Optimization Strategies

### Scale-to-Zero Architecture

Every component scales to zero when idle:

| Service | Idle Cost | Active Cost |
|---------|-----------|-------------|
| Lambda | $0 | $0.20 per 1M requests |
| API Gateway | $0 | $1.00 per 1M requests |
| DSQL | $0 | $0.30 per 1M DPUs |
| S3 | ~$0.10/month | + data transfer |
| CloudFront | $0 (free tier) | $0.085/GB after 1TB |
| Cognito | $0 (free tier) | $0.0055/MAU after 50K |
| SSM Parameters | $0 | $0 (standard params) |

**Total idle cost: ~$0.10/month**

### Request Cost Breakdown

Per 1000 requests:
- API Gateway: $0.001
- Lambda (100ms avg): $0.0002
- DSQL (10 DPUs avg): $0.003
- Bedrock (Claude Haiku): $0.25
- **Total: ~$0.25 per 1000 requests**

At 1000 requests/month: **$4-5/month**

### Comparison to ECS Fargate

| Component | Fargate | Lambda |
|-----------|---------|--------|
| Compute | $36/month (always-on) | $0-2/month |
| Load Balancer | $16/month | $0 (API Gateway) |
| Database | $20/month (RDS t3.micro) | $0-5/month (DSQL) |
| **Total** | **$71/month** | **$4-12/month** |

**Savings: 83-94%**

## Security Considerations

### Secrets Management

- All secrets in SSM Parameter Store (encrypted at rest)
- No hardcoded credentials in code
- Lambda uses IAM roles (no long-lived credentials)
- DSQL uses IAM authentication (no passwords)

### Network Security

- CloudFront serves HTTPS only (TLS 1.2+)
- API Gateway HTTPS only
- DSQL requires SSL connections
- No public database endpoints

### Authentication & Authorization

- Admin portal uses Cognito JWT tokens
- Tokens validated on every request
- Short-lived tokens (1 hour default)
- Refresh tokens for session extension

### IAM Least Privilege

Lambda execution role has minimal permissions:
- `ssm:GetParameter` - Read secrets only
- `dsql:DbConnectAdmin` - Connect to DSQL only
- `bedrock:InvokeModel` - Call Claude only
- `logs:CreateLogGroup/Stream/Events` - Write logs only

### Data Protection

- SSM parameters encrypted with AWS-managed KMS key
- DSQL data encrypted at rest
- S3 bucket not public (CloudFront OAI access only)
- No PII logged to CloudWatch

## Scalability Approach

### Current Scale

Designed for low volume:
- < 1000 requests/month
- < 100 complaints/month
- Single admin user

### Scaling Limits

| Component | Current | Max Capacity |
|-----------|---------|--------------|
| Lambda | 1 concurrent | 1000 (default limit) |
| API Gateway | No limit | 10,000 req/sec |
| DSQL | Auto-scales | 1M+ DPUs |
| CloudFront | Global CDN | Unlimited |

### Scaling Strategy

**0-10K requests/month:**
- Current architecture sufficient
- No changes needed
- Cost: $4-12/month

**10K-100K requests/month:**
- Enable Lambda reserved concurrency
- Add CloudWatch alarms
- Consider DynamoDB for payments table
- Cost: $20-50/month

**100K+ requests/month:**
- Add API Gateway caching
- Use DynamoDB instead of DSQL
- Add WAF for security
- Consider SQS for async processing
- Cost: $100-200/month

## Trade-offs and Limitations

### DSQL Limitations

**No auto-increment:**
- Must generate IDs manually: `SELECT MAX(id) + 1`
- Race condition possible (mitigated by low volume)
- Production would use UUID or distributed ID generator

**No foreign keys:**
- Referential integrity enforced in application code
- Could lead to orphaned records
- Acceptable for simple data model

**No sequences:**
- Can't use PostgreSQL sequences
- Manual ID generation required

### Lambda Cold Starts

**Impact:**
- First request after idle: 1-2 seconds
- Subsequent requests: <100ms
- Acceptable for low-traffic application

**Mitigation:**
- Keep Lambda warm with periodic pings (future)
- Increase memory for faster cold starts
- Use provisioned concurrency (costs more)

### Stateless Architecture

**No in-memory sessions:**
- Session state in JWT tokens
- Can't use Express session middleware
- Must design for stateless requests

**No WebSockets:**
- API Gateway HTTP API doesn't support WebSockets
- Would need API Gateway WebSocket API
- Not needed for current use case

### Single Region

**All resources in us-east-1:**
- Bedrock only available in limited regions
- No multi-region redundancy
- Acceptable for learning project

**Disaster recovery:**
- Manual backup/restore process
- No automated failover
- RTO/RPO measured in hours

## Future Enhancement Opportunities

### Performance

1. **Lambda provisioned concurrency** - Eliminate cold starts
2. **API Gateway caching** - Cache GET requests
3. **CloudFront caching** - Longer TTLs for static assets
4. **DynamoDB** - Faster than DSQL for simple queries

### Features

1. **Stripe webhooks** - Async payment confirmation
2. **Email notifications** - SES for complaint confirmations
3. **Admin dashboard** - Analytics, charts, metrics
4. **Rate limiting** - Prevent abuse

### Operations

1. **CI/CD pipeline** - Automated deployments
2. **CloudWatch alarms** - Error rate, latency, cost
3. **X-Ray tracing** - Request flow visualization
4. **Automated backups** - DSQL export to S3

### Security

1. **WAF** - DDoS protection, rate limiting
2. **Secrets rotation** - Automated secret updates
3. **MFA** - For admin users
4. **Audit logging** - CloudTrail for compliance

### Cost Optimization

1. **S3 Intelligent-Tiering** - Automatic storage class transitions
2. **CloudFront reserved capacity** - Discount for predictable traffic
3. **Savings Plans** - Commit to Lambda/Fargate usage
4. **DynamoDB on-demand** - Better pricing at scale

## Design Decisions

### Why Express.js on Lambda?

**Pros:**
- Reuse existing Express.js code
- Minimal refactoring required
- Familiar patterns for developers
- Serverless-express wrapper handles API Gateway integration

**Cons:**
- Not "pure" serverless (could use API Gateway + Lambda directly)
- Slightly higher cold start time
- Less granular per-route optimization

**Decision:** Chosen for migration simplicity. Future could split into individual Lambda functions per route.

### Why CDK over CloudFormation/Terraform?

**Pros:**
- Type-safe infrastructure code (TypeScript)
- Higher-level constructs (less boilerplate)
- AWS-native (best support for new services)
- Reuse application code patterns

**Cons:**
- AWS-only (vendor lock-in)
- Steeper learning curve than CloudFormation
- Generated templates harder to debug

**Decision:** Chosen for learning AWS patterns and type safety.

### Why Monorepo?

**Pros:**
- Single repository for app + infrastructure
- Shared TypeScript types between frontend/backend
- Simplified dependency management
- Easier to keep in sync

**Cons:**
- Larger repository size
- Mixed concerns (app vs infrastructure)
- Harder to split teams

**Decision:** Chosen for simplicity in single-developer project.

## Lessons Learned

### Migration from Replit

**Challenges:**
1. Replit Auth → Cognito (different patterns)
2. OpenAI → Bedrock (different API)
3. Always-on → Serverless (stateless design)
4. PostgreSQL → DSQL (feature limitations)

**Successes:**
1. Express.js worked with minimal changes
2. React frontend unchanged
3. Stripe integration portable
4. Cost reduced by 83-94%

### AWS Service Selection

**What worked well:**
- Lambda + API Gateway (simple, cheap)
- S3 + CloudFront (reliable, fast)
- SSM Parameter Store (free, secure)

**What was challenging:**
- DSQL limitations (no auto-increment)
- Cognito complexity (overkill for single user)
- CDK learning curve (but worth it)

### Cost Optimization

**Effective strategies:**
- Scale-to-zero architecture
- Avoid always-on resources
- Use free tiers (Cognito, SSM)
- Serverless-first approach

**Missed opportunities:**
- Could use DynamoDB (cheaper at scale)
- Could use Lambda@Edge (reduce latency)
- Could use S3 static website (skip CloudFront)

## Conclusion

The Grievance Portal demonstrates a cost-effective serverless architecture for low-volume web applications. By leveraging scale-to-zero services and avoiding always-on resources, monthly costs are reduced by 83-94% compared to traditional container-based deployments.

The architecture prioritizes:
1. **Cost efficiency** - Pay only for actual usage
2. **Simplicity** - Minimal infrastructure management
3. **Security** - AWS-managed services, IAM-based auth
4. **Scalability** - Auto-scales with demand

Trade-offs include cold start latency, DSQL limitations, and single-region deployment. These are acceptable for a learning project and low-volume production use.

Future enhancements could improve performance, add features, and optimize costs further, but the current architecture achieves the primary goal: running a functional web application on AWS for $4-12/month.
