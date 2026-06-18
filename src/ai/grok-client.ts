import OpenAI from 'openai';
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

export class GrokClient {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://api.x.ai/v1',
    });
    logger.info('Grok AI client initialized');
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

    const prompt = this.buildReviewPrompt(prData);

    try {
      const response = await this.client.chat.completions.create({
        model: 'grok-2-latest',
        messages: [
          {
            role: 'system',
            content: `You are an expert code reviewer. Analyze the code changes and provide:
1. A brief summary of the changes
2. Specific issues found with file path, line number, severity (critical/warning/suggestion), and detailed message
3. Focus on: security vulnerabilities, logic errors, performance issues, and best practices

Format your response as JSON:
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
}`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from Grok');
      }

      // Parse JSON response
      const result = this.parseReviewResponse(content);
      logger.info(`Review complete: ${result.comments.length} comments generated`);
      
      return result;
    } catch (error) {
      logger.error('Grok API error:', error);
      throw new Error(`Failed to get review from Grok: ${error}`);
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
    let prompt = `# Pull Request Review

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

    prompt += `\nPlease review these changes and provide your analysis in JSON format.`;

    return prompt;
  }

  private parseReviewResponse(content: string): ReviewResult {
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || 
                       content.match(/```\n([\s\S]*?)\n```/);
      
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      const parsed = JSON.parse(jsonStr);

      return {
        summary: parsed.summary || 'Review completed',
        comments: Array.isArray(parsed.comments) ? parsed.comments : [],
      };
    } catch (error) {
      logger.warn('Failed to parse JSON response, using fallback');
      
      // Fallback: create a simple review from the text
      return {
        summary: content.slice(0, 500),
        comments: [],
      };
    }
  }
}

// Made with Bob
