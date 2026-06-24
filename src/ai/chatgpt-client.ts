import { AIClient, PRData, ReviewComment, ReviewResult } from './base-client.js';

import OpenAI from 'openai';
import { logger } from '../utils/logger.js';

export class ChatGPTClient implements AIClient {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-4-turbo-preview') {
    this.client = new OpenAI({ apiKey });
    this.model = model;
    logger.info(`ChatGPT client initialized with model: ${this.model}`);
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.models.retrieve(this.model);
      logger.info('ChatGPT service is healthy');
      return true;
    } catch (error) {
      logger.error('ChatGPT service health check failed:', error);
      return false;
    }
  }

  async reviewPR(prData: PRData): Promise<ReviewResult> {
    logger.info(`Reviewing PR with ChatGPT: ${prData.title}`);

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
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from ChatGPT');
      }

      const result = this.parseReviewResponse(content);
      logger.info(`Review complete: ${result.comments.length} comments generated`);

      return result;
    } catch (error) {
      logger.error('ChatGPT API error:', error);
      throw new Error(`Failed to get review from ChatGPT: ${error}`);
    }
  }

  private buildReviewPrompt(prData: PRData): string {
    let prompt = `You are an expert code reviewer. Please review this Pull Request with comprehensive context.

# Pull Request Review

## PR Metadata
- **Title:** ${prData.title}
- **Author:** ${prData.author}
- **Branch:** ${prData.headBranch} → ${prData.baseBranch}
- **Stats:** ${prData.stats?.totalFiles || 0} files, +${prData.stats?.totalAdditions || 0}/-${prData.stats?.totalDeletions || 0} lines

## PR Description
${prData.description || 'No description provided'}

`;

    // Add commit history context
    if (prData.commits && prData.commits.length > 0) {
      prompt += `## Commit History (${prData.commits.length} commits)\n`;
      prompt += 'Understanding the "what" and "why" behind changes:\n\n';
      for (const commit of prData.commits.slice(0, 10)) {
        prompt += `- **${commit.sha.slice(0, 7)}** by ${commit.author}: ${commit.message}\n`;
      }
      prompt += '\n';
    }

    // Add linked issues context
    if (prData.linkedIssues && prData.linkedIssues.length > 0) {
      prompt += `## Linked Issues (${prData.linkedIssues.length})\n`;
      prompt += 'Business context and requirements:\n\n';
      for (const issue of prData.linkedIssues) {
        prompt += `### Issue #${issue.number}: ${issue.title}\n`;
        prompt += `- **State:** ${issue.state}\n`;
        prompt += `- **Labels:** ${issue.labels.join(', ') || 'none'}\n`;
        prompt += `- **Description:** ${issue.body.slice(0, 300)}${issue.body.length > 300 ? '...' : ''}\n\n`;
      }
    }

    // Add affected dependencies
    if (prData.affectedDependencies && prData.affectedDependencies.length > 0) {
      prompt += `## Affected Dependencies\n`;
      prompt += `${prData.affectedDependencies.join(', ')}\n\n`;
    }

    // Add related files context
    if (prData.relatedFiles && prData.relatedFiles.length > 0) {
      prompt += `## Related Files (${prData.relatedFiles.length})\n`;
      prompt += 'Files that may be impacted by these changes:\n\n';
      for (const relatedFile of prData.relatedFiles) {
        prompt += `### ${relatedFile.path}\n`;
        prompt += `**Reason:** ${relatedFile.reason}\n`;
        if (relatedFile.content) {
          prompt += `**Content:**\n\`\`\`\n${relatedFile.content.slice(0, 2000)}\n\`\`\`\n\n`;
        }
      }
    }

    // Add changed files
    prompt += `## Changed Files (${prData.files.length})\n\n`;
    for (const file of prData.files) {
      prompt += `### File: ${file.filename}`;
      if (file.status) {
        prompt += ` (${file.status})`;
      }
      prompt += '\n\n';

      if (file.patch) {
        prompt += `**Changes (diff):**\n\`\`\`diff\n${file.patch}\n\`\`\`\n\n`;
      }

      if (file.content) {
        prompt += `**Full content:**\n\`\`\`\n${file.content.slice(0, 5000)}\n\`\`\`\n\n`;
      }
    }

    prompt += `
## Review Instructions

Please analyze these changes WITH THE FULL CONTEXT PROVIDED and provide your review in JSON format:

{
  "summary": "Brief overview considering the commits, linked issues, and business context",
  "comments": [
    {
      "path": "file/path.ts",
      "line": 42,
      "severity": "critical",
      "message": "Detailed explanation referencing the context (commits, issues, related files)"
    }
  ]
}

Focus on:
1. **Alignment with linked issues** - Do changes address the stated requirements?
2. **Commit message quality** - Are commits well-structured and meaningful?
3. **Impact on related files** - Will changes break existing functionality?
4. **Dependency changes** - Are new dependencies necessary and secure?
5. **Security vulnerabilities** - SQL injection, XSS, authentication issues
6. **Logic errors and bugs** - Considering the broader context
7. **Performance issues** - Especially with dependency changes
8. **Best practices violations**
9. **Missing error handling**
10. **Code maintainability**

Provide specific, actionable feedback that references the context (e.g., "This change addresses issue #123 but...").`;

    return prompt;
  }

  private parseReviewResponse(content: string): ReviewResult {
    try {
      const parsed = JSON.parse(content);

      return {
        summary: parsed.summary || 'Review completed',
        comments: Array.isArray(parsed.comments) ? parsed.comments : [],
      };
    } catch (error) {
      logger.warn('Failed to parse ChatGPT response:', error);

      // Fallback: create a simple review
      return {
        summary: content.slice(0, 500),
        comments: [],
      };
    }
  }
}
