import { AIClient } from './base-client.js';
import { BobClient } from './bob-client.js';
import { ChatGPTClient } from './chatgpt-client.js';
import { ClaudeClient } from './claude-client.js';
import { GrokClient } from './grok-client.js';
import { logger } from '../utils/logger.js';

export type AIProvider = 'bob' | 'chatgpt' | 'claude' | 'grok';

export interface AIClientConfig {
  provider: AIProvider;
  apiKey?: string;
  apiEndpoint?: string;
  model?: string;
}

export class AIClientFactory {
  static createClient(config: AIClientConfig): AIClient {
    logger.info(`Creating AI client for provider: ${config.provider}`);

    switch (config.provider) {
      case 'bob':
        if (!config.apiEndpoint) {
          throw new Error('BOB_API_ENDPOINT is required for Bob provider');
        }
        return new BobClient(config.apiEndpoint);

      case 'chatgpt':
        if (!config.apiKey) {
          throw new Error('OPENAI_API_KEY is required for ChatGPT provider');
        }
        return new ChatGPTClient(config.apiKey, config.model);

      case 'claude':
        if (!config.apiKey) {
          throw new Error('ANTHROPIC_API_KEY is required for Claude provider');
        }
        return new ClaudeClient(config.apiKey, config.model);

      case 'grok':
        if (!config.apiKey) {
          throw new Error('GROK_API_KEY is required for Grok provider');
        }
        return new GrokClient(config.apiKey, config.model);

      default:
        throw new Error(`Unknown AI provider: ${config.provider}`);
    }
  }

  static getProviderFromEnv(): AIProvider {
    const provider = process.env.AI_PROVIDER?.toLowerCase() as AIProvider;
    
    if (!provider) {
      logger.warn('AI_PROVIDER not set, defaulting to "bob"');
      return 'bob';
    }

    const validProviders: AIProvider[] = ['bob', 'chatgpt', 'claude', 'grok'];
    if (!validProviders.includes(provider)) {
      throw new Error(
        `Invalid AI_PROVIDER: ${provider}. Must be one of: ${validProviders.join(', ')}`
      );
    }

    return provider;
  }

  static getConfigFromEnv(): AIClientConfig {
    const provider = this.getProviderFromEnv();

    const config: AIClientConfig = {
      provider,
    };

    switch (provider) {
      case 'bob':
        config.apiEndpoint = process.env.BOB_API_ENDPOINT;
        break;

      case 'chatgpt':
        config.apiKey = process.env.OPENAI_API_KEY;
        config.model = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
        break;

      case 'claude':
        config.apiKey = process.env.ANTHROPIC_API_KEY;
        config.model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
        break;

      case 'grok':
        config.apiKey = process.env.GROK_API_KEY;
        config.model = process.env.GROK_MODEL || 'grok-beta';
        break;
    }

    return config;
  }
}
