Agents should NEVER write to this file.  Only humans should write to it.  Agents should read it but NEVER WRITE to it.

# Deployment: NEVER for agents

Agents should NEVER take actions such as "git push" that will deploy changes or modify the deployed applicaion.  Only humans will do that.  Agents can suggest that humans deploy the changes but should NEVER take that action themseles.

# Keeping notes and plans

Whenever you (the agent) make a plan or complete a task that is part of a plan, keep notes in .md files under agent-docs/.  When one of these docs is fully finished, prepend a line to the top that says "COMPLETED - SAVING FOR REFERENCE" and move it to an agent-docs/completed/ directory.  Avoid creating new markdown files unless it is a truly a new topic; prefer making updates to existing docs.  Do not allow these docs to get out of date or contain information we think is wrong.  On EVERY git commit, make sure that the docs fully reflect the current state.

# Git commits

NEVER commit anything without building successfully AND seeing 100% of tests passing.  

The agent should git commit its work.  Before EVERY commit, scan the contents for any hardcoded credentials or identifiers.  These should NEVER get committed.  You should also NEVER commit my AWS Account Id.  It has no security value, but I'd prefer not to commit it.  So it should never be hardcoded but instead should be picked up from somewhere that is .gitignored.

# Access to AWS account

You have in your environment credentials to a ReadOnly IAM Role in the AWS account.  For any action that requires mutating access to the AWS account, you will need to tell the human what command to run.  But you should use your access to troubleshoot or to validate that resources are configured correctly.  

# NPM Install

If you get an "npm error code E401" ("Unable to authenticate") it is because the NPM registry by default points to something other than the general public NPM.  You can work around this with a --registry https://registry.npmjs.org for your "npm install" commands.

# Local Lambda testing

It's better if you test changes to the Lambda function locally and iterate until things work, rather than asking me to deploy every time you make a change.  The test script is test-lambda-local.cjs

What it does:
1. Sets Lambda environment variables (AWS_EXECUTION_ENV, NODE_ENV=production)
2. Mocks SSM parameters as environment variables (so it doesn't need AWS credentials)
3. Loads the compiled Lambda handler from dist/lambda.cjs
4. Creates a proper API Gateway proxy event structure
5. Invokes the handler and displays the response

How to run it:
bash
### Build first (creates dist/lambda.cjs and lambda.zip)
npm run build

### Run local test
node test-lambda-local.cjs

What you see:
- Console output showing the request being processed
- HTTP status code
- Response body (JSON)
- Any errors or logs from the Lambda handler

Key advantage: Tests the actual compiled Lambda code (dist/lambda.cjs) that will run on AWS, not the TypeScript source.
This catches issues like:
- Missing exports
- Module loading problems
- Route registration timing issues
- Environment variable dependencies

Mock values: The script uses mock Stripe keys and a test database URL, so it doesn't need real AWS credentials or make
real AWS API calls. For full integration testing with real DSQL/SSM, you'd need AWS credentials.

