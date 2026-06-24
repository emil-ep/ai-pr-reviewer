import { AIClient, CommitMessageResult, GitDiffSummary, PRData, PRDescriptionResult, ReviewComment, ReviewResult } from './base-client.js';

import { logger } from '../utils/logger.js';

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

export class BobClient implements AIClient {
  private apiEndpoint: string;

  constructor(apiEndpoint: string) {
    this.apiEndpoint = apiEndpoint.replace(/\/$/, ''); // Remove trailing slash
    // logger.info(`Bob client initialized with endpoint: ${this.apiEndpoint}`);
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

  async reviewPR(prData: PRData): Promise<ReviewResult> {
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

  async generatePRDescription(prData: PRData): Promise<PRDescriptionResult> {
    logger.info(`Generating PR description with Bob: ${prData.title}`);
    
    const isHealthy = await this.healthCheck();
    if (!isHealthy) {
      throw new Error('Bob service is not healthy');
    }

    const prompt = this.buildDescriptionPrompt(prData);

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

      const content = data.clean_output || data.output;
      const generatedAt = new Date().toISOString();
      const description = this.formatDescription(content, 'Bob', generatedAt);

      logger.info('PR description generated successfully');

      return {
        description,
        metadata: {
          provider: 'Bob',
          generatedAt,
          confidence: {
            summary: 'high',
            changes: 'high',
            testing: 'medium',
          },
        },
      };
    } catch (error) {
      logger.error('Bob API error:', error);
      throw new Error(`Failed to generate PR description with Bob: ${error}`);
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

    if (prData.description && prData.description.trim()) {
      prompt += `## Existing Description\n${prData.description}\n\n`;
    }

    if (prData.commits && prData.commits.length > 0) {
      prompt += `## Commit History (${prData.commits.length} commits)\n`;
      for (const commit of prData.commits.slice(0, 10)) {
        prompt += `- \`${commit.sha.slice(0, 7)}\` by ${commit.author}: ${commit.message}\n`;
      }
      prompt += '\n';
    }

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

    if (prData.affectedDependencies && prData.affectedDependencies.length > 0) {
      prompt += `## Affected Dependencies\n${prData.affectedDependencies.join(', ')}\n\n`;
    }

    prompt += `## Changed Files (${prData.files.length})\n`;
    for (const file of prData.files.slice(0, 15)) {
      prompt += `- \`${file.filename}\` (${file.status || 'modified'})\n`;
    }
    prompt += '\n';

    prompt += `
# Instructions

Generate a PR description in markdown format with these sections:
1. Summary (1-2 sentences)
2. Type of Change (checkboxes)
3. Motivation (reference linked issues)
4. Changes Made (organized list)
5. Related Issues (Closes #X format)
6. Files Changed (key files with descriptions)
7. Dependencies (if applicable)
8. Testing (checkboxes)
9. Breaking Changes (None or list)
10. Additional Notes

Use Conventional Commits style, reference issues, be specific and actionable.
Return ONLY the markdown description.`;

    return prompt;
  }

  private formatDescription(content: string, provider: string, timestamp: string): string {
    const header = `<!-- 🤖 AI-Generated PR Description -->
<!-- Provider: ${provider} | Generated: ${timestamp} -->

`;
    const footer = `

---
*🤖 This description was automatically generated by ${provider}. Please review and update as needed.*
*Generated at: ${timestamp}*`;

    return header + content.trim() + footer;
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

  async generateCommitMessage(diffSummary: GitDiffSummary): Promise<CommitMessageResult> {
    logger.info('Generating commit message with Bob');
    
    const isHealthy = await this.healthCheck();
    if (!isHealthy) {
      throw new Error('Bob service is not healthy');
    }

    const prompt = this.buildCommitMessagePrompt(diffSummary);

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

      const content = data.clean_output || data.output;
      const result = this.parseCommitMessageResponse(content);

      logger.info(`Generated ${result.suggestions.length} commit message suggestions`);

      return result;
    } catch (error) {
      logger.error('Bob API error:', error);
      throw new Error(`Failed to generate commit message with Bob: ${error}`);
    }
  }

  private buildCommitMessagePrompt(diffSummary: GitDiffSummary): string {
    let prompt = `Generate 3 commit message suggestions following Conventional Commits specification.

# Git Diff Summary

## Statistics
- Files changed: ${diffSummary.totalFiles}
- Lines added: ${diffSummary.totalAdditions}
- Lines deleted: ${diffSummary.totalDeletions}

## Modified Files
`;

    for (const file of diffSummary.files.slice(0, 10)) {
      prompt += `- ${file.path} (${file.status}): +${file.additions}/-${file.deletions}\n`;
    }

    if (diffSummary.modifiedFunctions && diffSummary.modifiedFunctions.length > 0) {
      prompt += `\n## Modified Functions/Classes\n`;
      for (const func of diffSummary.modifiedFunctions.slice(0, 10)) {
        prompt += `- ${func.type} ${func.name} in ${func.file}\n`;
      }
    }

    if (diffSummary.criticalChanges && diffSummary.criticalChanges.length > 0) {
      prompt += `\n## Key Changes (first 50 lines)\n\`\`\`diff\n`;
      prompt += diffSummary.criticalChanges.slice(0, 50).join('\n');
      prompt += `\n\`\`\`\n`;
    }

    prompt += `

# Instructions

Generate 3 commit message suggestions in JSON format:

{
  "suggestions": [
    {
      "type": "feat|fix|docs|style|refactor|perf|test|chore",
      "scope": "optional scope",
      "subject": "concise description",
      "body": "optional detailed explanation",
      "breaking": false,
      "confidence": "high|medium|low"
    }
  ]
}

Requirements:
1. Follow Conventional Commits: type(scope): subject
2. Subject: imperative mood, lowercase, no period, max 50 chars
3. Body: explain what and why (optional)
4. Confidence: based on clarity of changes
5. Order by confidence (best first)

Return ONLY the JSON, no markdown formatting.`;

    return prompt;
  }

  private parseCommitMessageResponse(content: string): CommitMessageResult {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) ||
        content.match(/```\n([\s\S]*?)\n```/) ||
        content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const parsed = JSON.parse(jsonStr);

        if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
          return {
            suggestions: parsed.suggestions,
            metadata: {
              provider: 'Bob',
              generatedAt: new Date().toISOString(),
              tokensUsed: 0, // Bob doesn't provide token count
            },
          };
        }
      }

      // Fallback: create suggestions from text
      logger.warn('Could not parse JSON from Bob response, creating fallback suggestions');
      return {
        suggestions: [
          {
            type: 'chore',
            subject: 'update code',
            confidence: 'low',
          },
        ],
        metadata: {
          provider: 'Bob',
          generatedAt: new Date().toISOString(),
          tokensUsed: 0,
        },
      };
    } catch (error) {
      logger.error('Failed to parse Bob commit message response:', error);
      throw new Error('Failed to parse commit message suggestions from Bob');
    }
  }
}
