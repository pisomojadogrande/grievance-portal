import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export class DatabaseStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Note: Aurora DSQL is created via AWS CLI or Console
    // CDK support is in alpha: @aws-cdk/aws-dsql-alpha
    // For now, we'll create a placeholder for the connection string
    // which will be updated after manual DSQL cluster creation

    new ssm.StringParameter(this, 'DatabaseUrl', {
      parameterName: '/grievance-portal/database/url',
      stringValue: 'PLACEHOLDER',
      tier: ssm.ParameterTier.STANDARD,
      description: 'Aurora DSQL connection string - update after cluster creation',
    });

    // Output instructions
    new cdk.CfnOutput(this, 'DatabaseSetupInstructions', {
      value: 'Create Aurora DSQL cluster manually and update /grievance-portal/database/url parameter',
      description: 'Next steps for database setup',
    });
  }
}
