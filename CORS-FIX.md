# CORS Fix for Admin Login

**Date:** February 19, 2026  
**Issue:** Admin login fails with CORS error

## Problem
API Gateway CORS is configured with:
- `allowOrigins: ['*']` (wildcard)
- `allowCredentials: true`

This is **invalid**. When credentials are allowed, you must specify exact origins.

## Root Cause
The CDK deployment didn't receive the CloudFront URL context, so it defaulted to `*`.

CloudFront URL: `https://d1gu5o1kxvtbad.cloudfront.net`

## Fix

Redeploy with the correct CloudFront URL:

```bash
cd infrastructure
cdk deploy GrievancePortalComputeStack -c frontendUrl=https://d1gu5o1kxvtbad.cloudfront.net
```

This will update API Gateway CORS to allow the specific CloudFront origin with credentials.

## Verification

After deployment, test:
1. Visit `https://d1gu5o1kxvtbad.cloudfront.net/admin`
2. Try to login
3. Should work without CORS errors

Check API Gateway CORS headers:
```bash
curl -I -X OPTIONS \
  -H "Origin: https://d1gu5o1kxvtbad.cloudfront.net" \
  -H "Access-Control-Request-Method: POST" \
  https://gm56eowgc6.execute-api.us-east-1.amazonaws.com/prod/api/admin/login
```

Should see:
```
Access-Control-Allow-Origin: https://d1gu5o1kxvtbad.cloudfront.net
Access-Control-Allow-Credentials: true
```

## README Update Needed

The deployment instructions should include this context parameter in the initial deployment.
