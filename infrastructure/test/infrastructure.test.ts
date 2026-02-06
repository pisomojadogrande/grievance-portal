import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ParametersStack } from '../lib/parameters-stack';
import { AuthStack } from '../lib/auth-stack';
import { DatabaseStack } from '../lib/database-stack';

test('ParametersStack creates SSM parameters', () => {
  const app = new cdk.App();
  const stack = new ParametersStack(app, 'TestParametersStack');
  const template = Template.fromStack(stack);

  template.resourceCountIs('AWS::SSM::Parameter', 4);
});

test('AuthStack creates Cognito user pool', () => {
  const app = new cdk.App();
  const stack = new AuthStack(app, 'TestAuthStack');
  const template = Template.fromStack(stack);

  template.resourceCountIs('AWS::Cognito::UserPool', 1);
  template.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
});

test('DatabaseStack creates SSM parameter for database URL', () => {
  const app = new cdk.App();
  const stack = new DatabaseStack(app, 'TestDatabaseStack');
  const template = Template.fromStack(stack);

  template.resourceCountIs('AWS::SSM::Parameter', 1);
});
