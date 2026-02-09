#!/usr/bin/env node

/**
 * Deploy frontend to S3 and invalidate CloudFront cache
 * Usage: npm run deploy:frontend
 */

import { execSync } from 'child_process';

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

console.log(`Bucket: ${bucketName}`);
console.log(`Distribution: ${distributionId}`);
console.log(`URL: ${cloudFrontUrl}\n`);

// Upload files to S3
exec(`aws s3 sync dist/public/ s3://${bucketName}/ --delete --cache-control "public,max-age=31536000,immutable"`);

// Invalidate CloudFront cache
console.log('\nInvalidating CloudFront cache...');
exec(`aws cloudfront create-invalidation --distribution-id ${distributionId} --paths "/*"`);

console.log('\n✅ Frontend deployed successfully!');
console.log(`Visit: ${cloudFrontUrl}`);
