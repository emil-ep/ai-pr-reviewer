import { AIClient, CommitMessageResult, GitDiffSummary, PRData, PRDescriptionResult, ReviewComment, ReviewResult, inferVerdict } from './base-client.js';
import {
  sanitizeTitle,
  sanitizeDescription,
  sanitizeCommitMessage,
  sanitizeThreadBody,
  sanitizeSummary,
  sanitizeIdentifier,
} from '../utils/prompt-sanitizer.js';
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

  async generateCommitMessage(diffSummary: GitDiffSummary): Promise<CommitMessageResult> {
    logger.info('Generating commit message suggestions with ChatGPT');

    const prompt = this.buildCommitMessagePrompt(diffSummary);

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert at writing clear, concise commit messages following Conventional Commits specification. Generate multiple commit message options in JSON format.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.4,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from ChatGPT');
      }

      const result = this.parseCommitMessageResponse(content);
      logger.info(`Generated ${result.suggestions.length} commit message suggestions`);

      return {
        suggestions: result.suggestions,
        metadata: {
          provider: 'ChatGPT',
          generatedAt: new Date().toISOString(),
          tokensUsed: response.usage?.total_tokens,
        },
      };
    } catch (error) {
      logger.error('ChatGPT API error:', error);
      throw new Error(`Failed to generate commit message with ChatGPT: ${error}`);
    }
  }

  private buildCommitMessagePrompt(diffSummary: GitDiffSummary): string {
    let prompt = `Generate 3 commit message suggestions following Conventional Commits specification.

# Change Summary

## Statistics
- **Files Changed:** ${diffSummary.totalFiles}
- **Additions:** +${diffSummary.totalAdditions}
- **Deletions:** -${diffSummary.totalDeletions}

## Modified Files
`;

    for (const file of diffSummary.files.slice(0, 15)) {
      const statusEmoji = {
        added: '✨',
        modified: '📝',
        deleted: '🗑️',
        renamed: '📋',
      }[file.status];
      prompt += `${statusEmoji} \`${file.path}\` (+${file.additions} -${file.deletions})\n`;
    }

    if (diffSummary.files.length > 15) {
      prompt += `... and ${diffSummary.files.length - 15} more files\n`;
    }

    if (diffSummary.modifiedFunctions && diffSummary.modifiedFunctions.length > 0) {
      prompt += `\n## Modified Functions/Classes\n`;
      for (const func of diffSummary.modifiedFunctions.slice(0, 10)) {
        const typeEmoji = {
          function: '⚡',
          class: '🏛️',
          method: '🔨',
          interface: '📐',
        }[func.type];
        prompt += `${typeEmoji} \`${func.name}\` in ${func.file}\n`;
      }
    }

    if (diffSummary.criticalChanges && diffSummary.criticalChanges.length > 0) {
      prompt += `\n## Key Code Changes (Sample)\n\`\`\`diff\n`;
      prompt += diffSummary.criticalChanges.slice(0, 30).join('\n');
      prompt += `\n\`\`\`\n`;
    }

    prompt += `
# Instructions

Generate 3 commit message suggestions in JSON format following Conventional Commits:

Format: \`<type>(<scope>): <subject>\`

**Types:**
- \`feat\`: New feature
- \`fix\`: Bug fix
- \`docs\`: Documentation only
- \`style\`: Code style (formatting, semicolons, etc.)
- \`refactor\`: Code refactoring
- \`perf\`: Performance improvement
- \`test\`: Adding/updating tests
- \`build\`: Build system or dependencies
- \`ci\`: CI configuration
- \`chore\`: Other changes (maintenance)
- \`revert\`: Revert previous commit

**Requirements:**
1. Subject line: 50 chars max, imperative mood, no period
2. Body (optional): Explain what and why, not how
3. Breaking changes: Add "BREAKING CHANGE:" in body if applicable
4. Provide 3 suggestions: one concise, one detailed, one alternative perspective
5. Assign confidence: high (obvious), medium (likely), low (uncertain)

Return JSON:
{
  "suggestions": [
    {
      "type": "feat",
      "scope": "auth",
      "subject": "add OAuth 2.0 authentication",
      "body": "Implement OAuth 2.0 flow with Google provider\\n\\nAdds token refresh mechanism and secure session handling",
      "breaking": false,
      "confidence": "high"
    }
  ]
}`;

    return prompt;
  }

  private parseCommitMessageResponse(content: string): { suggestions: CommitMessageResult['suggestions'] } {
    try {
      const parsed = JSON.parse(content);
      
      if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) {
        throw new Error('Invalid response format');
      }

      return {
        suggestions: parsed.suggestions.map((s: any) => ({
          type: s.type || 'chore',
          scope: s.scope,
          subject: s.subject || 'update code',
          body: s.body,
          breaking: s.breaking || false,
          confidence: s.confidence || 'medium',
        })),
      };
    } catch (error) {
      logger.warn('Failed to parse commit message response:', error);
      
      // Fallback: generate a basic suggestion
      return {
        suggestions: [
          {
            type: 'chore',
            subject: 'update code',
            confidence: 'low',
            breaking: false,
          },
        ],
      };
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
      // ChatGPT returns clean JSON but may sometimes wrap in code blocks
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) ||
        content.match(/```\n([\s\S]*?)\n```/) ||
        [null, content];

      const jsonStr = jsonMatch[1] || content;
      const parsed = JSON.parse(jsonStr);
      const comments = Array.isArray(parsed.comments) ? parsed.comments : [];
      return {
        summary: parsed.summary || 'Review completed',
        verdict: inferVerdict(parsed.verdict, comments),
        comments,
      };
    } catch (error) {
      logger.warn('Failed to parse ChatGPT response:', error);
      return { summary: content.slice(0, 500), verdict: inferVerdict(undefined, []), comments: [] };
    }
  }
}
