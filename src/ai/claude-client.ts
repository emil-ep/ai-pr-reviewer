import { AIClient, PRData, PRDescriptionResult, ReviewComment, ReviewResult } from './base-client.js';
import {
  sanitizeTitle,
  sanitizeDescription,
  sanitizeCommitMessage,
  sanitizeIssueBody,
  sanitizeThreadBody,
  sanitizeSummary,
  sanitizeIdentifier,
} from '../utils/prompt-sanitizer.js';
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

  async generatePRDescription(prData: PRData): Promise<PRDescriptionResult> {
    logger.info(`Generating PR description with Claude: ${prData.title}`);
    
    const prompt = this.buildDescriptionPrompt(prData);

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        temperature: 0.4,
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

      const generatedAt = new Date().toISOString();
      const description = this.formatDescription(content.text, 'Claude', generatedAt);

      logger.info('PR description generated successfully');

      return {
        description,
        metadata: {
          provider: 'Claude',
          generatedAt,
          confidence: {
            summary: 'high',
            changes: 'high',
            testing: 'medium',
          },
        },
      };
    } catch (error) {
      logger.error('Claude API error:', error);
      throw new Error(`Failed to generate PR description with Claude: ${error}`);
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
    const isFollowUp = prData.reviewRound > 1;
    let prompt = isFollowUp
      ? this.buildFollowUpPromptHeader(prData)
      : this.buildInitialPromptHeader(prData);

    prompt += `## Changed Files (${prData.files.length})\n\n`;
    for (const file of prData.files) {
      prompt += `### File: ${file.filename}`;
      if (file.status) prompt += ` (${file.status})`;
      prompt += '\n\n';
      if (file.patch) {
        prompt += `**Diff:**\n\`\`\`diff\n${file.patch}\n\`\`\`\n\n`;
      }
      if (file.content) {
        prompt += `**Full content:**\n\`\`\`\n${file.content.slice(0, 5000)}\n\`\`\`\n\n`;
      }
    }

    prompt += this.buildReviewInstructions(isFollowUp);
    return prompt;
  }

  private buildInitialPromptHeader(prData: PRData): string {
    const title  = sanitizeTitle(prData.title);
    const author = sanitizeIdentifier(prData.author);
    const head   = sanitizeIdentifier(prData.headBranch);
    const base   = sanitizeIdentifier(prData.baseBranch);
    const desc   = sanitizeDescription(prData.description || '_No description provided._');

    let h = `You are a senior software engineer performing a thorough, first-pass code review.
Your goal is to produce a definitive, comprehensive review — as if this is a high-stakes production PR.
Be direct, specific, and prioritise correctness, security, and maintainability above all.

# Pull Request: ${title}

## Metadata
- **Author:** ${author}
- **Branch:** \`${head}\` → \`${base}\`
- **Stats:** ${prData.stats?.totalFiles ?? 0} files, +${prData.stats?.totalAdditions ?? 0}/-${prData.stats?.totalDeletions ?? 0} lines

## PR Description
${desc}

`;

    if (prData.commits && prData.commits.length > 0) {
      h += `## Commit History (${prData.commits.length} commits)\n`;
      h += `These commits explain the intent — use them to judge whether the implementation matches the stated goal.\n\n`;
      for (const c of prData.commits.slice(0, 15)) {
        h += `- \`${c.sha.slice(0, 7)}\` **${sanitizeIdentifier(c.author)}**: ${sanitizeCommitMessage(c.message)}\n`;
      }
      h += '\n';
    }

    if (prData.linkedIssues && prData.linkedIssues.length > 0) {
      h += `## Linked Issues\n`;
      for (const issue of prData.linkedIssues) {
        h += `### #${issue.number} — ${sanitizeTitle(issue.title)} [${issue.state}]\n`;
        h += `Labels: ${issue.labels.join(', ') || 'none'}\n`;
        if (issue.body) {
          h += `${sanitizeIssueBody(issue.body)}\n`;
        }
        h += '\n';
      }
    }

    if (prData.affectedDependencies && prData.affectedDependencies.length > 0) {
      h += `## Affected Dependencies\n${prData.affectedDependencies.join(', ')}\n\n`;
    }

    if (prData.relatedFiles && prData.relatedFiles.length > 0) {
      h += `## Related Files (context — not changed)\n`;
      for (const rf of prData.relatedFiles) {
        h += `### ${rf.path}\n_Reason: ${rf.reason}_\n`;
        if (rf.content) {
          h += `\`\`\`\n${rf.content.slice(0, 2000)}\n\`\`\`\n`;
        }
        h += '\n';
      }
    }

    return h;
  }

  private buildFollowUpPromptHeader(prData: PRData): string {
    const title  = sanitizeTitle(prData.title);
    const author = sanitizeIdentifier(prData.author);
    const head   = sanitizeIdentifier(prData.headBranch);
    const base   = sanitizeIdentifier(prData.baseBranch);
    const desc   = sanitizeDescription(prData.description || '_No description provided._');

    let h = `You are a senior software engineer performing a **follow-up code review** (round ${prData.reviewRound}).
The developer has pushed new changes and may have addressed feedback from previous rounds.

IMPORTANT RULES FOR THIS FOLLOW-UP REVIEW:
1. Do NOT re-raise issues that are already in the "Resolved threads" list below.
2. Do NOT re-raise issues that are already in the "Still-open threads" list unless the new changes made them WORSE.
3. Only raise NEW issues introduced by the latest commits, or issues from open threads that remain unfixed.
4. If everything looks good after the developer's updates, say so clearly and set verdict to APPROVE.

# Pull Request: ${title}

## Metadata
- **Author:** ${author}
- **Branch:** \`${head}\` → \`${base}\`
- **Review Round:** ${prData.reviewRound}

## PR Description
${desc}

`;

    if (prData.previousReviews.length > 0) {
      h += `## Previous Review Rounds\n`;
      for (const prev of prData.previousReviews) {
        h += `### Round ${prev.round} — ${prev.verdict} (${prev.submittedAt.slice(0, 10)})\n`;
        h += `${sanitizeSummary(prev.summary)}\n\n`;
      }
    }

    if (prData.resolvedThreads.length > 0) {
      h += `## ✅ Resolved Threads (developer has addressed these — DO NOT re-raise)\n`;
      for (const t of prData.resolvedThreads) {
        const loc = t.line ? `${t.path}:${t.line}` : t.path;
        h += `- **${loc}**: ${sanitizeThreadBody(t.body)}\n`;
      }
      h += '\n';
    }

    if (prData.openThreads.length > 0) {
      h += `## ⚠️ Still-Open Threads (not yet resolved by developer)\n`;
      for (const t of prData.openThreads) {
        const loc = t.line ? `${t.path}:${t.line}` : t.path;
        h += `- **${loc}**: ${sanitizeThreadBody(t.body)}\n`;
      }
      h += '\n';
    }

    if (prData.commits && prData.commits.length > 0) {
      h += `## Latest Commits\n`;
      for (const c of prData.commits.slice(0, 10)) {
        h += `- \`${c.sha.slice(0, 7)}\` **${sanitizeIdentifier(c.author)}**: ${sanitizeCommitMessage(c.message)}\n`;
      }
      h += '\n';
    }

    return h;
  }

  private buildReviewInstructions(isFollowUp: boolean): string {
    const focusAreas = isFollowUp
      ? `Focus ONLY on:
1. NEW security vulnerabilities introduced since the last review
2. NEW logic errors or bugs not present in previous rounds
3. Open threads from prior rounds that remain unfixed or were made worse
4. Any regressions caused by the developer's fixes`
      : `Focus on:
1. Security vulnerabilities (SQL injection, XSS, auth issues, secrets in code)
2. Logic errors and bugs (edge cases, off-by-one, null dereferences)
3. Performance issues (N+1 queries, unnecessary allocations, blocking I/O)
4. Best practices violations (SOLID, DRY, error handling, naming)
5. Missing error handling and unhappy paths
6. Code maintainability and readability
7. Alignment with linked issues — does the implementation actually solve them?
8. Impact on related/test files — are tests missing or outdated?`;

    return `
## Review Instructions

${focusAreas}

Respond with ONLY a JSON object in exactly this format (no markdown wrapper):

{
  "summary": "Concise assessment. For follow-ups, note what was fixed and what still needs attention.",
  "verdict": "APPROVE | REQUEST_CHANGES | COMMENT",
  "comments": [
    {
      "path": "src/example.ts",
      "line": 42,
      "severity": "critical | warning | suggestion",
      "message": "<!-- bob-pr-review -->\\nClear explanation of the issue and a concrete fix suggestion."
    }
  ]
}

Rules:
- "verdict" must be "APPROVE" only if there are zero critical/warning issues.
- "verdict" must be "REQUEST_CHANGES" if there are any critical issues.
- "verdict" is "COMMENT" for suggestion-only reviews.
- Every comment "message" MUST start with the HTML comment marker \`<!-- bob-pr-review -->\` (used for deduplication).
- Be direct. No filler phrases. Each comment must name the exact problem and the exact fix.
- Line numbers must match the diff exactly.`;
  }

  private parseReviewResponse(content: string): ReviewResult {
    try {
      // Claude might wrap JSON in markdown code blocks
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) ||
        content.match(/```\n([\s\S]*?)\n```/) ||
        content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const parsed = JSON.parse(jsonStr);
        return {
          summary: parsed.summary || 'Review completed',
          verdict: parsed.verdict ?? 'COMMENT',
          comments: Array.isArray(parsed.comments) ? parsed.comments : [],
        };
      }

      logger.warn('Could not parse JSON from Claude response, using text as summary');
      return { summary: content.slice(0, 500), verdict: 'COMMENT', comments: [] };
    } catch (error) {
      logger.warn('Failed to parse Claude response:', error);
      return { summary: content.slice(0, 500), verdict: 'COMMENT', comments: [] };
    }
  }
}
