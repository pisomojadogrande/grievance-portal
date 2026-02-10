import { getParameters } from "./aws/ssm";

let initialized = false;

export async function initializeApp() {
  if (initialized) return;
  
  // Load SSM parameters into environment variables
  // In Lambda, always load from SSM
  // Locally, only load if DATABASE_URL is not already set
  if (process.env.AWS_EXECUTION_ENV || !process.env.DATABASE_URL) {
    const params = await getParameters();
    
    // Map SSM parameters to environment variables
    process.env.DATABASE_URL = params['database/url'];
    process.env.STRIPE_SECRET_KEY = params['stripe/secret-key'];
    process.env.STRIPE_PUBLISHABLE_KEY = params['stripe/publishable-key'];
    process.env.STRIPE_WEBHOOK_SECRET = params['stripe/webhook-secret'];
    process.env.SESSION_SECRET = params['session/secret'];
    process.env.COGNITO_USER_POOL_ID = params['cognito/user-pool-id'];
    process.env.COGNITO_CLIENT_ID = params['cognito/client-id'];
  }
  
  initialized = true;
}
