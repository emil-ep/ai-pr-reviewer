import { logger } from '../utils/logger.js';

export interface ReviewComment {
  path: string;
  line: number;
  severity: 'critical' | 'warning' | 'suggestion';
  message: string;
}

export interface ReviewResult {
  summary: string;
  comments: ReviewComment[];
}

interface BobHealthResponse {
  status: string;
  timestamp: string;
  service: string;
}

interface BobExecuteResponse {
  success: boolean;
  output: string;
  clean_output: string;
  error: string;
  return_code: number;
  has_internal_warnings: boolean;
  timestamp: string;
}

export class BobClient {
  private apiEndpoint: string;

  constructor(apiEndpoint: string) {
    this.apiEndpoint = apiEndpoint.replace(/\/$/, ''); // Remove trailing slash
    logger.info(`Bob client initialized with endpoint: ${this.apiEndpoint}`);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiEndpoint}/health`);
      const data = await response.json() as BobHealthResponse;
      logger.info(`Bob service health: ${data.status}`);
      return data.status === 'healthy';
    } catch (error) {
      logger.error('Bob service health check failed:', error);
      return false;
    }
  }

  async reviewPR(prData: {
    title: string;
    description: string;
    files: Array<{
      filename: string;
      patch?: string;
      content?: string;
    }>;
  }): Promise<ReviewResult> {
    logger.info(`Reviewing PR: ${prData.title}`);

    // Check if service is healthy
    const isHealthy = await this.healthCheck();
    if (!isHealthy) {
      throw new Error('Bob service is not healthy');
    }

    const prompt = this.buildReviewPrompt(prData);

    try {
      const response = await fetch(`${this.apiEndpoint}/api/v1/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt,
          accept_license: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Bob API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as BobExecuteResponse;

      if (!data.success) {
        throw new Error(`Bob execution failed: ${data.error}`);
      }

      // Use clean_output for user-friendly response
      const result = this.parseReviewResponse(data.clean_output || data.output);
      logger.info(`Review complete: ${result.comments.length} comments generated`);

      return result;
    } catch (error) {
      logger.error('Bob API error:', error);
      throw new Error(`Failed to get review from Bob: ${error}`);
    }
  }

  private buildReviewPrompt(prData: {
    title: string;
    description: string;
    files: Array<{
      filename: string;
      patch?: string;
      content?: string;
    }>;
  }): string {
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

Provide specific, actionable feedback with file paths and line numbers.`;

    return prompt;
  }

  private parseReviewResponse(content: string): ReviewResult {
    try {
      // Try to extract JSON from the response
      // Bob might wrap it in markdown code blocks
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
      logger.warn('Could not parse JSON from Bob response, using text as summary');
      return {
        summary: content.slice(0, 500),
        comments: [],
      };
    } catch (error) {
      logger.warn('Failed to parse Bob response:', error);

      // Fallback: create a simple review
      return {
        summary: content.slice(0, 500),
        comments: [],
      };
    }
  }
}

// Made with Bob
