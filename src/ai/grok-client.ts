import { AIClient, PRData, ReviewComment, ReviewResult } from './base-client.js';

import OpenAI from 'openai';
import { logger } from '../utils/logger.js';

export class GrokClient implements AIClient {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = 'grok-beta') {
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.x.ai/v1',
    });
    this.model = model;
    logger.info(`Grok client initialized with model: ${this.model}`);
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.models.list();
      logger.info('Grok service is healthy');
      return true;
    } catch (error) {
      logger.error('Grok service health check failed:', error);
      return false;
    }
  }

  async reviewPR(prData: PRData): Promise<ReviewResult> {
    logger.info(`Reviewing PR with Grok: ${prData.title}`);

    const prompt = this.buildReviewPrompt(prData);

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert code reviewer. Analyze code changes and provide detailed, actionable feedback in JSON format.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from Grok');
      }

      const result = this.parseReviewResponse(content);
      logger.info(`Review complete: ${result.comments.length} comments generated`);

      return result;
    } catch (error) {
      logger.error('Grok API error:', error);
      throw new Error(`Failed to get review from Grok: ${error}`);
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
      // Grok might wrap it in markdown code blocks
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
      logger.warn('Could not parse JSON from Grok response, using text as summary');
      return {
        summary: content.slice(0, 500),
        comments: [],
      };
    } catch (error) {
      logger.warn('Failed to parse Grok response:', error);

      // Fallback: create a simple review
      return {
        summary: content.slice(0, 500),
        comments: [],
      };
    }
  }
}

