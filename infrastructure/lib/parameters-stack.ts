import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export class ParametersStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Stripe parameters (secure)
    new ssm.StringParameter(this, 'StripeSecretKey', {
      parameterName: '/grievance-portal/stripe/secret-key',
      stringValue: 'PLACEHOLDER',
      tier: ssm.ParameterTier.STANDARD,
      description: 'Stripe secret key - update after deployment',
    });

    new ssm.StringParameter(this, 'StripePublishableKey', {
      parameterName: '/grievance-portal/stripe/publishable-key',
      stringValue: 'PLACEHOLDER',
      description: 'Stripe publishable key - update after deployment',
    });

    new ssm.StringParameter(this, 'StripeWebhookSecret', {
      parameterName: '/grievance-portal/stripe/webhook-secret',
      stringValue: 'PLACEHOLDER',
      tier: ssm.ParameterTier.STANDARD,
      description: 'Stripe webhook secret - update after deployment',
    });

    // Session secret
    new ssm.StringParameter(this, 'SessionSecret', {
      parameterName: '/grievance-portal/session/secret',
      stringValue: 'PLACEHOLDER',
      tier: ssm.ParameterTier.STANDARD,
      description: 'Express session secret - update after deployment',
    });
  }
}
