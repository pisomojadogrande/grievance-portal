# Claude Code Instructions

## Project Overview

The Complaints Department — a tongue-in-cheek grievance portal where users pay $5 to submit a complaint and receive an AI-generated, verbose, officious, but ultimately non-committal bureaucratic response. Includes a Stripe sandbox integration and an admin portal with Cognito authentication.

Originally built on Replit; migrated to AWS for cost efficiency (~$4-12/month vs $25+). See `agent-docs/deploy-to-aws-plan.md` for full migration status and architecture.

**Stack:** React + TypeScript frontend, Express/Node.js backend, AWS Lambda (serverless-express), Aurora DSQL, Cognito, Bedrock (Claude 3.5 Haiku), Stripe sandbox, S3 + CloudFront, API Gateway, CDK infrastructure.

## Key Rules

### Never deploy
Do NOT run `git push`, `cdk deploy`, `aws lambda update-function-code`, `npm run deploy:*`, or any other command that modifies the live AWS environment. Suggest the commands for the human to run instead.

### Git commits
- Build must succeed AND all tests must pass before committing.
- Before every commit, scan for hardcoded credentials, secrets, or AWS account IDs — never commit them.
- The human's AWS account ID should never appear in committed files.

### Keep agent-docs up to date
Maintain notes and plans under `agent-docs/`. Update them on every commit so they reflect current state. When a doc is fully finished, prepend "COMPLETED - SAVING FOR REFERENCE" and move it to `agent-docs/completed/`. Prefer updating existing docs over creating new ones.

### AWS access
You have read-only AWS credentials in the environment. Use them freely to read CloudWatch logs, inspect resources, and validate configuration. For any mutating AWS action, provide the command for the human to run.

## Local Testing

Test Lambda changes locally before asking the human to deploy:

```bash
npm run build          # compiles TypeScript, creates dist/lambda.cjs and lambda.zip
node test-lambda-local.cjs  # runs the compiled Lambda handler against a mock API Gateway event
```

The test script mocks SSM parameters and uses fake Stripe/DB credentials — no real AWS calls needed.

## NPM Install Issues

If you get `npm error code E401` (Unable to authenticate), add `--registry https://registry.npmjs.org` to the install command.

## Architecture Notes

- Frontend calls API Gateway directly (not via CloudFront proxy). API base URL is injected into `index.html` as `window.__API_BASE_URL__`.
- Lambda execution environment freezes immediately after the HTTP response is sent — **fire-and-forget async calls do not work**. Any async work (e.g. Bedrock inference) must be awaited before returning the response.
- DSQL does not support auto-increment; IDs are generated manually with `SELECT MAX(id) + 1`.
- DSQL does not support foreign key constraints; validation is done in the application layer.
