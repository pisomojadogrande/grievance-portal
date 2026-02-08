import { getParameters } from "./aws/ssm";

let initialized = false;

export async function initializeApp() {
  if (initialized) return;
  
  // Load SSM parameters into environment variables
  if (process.env.AWS_EXECUTION_ENV) {
    const params = await getParameters();
    
    // Map SSM parameters to environment variables
    process.env.DATABASE_URL = params['database/url'];
    process.env.STRIPE_SECRET_KEY = params['stripe/secret-key'];
    process.env.STRIPE_PUBLISHABLE_KEY = params['stripe/publishable-key'];
    process.env.STRIPE_WEBHOOK_SECRET = params['stripe/webhook-secret'];
    process.env.SESSION_SECRET = params['session/secret'];
  }
  
  initialized = true;
}
