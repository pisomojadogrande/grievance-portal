# Deployment Steps - Bedrock Model Optimization

**Date:** February 19, 2026  
**Status:** ✅ DEPLOYED AND VERIFIED - February 19, 2026

## Changes Made
1. **server/aws/bedrock.ts** - Changed model from Sonnet to Haiku
2. **server/routes.ts** - Added timing instrumentation
3. **infrastructure/lib/compute-stack.ts** - Increased Lambda timeout to 90s

## Deploy Steps

### 1. Build Application
```bash
npm run build
```
Expected: Creates `lambda.zip` with updated code

### 2. Deploy Infrastructure (Lambda timeout change)
```bash
cd infrastructure
cdk deploy GrievancePortalComputeStack
```
Expected: Updates Lambda timeout from 30s to 90s

### 3. Verify Deployment
```bash
# Check Lambda configuration
aws lambda get-function-configuration \
  --function-name grievance-portal \
  --region us-east-1 \
  --query 'Timeout'
```
Expected output: `90`

### 4. Test End-to-End
1. Go to CloudFront URL
2. Submit a test complaint
3. Pay with Stripe test card (4242 4242 4242 4242)
4. Wait for AI response

### 5. Check CloudWatch Logs
```bash
# Get latest log stream
aws logs describe-log-streams \
  --log-group-name /aws/lambda/grievance-portal \
  --order-by LastEventTime \
  --descending \
  --max-items 1 \
  --region us-east-1 \
  --query 'logStreams[0].logStreamName' \
  --output text
```

Then view logs:
```bash
aws logs tail /aws/lambda/grievance-portal \
  --follow \
  --region us-east-1
```

Look for:
```
[AI] Starting analysis for complaint #X
[AI] Bedrock inference took XXXXms for complaint #X
[AI] Response for #X: ...
[AI] Successfully resolved complaint #X
```

### Expected Results
- Inference time: 5,000-10,000ms (5-10 seconds)
- No Lambda timeouts
- Response quality: Still verbose and bureaucratic

## Rollback Plan
If issues occur:
1. Revert bedrock.ts model to: `us.anthropic.claude-3-5-sonnet-20241022-v2:0`
2. Rebuild: `npm run build`
3. Redeploy: `cd infrastructure && cdk deploy GrievancePortalComputeStack`
