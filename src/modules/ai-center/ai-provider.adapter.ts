import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiModel, AiProvider } from '@prisma/client';
import { OpenAiRequestDto } from './dto/open-ai.dto';

export interface AiProviderResult {
  output: unknown;
  requestTokens?: number;
  responseTokens?: number;
  totalTokens?: number;
  raw: unknown;
}

@Injectable()
export class AiProviderAdapter {
  constructor(private readonly config: ConfigService) {}

  async callOpenAiCompatible(input: {
    kind: 'chat' | 'generate';
    provider: AiProvider;
    model: AiModel;
    body: OpenAiRequestDto;
  }): Promise<AiProviderResult> {
    const baseUrl = (input.provider.baseUrl ?? 'https://api.openai.com/v1').replace(
      /\/+$/,
      '',
    );
    const apiKey = this.resolveSecret(input.provider.secretRef);
    if (!apiKey) {
      throw new BadGatewayException('AI provider secret is not configured');
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: input.body.model ?? input.model.modelKey,
        messages: this.buildMessages(input.kind, input.body),
      }),
    });
    const payload = await response.json().catch(() => undefined);

    if (!response.ok) {
      const message = this.extractProviderError(payload) ?? response.statusText;
      throw new BadGatewayException(`AI provider request failed: ${message}`);
    }

    return {
      output:
        input.kind === 'chat'
          ? payload?.choices?.[0]?.message
          : { text: payload?.choices?.[0]?.message?.content ?? '' },
      requestTokens: payload?.usage?.prompt_tokens,
      responseTokens: payload?.usage?.completion_tokens,
      totalTokens: payload?.usage?.total_tokens,
      raw: payload,
    };
  }

  private resolveSecret(secretRef?: string | null) {
    if (!secretRef) return undefined;
    const key = secretRef.startsWith('env:') ? secretRef.slice(4) : secretRef;
    return this.config.get<string>(key) ?? process.env[key];
  }

  private buildMessages(kind: 'chat' | 'generate', body: OpenAiRequestDto) {
    if (body.messages?.length) return body.messages;
    const content = body.input ?? '';
    return [
      {
        role: 'user',
        content: kind === 'generate' ? content : content || 'Hello',
      },
    ];
  }

  private extractProviderError(payload: unknown) {
    if (!payload || typeof payload !== 'object') return undefined;
    const error = (payload as { error?: { message?: unknown } }).error;
    return typeof error?.message === 'string' ? error.message : undefined;
  }
}
