import serverlessExpress from '@codegenie/serverless-express';
import { initializeApp } from './init';
import app from './index';

let cachedHandler: any;

export const handler = async (event: any, context: any) => {
  await initializeApp();
  
  if (!cachedHandler) {
    cachedHandler = serverlessExpress({ app });
  }
  
  return cachedHandler(event, context);
};
