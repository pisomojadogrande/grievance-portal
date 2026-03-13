import { SSMClient, GetParametersByPathCommand } from "@aws-sdk/client-ssm";

let cachedParams: Record<string, string> | null = null;

async function loadParameters(): Promise<Record<string, string>> {
  const ssmClient = new SSMClient({ region: process.env.AWS_REGION || 'us-east-1' });

  const params: Record<string, string> = {};
  let nextToken: string | undefined;

  do {
    const response = await ssmClient.send(
      new GetParametersByPathCommand({
        Path: '/grievance-portal/',
        Recursive: true,
        WithDecryption: true,
        NextToken: nextToken,
      })
    );

    response.Parameters?.forEach(param => {
      const key = param.Name?.replace('/grievance-portal/', '');
      if (key && param.Value) {
        params[key] = param.Value;
      }
    });

    nextToken = response.NextToken;
  } while (nextToken);

  return params;
}

export async function getParameters(): Promise<Record<string, string>> {
  if (!cachedParams) {
    cachedParams = await loadParameters();
  }
  return cachedParams;
}

export async function getParameter(key: string): Promise<string | undefined> {
  const params = await getParameters();
  return params[key.replace('/grievance-portal/', '')];
}
