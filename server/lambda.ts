import serverlessExpress from '@codegenie/serverless-express';
import { initializeApp } from './init';

let cachedHandler: any;
let appInitialized = false;

async function getApp() {
  if (appInitialized) {
    const app = await import('./index');
    return app.default;
  }
  
  // Import and wait for app initialization
  const appModule = await import('./index');
  await appModule.appReady; // We'll add this export
  appInitialized = true;
  return appModule.default;
}

export const handler = async (event: any, context: any) => {
  await initializeApp();
  
  if (!cachedHandler) {
    const app = await getApp();
    cachedHandler = serverlessExpress({ app });
  }
  
  return cachedHandler(event, context);
};
