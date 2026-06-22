import { AIClient, PRData, ReviewComment, ReviewResult } from './base-client.js';

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';

export class ClaudeClient implements AIClient {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string = 'claude-3-5-sonnet-20241022') {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    logger.info(`Claude client initialized with model: ${this.model}`);
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Claude doesn't have a dedicated health check endpoint
      // We'll do a minimal API call to verify connectivity
      await this.client.messages.create({
        model: this.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'ping' }],
      });
      logger.info('Claude service is healthy');
      return true;
    } catch (error) {
      logger.error('Claude service health check failed:', error);
      return false;
    }
  }

  async reviewPR(prData: PRData): Promise<ReviewResult> {
    logger.info(`Reviewing PR with Claude: ${prData.title}`);

    const prompt = this.buildReviewPrompt(prData);

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        temperature: 0.3,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      const result = this.parseReviewResponse(content.text);
      logger.info(`Review complete: ${result.comments.length} comments generated`);

      return result;
    } catch (error) {
      logger.error('Claude API error:', error);
      throw new Error(`Failed to get review from Claude: ${error}`);
    }
  }

  private buildReviewPrompt(prData: PRData): string {
    let prompt = `You are an expert code reviewer. Please review this Pull Request and provide detailed feedback.

# Pull Request Review

## PR Title
${prData.title}

## PR Description
${prData.description || 'No description provided'}

## Changed Files

`;

    for (const file of prData.files) {
      prompt += `### File: ${file.filename}\n\n`;

      if (file.patch) {
        prompt += `**Changes (diff):**\n\`\`\`diff\n${file.patch}\n\`\`\`\n\n`;
      }

      if (file.content) {
        prompt += `**Full content:**\n\`\`\`\n${file.content.slice(0, 5000)}\n\`\`\`\n\n`;
      }
    }

    prompt += `
Please analyze these changes and provide your review in the following JSON format:

{
  "summary": "Brief overview of changes and overall assessment",
  "comments": [
    {
      "path": "file/path.ts",
      "line": 42,
      "severity": "critical",
      "message": "Detailed explanation of the issue and how to fix it"
    }
  ]
}

Focus on:
1. Security vulnerabilities (SQL injection, XSS, authentication issues)
2. Logic errors and bugs
3. Performance issues
4. Best practices violations
5. Missing error handling
6. Code maintainability

Provide specific, actionable feedback with file paths and line numbers. Return ONLY the JSON object, no additional text.`;

    return prompt;
  }

  private parseReviewResponse(content: string): ReviewResult {
    try {
      // Try to extract JSON from the response
      // Claude might wrap it in markdown code blocks
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) ||
        content.match(/```\n([\s\S]*?)\n```/) ||
        content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const parsed = JSON.parse(jsonStr);

        return {
          summary: parsed.summary || 'Review completed',
          comments: Array.isArray(parsed.comments) ? parsed.comments : [],
        };
      }

      // If no JSON found, create a simple review from the text
      logger.warn('Could not parse JSON from Claude response, using text as summary');
      return {
        summary: content.slice(0, 500),
        comments: [],
      };
    } catch (error) {
      logger.warn('Failed to parse Claude response:', error);

      // Fallback: create a simple review
      return {
        summary: content.slice(0, 500),
        comments: [],
      };
    }
  }
}
