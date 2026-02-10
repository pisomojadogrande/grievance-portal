import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  model?: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
}

export async function createChatCompletion(options: ChatCompletionOptions): Promise<string> {
  const modelId = options.model || 'anthropic.claude-3-5-sonnet-20240620-v1:0';
  
  const payload = {
    anthropic_version: "bedrock-2023-05-31",
    messages: options.messages,
    max_tokens: options.max_tokens || 1024,
    temperature: options.temperature || 1.0,
  };

  const command = new InvokeModelCommand({
    modelId,
    body: JSON.stringify(payload),
  });

  const response = await client.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  
  return responseBody.content[0].text;
}
