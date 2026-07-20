import { AIClient, PRData, PRDescriptionResult, ReviewComment, ReviewResult, inferVerdict } from './base-client.js';

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
      result.verdict = inferVerdict(result.verdict, result.comments);
      logger.info(`Review complete: ${result.comments.length} comments, verdict=${result.verdict}`);

      return result;
    } catch (error) {
      logger.error('Grok API error:', error);
      throw new Error(`Failed to get review from Grok: ${error}`);
    }
  }

  async generatePRDescription(prData: PRData): Promise<PRDescriptionResult> {
    logger.info(`Generating PR description with Grok: ${prData.title}`);
    
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
        throw new Error('No response from Grok');
      }

      const generatedAt = new Date().toISOString();
      const description = this.formatDescription(content, 'Grok', generatedAt);

      logger.info('PR description generated successfully');

      return {
        description,
        metadata: {
          provider: 'Grok',
          generatedAt,
          confidence: {
            summary: 'high',
            changes: 'high',
            testing: 'medium',
          },
        },
      };
    } catch (error) {
      logger.error('Grok API error:', error);
      throw new Error(`Failed to generate PR description with Grok: ${error}`);
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
    const isFollowUp = prData.reviewRound > 1;

    let prompt = `You are an expert code reviewer. Review this Pull Request and provide detailed, consistent feedback.

# Pull Request Review — Round ${prData.reviewRound}

## PR Info
- **Title:** ${prData.title}
- **Author:** ${prData.author}
- **Branch:** ${prData.headBranch} → ${prData.baseBranch}
- **Review round:** ${prData.reviewRound} (${isFollowUp ? 'follow-up review' : 'initial review'})

## PR Description
${prData.description || 'No description provided'}

`;

    // ── Review history (critical for consistency on re-reviews) ──────────────
    if (prData.previousReviews.length > 0) {
      prompt += `## Previous Review Rounds\n`;
      for (const prev of prData.previousReviews) {
        prompt += `### Round ${prev.round} (${prev.submittedAt}, verdict: ${prev.verdict})\n`;
        prompt += `${prev.summary}\n\n`;
      }
    }

    if (prData.openThreads.length > 0) {
      prompt += `## Still-Open Issues From Previous Reviews\n`;
      prompt += `These issues were raised in earlier reviews and have NOT been resolved by the developer.\n`;
      prompt += `You MUST flag these again with the same severity.\n\n`;
      for (const t of prData.openThreads) {
        prompt += `- **${t.path}${t.line ? `:${t.line}` : ''}**: ${t.body.replace(/<!--[\s\S]*?-->/g, '').trim().slice(0, 200)}\n`;
      }
      prompt += '\n';
    }

    if (prData.resolvedThreads.length > 0) {
      prompt += `## Issues Already Resolved by Developer\n`;
      prompt += `Do NOT re-raise these — they have been addressed.\n\n`;
      for (const t of prData.resolvedThreads) {
        prompt += `- **${t.path}${t.line ? `:${t.line}` : ''}**: ${t.body.replace(/<!--[\s\S]*?-->/g, '').trim().slice(0, 200)}\n`;
      }
      prompt += '\n';
    }

    // ── Changed files ─────────────────────────────────────────────────────────
    prompt += `## Changed Files\n\n`;
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
## Instructions

Respond ONLY with a JSON object matching this schema exactly:

{
  "summary": "Brief overview of changes and overall assessment",
  "verdict": "APPROVE | REQUEST_CHANGES | COMMENT",
  "comments": [
    {
      "path": "file/path.ts",
      "line": 42,
      "severity": "critical | warning | suggestion",
      "message": "Detailed explanation of the issue and how to fix it"
    }
  ]
}

Verdict rules (follow them strictly — do not downgrade on re-reviews unless the code changed):
- REQUEST_CHANGES — one or more critical issues exist
- COMMENT        — warnings but no critical issues
- APPROVE        — only suggestions or no issues

Severity rules (apply consistently across review rounds):
- critical   — security vulnerability, data loss risk, broken logic, crash risk
- warning    — non-ideal pattern, missing error handling, performance concern
- suggestion — style, naming, minor readability

${isFollowUp ? `IMPORTANT: This is round ${prData.reviewRound}. Re-raise ALL open issues listed above with the same severity. Only omit an issue if its code has been changed/removed in the diff.` : ''}

Focus on:
1. Security vulnerabilities (SQL injection, XSS, authentication issues)
2. Logic errors and bugs
3. Performance issues
4. Best practices violations
5. Missing error handling
6. Code maintainability

Return ONLY the JSON object, no additional text.`;

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

