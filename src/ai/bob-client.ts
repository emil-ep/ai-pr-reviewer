import { AIClient, CommitMessageResult, GitDiffSummary, PRData, PRDescriptionResult, ReviewComment, ReviewResult, inferVerdict } from './base-client.js';
import {
  sanitizeTitle,
  sanitizeDescription,
  sanitizeCommitMessage,
  sanitizeThreadBody,
  sanitizeSummary,
  sanitizeIdentifier,
} from '../utils/prompt-sanitizer.js';
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
    logger.info(`Prompt size: ${Buffer.byteLength(prompt)} bytes`);

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
        // Capture the response body to surface the real error from the Bob server
        // (e.g. "Argument list too long") rather than just the HTTP status code.
        const errorBody = await response.text().catch(() => '');
        throw new Error(
          `Bob API error: ${response.status} ${response.statusText}` +
          (errorBody ? ` — ${errorBody.slice(0, 300)}` : '')
        );
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

  /**
   * Hard ceiling on the total prompt size sent to Bob.
   *
   * Bob's backend spawns `bob --accept-license -p <prompt>` as a subprocess.
   * The prompt is passed as a single CLI argument, so it counts against the
   * kernel's ARG_MAX budget.  On a GitHub Actions runner, heavy environment
   * variables consume ~100–150 KB of that budget, leaving as little as
   * ~30–50 KB for the prompt argument itself.  We use 28 KB to stay safe
   * even on runners with unusually large environments.
   */
  private static readonly MAX_PROMPT_BYTES = 28_000;

  private buildReviewPrompt(prData: PRData): string {
    const isFollowUp = prData.reviewRound > 1;

    let prompt = isFollowUp
      ? this.buildFollowUpPromptHeader(prData)
      : this.buildInitialPromptHeader(prData);

    const instructions = this.buildReviewInstructions(isFollowUp);

    // Reserve space for the instructions section so we never cut it.
    const budget = BobClient.MAX_PROMPT_BYTES - Buffer.byteLength(prompt) - Buffer.byteLength(instructions);

    // ── Changed files (budget-aware) ───────────────────────────────────────
    let filesSection = `## Changed Files (${prData.files.length})\n\n`;
    let remaining = budget - Buffer.byteLength(filesSection);

    for (const file of prData.files) {
      if (remaining <= 0) {
        filesSection += `_[${prData.files.length} files total — remaining files omitted to stay within size limit]_\n`;
        break;
      }

      let block = `### File: ${file.filename}`;
      if (file.status) block += ` (${file.status})`;
      block += '\n\n';

      if (file.patch) {
        // Per-patch cap: at most 40 KB, but also bounded by remaining budget.
        const patchCap = Math.min(40_000, remaining - 100);
        const patch = patchCap > 0 ? file.patch.slice(0, patchCap) : '';
        const truncated = patch.length < file.patch.length;
        block += `**Diff:**\n\`\`\`diff\n${patch}${truncated ? '\n… [truncated]' : ''}\n\`\`\`\n\n`;
      }

      if (file.content && remaining - Buffer.byteLength(block) > 500) {
        // Per-content cap: at most 3 KB (we have the diff already; full content
        // is supplementary and the most expensive thing size-wise).
        const contentCap = Math.min(3_000, remaining - Buffer.byteLength(block) - 100);
        if (contentCap > 0) {
          const snippet = file.content.slice(0, contentCap);
          const truncated = snippet.length < file.content.length;
          block += `**Full content:**\n\`\`\`\n${snippet}${truncated ? '\n… [truncated]' : ''}\n\`\`\`\n\n`;
        }
      }

      remaining -= Buffer.byteLength(block);
      filesSection += block;
    }

    prompt += filesSection;
    prompt += instructions;
    return prompt;
  }

  private buildInitialPromptHeader(prData: PRData): string {
    // Sanitize all user-controlled fields before interpolation to prevent
    // prompt injection via PR descriptions, commit messages, issue bodies, etc.
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
      h += `These commits explain the intent of the changes — use them to judge whether the implementation matches the stated goal.\n\n`;
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
        // prev.summary is bot-generated, but sanitize it anyway (defence-in-depth)
        h += `### Round ${prev.round} — ${prev.verdict} (${prev.submittedAt.slice(0, 10)})\n`;
        h += `${sanitizeSummary(prev.summary)}\n\n`;
      }
    }

    if (prData.resolvedThreads.length > 0) {
      h += `## ✅ Resolved Threads (developer has addressed these — DO NOT re-raise)\n`;
      for (const t of prData.resolvedThreads) {
        const loc = t.line ? `${t.path}:${t.line}` : t.path;
        // sanitizeThreadBody strips HTML comments AND injection phrases BEFORE interpolation
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
      // Bob might wrap the JSON in markdown code blocks
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) ||
        content.match(/```\n([\s\S]*?)\n```/) ||
        content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const parsed = JSON.parse(jsonStr);
        const comments = Array.isArray(parsed.comments) ? parsed.comments : [];
        return {
          summary: parsed.summary || 'Review completed',
          verdict: inferVerdict(parsed.verdict, comments),
          comments,
        };
      }

      logger.warn('Could not parse JSON from Bob response, using text as summary');
      return { summary: content.slice(0, 500), verdict: inferVerdict(undefined, []), comments: [] };
    } catch (error) {
      logger.warn('Failed to parse Bob response:', error);
      return { summary: content.slice(0, 500), verdict: inferVerdict(undefined, []), comments: [] };
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
