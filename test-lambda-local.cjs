#!/usr/bin/env node

// Test Lambda handler locally by simulating Lambda environment
process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_nodejs20.x';
process.env.NODE_ENV = 'production';
process.env.AWS_REGION = 'us-east-1';

// Mock SSM parameters (you'll need to fill these in)
process.env.DATABASE_URL = 'postgresql://admin:password@<DSQL_CLUSTER_ID>.dsql.us-east-1.on.aws:5432/postgres?sslmode=require';
process.env.STRIPE_SECRET_KEY = 'sk_test_...';
process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_...';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_...';
process.env.SESSION_SECRET = 'test-session-secret';

// Load the handler
const { handler } = require('./dist/lambda.cjs');

// Simulate API Gateway event
const event = {
  httpMethod: 'GET',
  path: '/api/health',
  headers: {},
  queryStringParameters: null,
  body: null,
  isBase64Encoded: false,
};

const context = {
  awsRequestId: 'test-request-id',
  functionName: 'test-function',
  memoryLimitInMB: '512',
  logGroupName: '/aws/lambda/test',
  logStreamName: 'test-stream',
};

// Invoke handler
handler(event, context)
  .then(response => {
    console.log('Response:', JSON.stringify(response, null, 2));
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
