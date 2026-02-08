import serverlessExpress from '@codegenie/serverless-express';
import { initializeApp } from './init';

let cachedHandler: any;

async function getApp() {
  // Import and wait for app initialization
  const appModule = await import('./index');
  await appModule.appReady;
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
