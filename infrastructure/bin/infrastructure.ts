#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ParametersStack } from '../lib/parameters-stack';
import { DatabaseStack } from '../lib/database-stack';
import { AuthStack } from '../lib/auth-stack';
import { ComputeStack } from '../lib/compute-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { PipelineStack } from '../lib/pipeline-stack';

const app = new cdk.App();

// Use current AWS CLI configuration
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

// Deploy stacks in dependency order
const parametersStack = new ParametersStack(app, 'GrievancePortalParametersStack', { env });
const databaseStack = new DatabaseStack(app, 'GrievancePortalDatabaseStack', { env });
const authStack = new AuthStack(app, 'GrievancePortalAuthStack', { env });

const computeStack = new ComputeStack(app, 'GrievancePortalComputeStack', { env });
computeStack.addDependency(parametersStack);
computeStack.addDependency(databaseStack);
computeStack.addDependency(authStack);

// Frontend stack depends on compute stack (needs API endpoint)
const frontendStack = new FrontendStack(app, 'GrievancePortalFrontendStack', {
  env,
  apiEndpoint: computeStack.apiEndpoint,
});
frontendStack.addDependency(computeStack);

// Pipeline stack depends on compute stack
const pipelineStack = new PipelineStack(app, 'GrievancePortalPipelineStack', {
  env,
  lambdaFunctionName: computeStack.lambdaFunction.functionName,
});
pipelineStack.addDependency(computeStack);
