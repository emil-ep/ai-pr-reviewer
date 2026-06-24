import { AIClient, PRData, PRDescriptionResult, ReviewComment, ReviewResult } from './base-client.js';

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

  async generatePRDescription(prData: PRData): Promise<PRDescriptionResult> {
    logger.info(`Generating PR description with ChatGPT: ${prData.title}`);

    const prompt = this.buildDescriptionPrompt(prData);

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert at writing clear, comprehensive Pull Request descriptions following industry standards (Conventional Commits, GitHub templates). Generate well-structured PR descriptions in markdown format.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.4,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from ChatGPT');
      }

      const generatedAt = new Date().toISOString();
      const description = this.formatDescription(content, 'ChatGPT', generatedAt);

      logger.info('PR description generated successfully');

      return {
        description,
        metadata: {
          provider: 'ChatGPT',
          generatedAt,
          confidence: {
            summary: 'high',
            changes: 'high',
            testing: 'medium',
          },
        },
      };
    } catch (error) {
      logger.error('ChatGPT API error:', error);
      throw new Error(`Failed to generate PR description with ChatGPT: ${error}`);
    }
  }

  private buildDescriptionPrompt(prData: PRData): string {
    let prompt = `Generate a comprehensive Pull Request description following industry standards (Conventional Commits + GitHub template).

# PR Context

## Basic Info
- **Title:** ${prData.title}
- **Author:** ${prData.author}
- **Branch:** ${prData.headBranch} → ${prData.baseBranch}
- **Stats:** ${prData.stats?.totalFiles || 0} files, +${prData.stats?.totalAdditions || 0}/-${prData.stats?.totalDeletions || 0} lines

`;

    // Add existing description if any
    if (prData.description && prData.description.trim()) {
      prompt += `## Existing Description
${prData.description}

`;
    }

    // Add commit history
    if (prData.commits && prData.commits.length > 0) {
      prompt += `## Commit History (${prData.commits.length} commits)\n`;
      for (const commit of prData.commits.slice(0, 10)) {
        prompt += `- \`${commit.sha.slice(0, 7)}\` by ${commit.author}: ${commit.message}\n`;
      }
      prompt += '\n';
    }

    // Add linked issues
    if (prData.linkedIssues && prData.linkedIssues.length > 0) {
      prompt += `## Linked Issues\n`;
      for (const issue of prData.linkedIssues) {
        prompt += `### Issue #${issue.number}: ${issue.title}\n`;
        prompt += `- State: ${issue.state}\n`;
        prompt += `- Labels: ${issue.labels.join(', ') || 'none'}\n`;
        if (issue.body) {
          prompt += `- Description: ${issue.body.slice(0, 200)}${issue.body.length > 200 ? '...' : ''}\n`;
        }
        prompt += '\n';
      }
    }

    // Add affected dependencies
    if (prData.affectedDependencies && prData.affectedDependencies.length > 0) {
      prompt += `## Affected Dependencies\n`;
      prompt += `${prData.affectedDependencies.join(', ')}\n\n`;
    }

    // Add changed files summary
    prompt += `## Changed Files (${prData.files.length})\n`;
    for (const file of prData.files.slice(0, 15)) {
      prompt += `- \`${file.filename}\` (${file.status || 'modified'})\n`;
    }
    prompt += '\n';

    prompt += `
# Instructions

Generate a PR description in markdown format with these sections:

1. **Summary** (1-2 sentences)
2. **Type of Change** (checkboxes: Feature, Bug Fix, Refactor, Documentation, etc.)
3. **Motivation** (Why this change is needed - reference linked issues)
4. **Changes Made** (Organized list of key changes)
5. **Related Issues** (Use "Closes #X" or "Relates to #X")
6. **Files Changed** (Key files with brief descriptions)
7. **Dependencies** (Added/Updated/Removed if applicable)
8. **Testing** (Checkboxes for test types)
9. **Breaking Changes** (None or list)
10. **Additional Notes** (Any special considerations)

Requirements:
- Use Conventional Commits style for summary (feat:, fix:, refactor:, etc.)
- Reference issue numbers where applicable
- Be specific and actionable
- Use checkboxes [x] for completed items, [ ] for pending
- Keep it concise but comprehensive
- Focus on the "what" and "why", not just the "how"

Return ONLY the markdown description, no additional commentary.`;

    return prompt;
  }

  private formatDescription(content: string, provider: string, timestamp: string): string {
    // Add AI-generated header
    const header = `<!-- 🤖 AI-Generated PR Description -->
<!-- Provider: ${provider} | Generated: ${timestamp} -->

`;

    // Add footer
    const footer = `

---
*🤖 This description was automatically generated by ${provider}. Please review and update as needed.*
*Generated at: ${timestamp}*`;

    return header + content.trim() + footer;
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
