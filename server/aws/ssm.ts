import { SSMClient, GetParametersByPathCommand } from "@aws-sdk/client-ssm";

let cachedParams: Record<string, string> | null = null;

async function loadParameters(): Promise<Record<string, string>> {
  const ssmClient = new SSMClient({ region: process.env.AWS_REGION || 'us-east-1' });
  
  const response = await ssmClient.send(
    new GetParametersByPathCommand({
      Path: '/grievance-portal/',
      Recursive: true,
      WithDecryption: true,
    })
  );
  
  const params: Record<string, string> = {};
  response.Parameters?.forEach(param => {
    const key = param.Name?.replace('/grievance-portal/', '');
    if (key && param.Value) {
      params[key] = param.Value;
    }
  });
  
  return params;
}

export async function getParameters(): Promise<Record<string, string>> {
  if (!cachedParams) {
    cachedParams = await loadParameters();
  }
  return cachedParams;
}
