#!/usr/bin/env node

/**
 * Deploy frontend to S3 and invalidate CloudFront cache
 * Usage: npm run deploy:frontend
 */

import { execSync } from 'child_process';
import { readFile, writeFile } from 'fs/promises';

function exec(command: string) {
  console.log(`> ${command}`);
  execSync(command, { stdio: 'inherit' });
}

console.log('Deploying frontend to S3...\n');

// Get stack outputs
const outputs = execSync(
  'aws cloudformation describe-stacks --stack-name GrievancePortalFrontendStack --query "Stacks[0].Outputs" --output json',
  { encoding: 'utf-8' }
);

const parsed = JSON.parse(outputs);
const bucketName = parsed.find((o: any) => o.OutputKey === 'BucketName')?.OutputValue;
const distributionId = parsed.find((o: any) => o.OutputKey === 'DistributionId')?.OutputValue;
const cloudFrontUrl = parsed.find((o: any) => o.OutputKey === 'CloudFrontUrl')?.OutputValue;

if (!bucketName || !distributionId) {
  console.error('Error: Could not find stack outputs');
  process.exit(1);
}

// Get API endpoint from ComputeStack
const computeOutputs = execSync(
  'aws cloudformation describe-stacks --stack-name GrievancePortalComputeStack --query "Stacks[0].Outputs" --output json',
  { encoding: 'utf-8' }
);
const computeParsed = JSON.parse(computeOutputs);
const apiEndpoint = computeParsed.find((o: any) => o.OutputKey === 'ApiEndpoint')?.OutputValue;

if (!apiEndpoint) {
  console.error('Error: Could not find API endpoint');
  process.exit(1);
}

console.log(`Bucket: ${bucketName}`);
console.log(`Distribution: ${distributionId}`);
console.log(`API Endpoint: ${apiEndpoint}`);
console.log(`URL: ${cloudFrontUrl}\n`);

// Inject API URL into index.html
console.log('Injecting API URL into index.html...');
const indexPath = 'dist/public/index.html';
let html = await readFile(indexPath, 'utf-8');
html = html.replace(
  '<head>',
  `<head>\n    <script>window.__API_BASE_URL__ = '${apiEndpoint}';</script>`
);
await writeFile(indexPath, html);

// Upload files to S3
exec(`aws s3 sync dist/public/ s3://${bucketName}/ --delete --cache-control "public,max-age=31536000,immutable"`);

// Invalidate CloudFront cache
console.log('\nInvalidating CloudFront cache...');
exec(`aws cloudfront create-invalidation --distribution-id ${distributionId} --paths "/*"`);

console.log('\n✅ Frontend deployed successfully!');
console.log(`Visit: ${cloudFrontUrl}`);
