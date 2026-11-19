import {
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { type AiConfig, loadAiConfig } from './ai-config.utils.js';
import type { AiProvider, AiProviderStatus } from './ai-provider.interface.js';
import { AnthropicProvider } from './anthropic.provider.js';
import { GeminiProvider } from './gemini.provider.js';
import { OpenAiCompatibleProvider } from './openai-compatible.provider.js';

export const AI_PROVIDER_ENV = Symbol('AI_PROVIDER_ENV');

/**
 * Resolves and exposes the configured AI provider while keeping configuration fail-closed.
 */
@Injectable()
export class AiProviderRegistry {
  private readonly config: AiConfig;
  private readonly providers = new Map<string, AiProvider>();

  constructor(
    @Optional()
    @Inject(AI_PROVIDER_ENV)
    env: NodeJS.ProcessEnv = process.env,
  ) {
    this.config = loadAiConfig(env);

    if (this.config.configured) {
      if (this.config.provider === 'openai-compatible') {
        this.providers.set(
          'openai-compatible',
          new OpenAiCompatibleProvider(this.config),
        );
      } else if (this.config.provider === 'anthropic') {
        this.providers.set('anthropic', new AnthropicProvider(this.config));
      } else if (this.config.provider === 'gemini') {
        this.providers.set('gemini', new GeminiProvider(this.config));
      }
    }
  }

  isConfigured(): boolean {
    return this.config.configured && this.providers.has(this.config.provider);
  }

  getStatus(): AiProviderStatus {
    const configured = this.isConfigured();
    return {
      configured,
      provider: this.config.provider,
      model: configured ? this.config.model : null,
    };
  }

  getProvider(): AiProvider {
    if (!this.config.configured) {
      throw new ServiceUnavailableException('AI assistant is not configured');
    }

    const provider = this.providers.get(this.config.provider);
    if (!provider) {
      throw new ServiceUnavailableException(
        'Configured AI provider is not supported',
      );
    }

    return provider;
  }
}
