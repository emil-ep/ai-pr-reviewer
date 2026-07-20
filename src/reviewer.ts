import { AIClient, ExistingThread, ReviewResult } from './ai/base-client.js';
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

  async reviewPR(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<void> {
    logger.info(`Starting review for ${owner}/${repo}#${prNumber}`);

    try {
      // ── Step 1: Build comprehensive PR context (includes review history) ──
      logger.info('Building comprehensive PR context...');
      const context = await this.contextBuilder.buildContext(owner, repo, prNumber);

      logger.info(
        `Context gathered: round=${context.reviewRound}, ` +
        `commits=${context.commits.length}, ` +
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

      // ── Step 4: Auto-resolve threads that are now fixed ───────────────────
      // On follow-up reviews, any open bot thread that the AI did NOT flag again
      // (i.e. it no longer appears in the new comment set) is considered addressed.
      // Reply with a "Fixed" note referencing the relevant commit, then resolve
      // the thread so the PR timeline stays clean.
      if (context.reviewRound > 1 && context.openThreads.length > 0) {
        await this.resolveFixedThreads(
          owner, repo, prNumber,
          context.openThreads, review.comments, context.commits
        );
      }

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

  /**
   * Resolve open threads whose issues are no longer present in the new review.
   *
   * A thread is considered "fixed" when the new review contains no comment on
   * the exact same file+line combination.  This avoids incorrectly resolving
   * a thread when the AI raises a *different* issue on the same line.
   *
   * For each such thread, we post a reply that references the commit(s) that
   * touched the same file, then resolve the thread so the PR timeline is clean.
   *
   * Failures are logged but do not abort — resolving threads is best-effort.
   */
  private async resolveFixedThreads(
    owner: string,
    repo: string,
    prNumber: number,
    openThreads: ExistingThread[],
    newComments: ReviewResult['comments'],
    commits: Array<{ sha: string; message: string }>
  ): Promise<void> {
    // Build a set of "file:line" keys that the new review still flags
    const stillFlagged = new Set(
      newComments
        .filter((c) => c.path && c.line)
        .map((c) => `${c.path}:${c.line}`)
    );

    const toResolve = openThreads.filter((t) => {
      // A thread without a line number is a general (file-level) comment —
      // only resolve it if no new comment targets the same file at all.
      const key = t.line ? `${t.path}:${t.line}` : t.path;
      return !stillFlagged.has(key);
    });

    if (toResolve.length === 0) return;

    logger.info(`Auto-resolving ${toResolve.length} thread(s) no longer flagged in this review`);

    // Build the base URL for commit links from env (same as GitHub Actions context)
    const repoUrl = `https://github.com/${owner}/${repo}`;

    for (const thread of toResolve) {
      try {
        // Find the most recent commit that touched this file — it is most
        // likely the one that addressed the review comment.
        const fixingCommit = this.findFixingCommit(thread.path, commits);
        const fixedReply = this.buildFixedReply(fixingCommit, repoUrl);

        // Post the reply first — if it fails, skip resolving too so the
        // thread remains visible rather than silently disappearing.
        await this.githubClient.replyToReviewComment(
          owner, repo, prNumber, thread.commentId, fixedReply
        );

        await this.githubClient.resolveThread(thread.threadNodeId);
        logger.info(`  ✔ Marked fixed and resolved thread at ${thread.path}${thread.line ? `:${thread.line}` : ''}`);
      } catch (error) {
        logger.warn(`  ✘ Could not mark/resolve thread ${thread.threadNodeId}:`, error);
      }
    }
  }

  /**
   * Find the most recent commit in the list that touches the given file path.
   * Falls back to the overall most recent commit when no file-specific match
   * is found (e.g., the change was a refactor that moved the file).
   */
  private findFixingCommit(
    filePath: string,
    commits: Array<{ sha: string; message: string }>
  ): { sha: string; message: string } | null {
    if (commits.length === 0) return null;
    // Commits arrive oldest-first from the GitHub API; iterate in reverse
    // to get the most recent one first.
    const reversed = [...commits].reverse();
    // A commit message that contains the filename is a strong signal.
    const byName = reversed.find((c) =>
      c.message.includes(filePath) || c.message.includes(filePath.split('/').pop() ?? '')
    );
    return byName ?? reversed[0];
  }

  /**
   * Build the markdown reply body that gets posted to the fixed thread.
   */
  private buildFixedReply(
    commit: { sha: string; message: string } | null,
    repoUrl: string
  ): string {
    if (!commit) {
      return `${BOT_MARKER}\n✅ **Fixed** — this issue appears to have been addressed in the latest push.`;
    }
    const short = commit.sha.slice(0, 7);
    const link  = `${repoUrl}/commit/${commit.sha}`;
    const subject = commit.message.split('\n')[0].slice(0, 72);
    return (
      `${BOT_MARKER}\n` +
      `✅ **Fixed** in [\`${short}\`](${link})\n` +
      `> ${subject}`
    );
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
