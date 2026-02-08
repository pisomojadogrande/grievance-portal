import serverlessExpress from '@codegenie/serverless-express';
import app from './index';

module.exports.handler = serverlessExpress({ app });
