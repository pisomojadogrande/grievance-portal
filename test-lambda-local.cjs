#!/usr/bin/env node

// Test Lambda handler locally by simulating Lambda environment
process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_nodejs20.x';
process.env.NODE_ENV = 'production';
process.env.AWS_REGION = 'us-east-1';

// Mock SSM parameters
process.env.DATABASE_URL = 'postgresql://admin:password@<DSQL_CLUSTER_ID>.dsql.us-east-1.on.aws:5432/postgres?sslmode=require';
process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_mock';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_mock';
process.env.SESSION_SECRET = 'test-session-secret';

// Load the handler
const { handler } = require('./dist/lambda.cjs');

// Simulate API Gateway event for /api/health
const event = {
  resource: '/{proxy+}',
  path: '/api/health',
  httpMethod: 'GET',
  headers: {
    'Accept': 'application/json',
    'Host': 'test.execute-api.us-east-1.amazonaws.com',
  },
  multiValueHeaders: {},
  queryStringParameters: null,
  multiValueQueryStringParameters: null,
  pathParameters: {
    proxy: 'api/health'
  },
  stageVariables: null,
  requestContext: {
    accountId: '123456789012',
    apiId: 'test',
    protocol: 'HTTP/1.1',
    httpMethod: 'GET',
    path: '/prod/api/health',
    stage: 'prod',
    requestId: 'test-request-id',
    requestTime: new Date().toISOString(),
    requestTimeEpoch: Date.now(),
    identity: {
      sourceIp: '127.0.0.1',
    },
  },
  body: null,
  isBase64Encoded: false,
};

const context = {
  awsRequestId: 'test-request-id',
  functionName: 'test-function',
  functionVersion: '$LATEST',
  memoryLimitInMB: '512',
  logGroupName: '/aws/lambda/test',
  logStreamName: 'test-stream',
  getRemainingTimeInMillis: () => 30000,
};

console.log('Testing Lambda handler locally...');
console.log('Request: GET /api/health\n');

// Invoke handler
handler(event, context)
  .then(response => {
    console.log('✅ Success!');
    console.log('Status:', response.statusCode);
    console.log('Headers:', JSON.stringify(response.headers, null, 2));
    console.log('Body:', response.body);
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });

