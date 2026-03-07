import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

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
  // Using Haiku for fast, cost-effective creative responses
  const modelId = options.model || 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

  const command = new ConverseCommand({
    modelId,
    messages: options.messages.map(m => ({
      role: m.role,
      content: [{ text: m.content }],
    })),
    inferenceConfig: {
      maxTokens: options.max_tokens || 1024,
      temperature: options.temperature || 1.0,
    },
  });

  const response = await client.send(command);
  const text = response.output?.message?.content?.[0]?.text;
  if (!text) throw new Error('No text in Bedrock response');
  return text;
}
