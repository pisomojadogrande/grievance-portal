import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export class ComputeStack extends cdk.Stack {
  public readonly lambdaFunction: lambda.Function;
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Lambda function
    this.lambdaFunction = new lambda.Function(this, 'GrievancePortalFunction', {
      functionName: 'grievance-portal',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../lambda.zip', {
        // Will be created in Phase 4
      }),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        NODE_ENV: 'production',
        // AWS_REGION is automatically set by Lambda runtime
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    // Grant SSM Parameter Store access
    this.lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter', 'ssm:GetParametersByPath'],
      resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/grievance-portal/*`],
    }));

    // Grant Bedrock access
    this.lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: ['*'],
    }));

    // API Gateway
    this.api = new apigateway.RestApi(this, 'GrievancePortalApi', {
      restApiName: 'Grievance Portal API',
      description: 'API for Grievance Portal application',
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    // Lambda integration (proxy all requests)
    const integration = new apigateway.LambdaIntegration(this.lambdaFunction, {
      proxy: true,
    });

    // Add proxy resource to handle all paths
    this.api.root.addProxy({
      defaultIntegration: integration,
      anyMethod: true,
    });

    // Outputs
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: this.api.url,
      description: 'API Gateway endpoint URL',
    });

    new cdk.CfnOutput(this, 'LambdaFunctionName', {
      value: this.lambdaFunction.functionName,
      description: 'Lambda function name',
    });
  }
}
