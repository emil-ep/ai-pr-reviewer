import { AIClient, ReviewResult } from './ai/base-client.js';
import { GitHubClient } from './github/client.js';
import { PRContextBuilder } from './github/context-builder.js';
import { logger } from './utils/logger.js';

/**
 * Re-fetch the current review count for a PR immediately before submitting,
 * to detect the case where two workflow runs raced and both calculated the
 * same reviewRound.  Returns the actual round the bot should record.
 * Throws if we detect a concurrent submission has already bumped the count.
 */
async function verifyRoundNotStale(
  octokit: GitHubClient,
  owner: string,
  repo: string,
  prNumber: number,
  expectedRound: number
): Promise<void> {
  const currentReviews = await octokit.fetchPreviousBotReviews(owner, repo, prNumber);
  const currentRound = currentReviews.length + 1;
  if (currentRound !== expectedRound) {
    throw new Error(
      `Concurrent review detected: expected round ${expectedRound} but ` +
      `GitHub already has ${currentReviews.length} bot review(s) (round ${currentRound}). ` +
      `This run will abort to avoid duplicate comments. ` +
      `The other concurrent run has already submitted the review.`
    );
  }
}

/**
 * HTML marker embedded in every bot review body and every inline comment.
 * Used to identify prior bot contributions when fetching review history.
 */
const BOT_MARKER = '<!-- bob-pr-review -->';

export class PRReviewer {
  private githubClient: GitHubClient;
  private contextBuilder: PRContextBuilder;
  private aiClient: AIClient;

  constructor(githubToken: string, aiClient: AIClient) {
    this.githubClient = new GitHubClient(githubToken);
    this.contextBuilder = new PRContextBuilder(githubToken);
    this.aiClient = aiClient;
  }

  async reviewPR(owner: string, repo: string, prNumber: number): Promise<void> {
    logger.info(`Starting review for ${owner}/${repo}#${prNumber}`);

    try {
      // ── Step 1: Build comprehensive PR context (includes review history) ──
      logger.info('Building comprehensive PR context...');
      const context = await this.contextBuilder.buildContext(owner, repo, prNumber);

      logger.info(
        `Context gathered: round=${context.reviewRound}, ` +
        `commits=${context.commits.length}, issues=${context.linkedIssues.length}, ` +
        `relatedFiles=${context.relatedFiles.length}, deps=${context.affectedDependencies.length}, ` +
        `openThreads=${context.openThreads.length}, resolvedThreads=${context.resolvedThreads.length}`
      );

      if (context.reviewRound > 1) {
        logger.info(
          `Follow-up review round ${context.reviewRound}. ` +
          `${context.resolvedThreads.length} threads resolved by developer, ` +
          `${context.openThreads.length} still open.`
        );
      }

      // ── Step 2: Send context to AI ────────────────────────────────────────
      logger.info('Requesting AI review...');
      const review = await this.aiClient.reviewPR({
        title: context.title,
        description: context.description,
        author: context.author,
        baseBranch: context.baseBranch,
        headBranch: context.headBranch,
        reviewRound: context.reviewRound,
        openThreads: context.openThreads,
        resolvedThreads: context.resolvedThreads,
        previousReviews: context.previousReviews,
        commits: context.commits,
        linkedIssues: context.linkedIssues,
        relatedFiles: context.relatedFiles,
        affectedDependencies: context.affectedDependencies,
        files: context.changedFiles,
        stats: context.stats,
      });

      logger.info(
        `AI review complete: verdict=${review.verdict ?? 'COMMENT'}, ` +
        `comments=${review.comments.length}`
      );

      // ── Step 3: Verify round is still current, then submit ────────────────
      // Re-read the round count right before submission to catch the race where
      // two workflow runs triggered simultaneously (e.g., user pushes a commit
      // while the bot is still calling the AI) and both calculated the same round.
      await verifyRoundNotStale(
        this.githubClient, owner, repo, prNumber, context.reviewRound
      );
      await this.submitReview(owner, repo, prNumber, context.headSha, review, context.reviewRound);

      logger.info('✅ Review submitted successfully');
    } catch (error) {
      logger.error('Failed to review PR:', error);
      throw error;
    }
  }

  private async submitReview(
    owner: string,
    repo: string,
    prNumber: number,
    commitSha: string,
    review: ReviewResult,
    round: number
  ): Promise<void> {
    const verdict = (review.verdict ?? 'COMMENT') as 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';

    // Build the top-level review body (summary + stats)
    const reviewBody = this.formatReviewBody(review, round);

    // Build inline comment objects, limited to 20 to stay within API limits
    const inlineComments = review.comments
      .slice(0, 20)
      .filter((c) => c.path && c.line)
      .map((c) => ({
        path: c.path,
        line: c.line,
        body: this.formatCommentBody(c.severity, c.message),
      }));

    logger.info(`Submitting review: verdict=${verdict}, inlineComments=${inlineComments.length}`);

    try {
      await this.githubClient.submitReview(
        owner,
        repo,
        prNumber,
        commitSha,
        verdict,
        reviewBody,
        inlineComments
      );
    } catch (error) {
      // If the atomic review submission fails (e.g., line numbers don't align
      // with the commit), fall back to a summary-only COMMENT review.
      logger.warn('Atomic review submission failed, falling back to summary-only comment:', error);
      await this.githubClient.submitReview(
        owner,
        repo,
        prNumber,
        commitSha,
        'COMMENT',
        reviewBody,
        []
      );
    }
  }

  private formatReviewBody(review: ReviewResult, round: number): string {
    const criticalCount = review.comments.filter((c) => c.severity === 'critical').length;
    const warningCount = review.comments.filter((c) => c.severity === 'warning').length;
    const suggestionCount = review.comments.filter((c) => c.severity === 'suggestion').length;

    const roundLabel = round > 1 ? ` (Round ${round})` : '';

    let body = `${BOT_MARKER}\n`;
    body += `## 🤖 AI Code Review${roundLabel}\n\n`;

    if (round > 1) {
      body += `> This is a follow-up review. Issues resolved by the developer have been acknowledged and are not re-raised.\n\n`;
    }

    body += `${review.summary}\n\n`;
    body += `### Review Summary\n`;
    body += `| Severity | Count |\n`;
    body += `|----------|-------|\n`;
    body += `| 🔴 Critical | ${criticalCount} |\n`;
    body += `| 🟡 Warning | ${warningCount} |\n`;
    body += `| 🔵 Suggestion | ${suggestionCount} |\n\n`;

    const verdict = review.verdict ?? 'COMMENT';
    if (verdict === 'APPROVE') {
      body += `✅ **Approved.** No blocking issues found.\n\n`;
    } else if (verdict === 'REQUEST_CHANGES') {
      body += `🚫 **Changes requested.** Please address critical issues before merging.\n\n`;
    } else if (warningCount > 0) {
      body += `⚠️ No critical issues, but please review warnings before merging.\n\n`;
    } else {
      body += `✅ Only minor suggestions — no blocking issues.\n\n`;
    }

    body += `---\n*Powered by AI Code Review · Round ${round}*`;
    return body;
  }

  private formatCommentBody(severity: string, message: string): string {
    const emoji = severity === 'critical' ? '🔴' : severity === 'warning' ? '🟡' : '🔵';
    // Ensure the bot marker is present (the AI is instructed to include it,
    // but we add it defensively here as well so thread detection always works).
    const body = message.includes(BOT_MARKER)
      ? message
      : `${BOT_MARKER}\n${message}`;
    return `${emoji} **${severity.toUpperCase()}**\n\n${body}`;
  }
}
