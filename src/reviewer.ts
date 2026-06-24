import { AIClient, ReviewResult } from './ai/base-client.js';
import { GitHubClient, PRDiff } from './github/client.js';
import { PRContextBuilder } from './github/context-builder.js';
import { logger } from './utils/logger.js';

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
      // Step 1: Build comprehensive PR context
      logger.info('Building comprehensive PR context...');
      const context = await this.contextBuilder.buildContext(owner, repo, prNumber);

      logger.info(`Context gathered:
        - ${context.commits.length} commits
        - ${context.linkedIssues.length} linked issues
        - ${context.relatedFiles.length} related files
        - ${context.affectedDependencies.length} affected dependencies`);

      // Step 2: Send enhanced context to AI for review
      logger.info('Sending enhanced context to AI for analysis...');
      const review = await this.aiClient.reviewPR({
        title: context.title,
        description: context.description,
        author: context.author,
        baseBranch: context.baseBranch,
        headBranch: context.headBranch,
        commits: context.commits,
        linkedIssues: context.linkedIssues,
        relatedFiles: context.relatedFiles,
        affectedDependencies: context.affectedDependencies,
        files: context.changedFiles,
        stats: context.stats,
      });

      // Step 3: Post review comments
      logger.info(`Posting review with ${review.comments.length} comments...`);
      const prDiff = await this.githubClient.fetchPRDiff(owner, repo, prNumber);
      await this.postReview(owner, repo, prNumber, prDiff.pr.head_sha, review);

      logger.info('✅ Review completed successfully');
    } catch (error) {
      logger.error('Failed to review PR:', error);
      throw error;
    }
  }


  private async postReview(
    owner: string,
    repo: string,
    prNumber: number,
    commitSha: string,
    review: ReviewResult
  ): Promise<void> {
    // Post summary comment
    const summaryBody = this.formatSummaryComment(review);
    await this.githubClient.postReviewComment(
      owner,
      repo,
      prNumber,
      summaryBody
    );

    // Post inline comments
    for (const comment of review.comments.slice(0, 20)) {
      // Limit to 20 comments
      try {
        const emoji = this.getSeverityEmoji(comment.severity);
        const body = `${emoji} **${comment.severity.toUpperCase()}**\n\n${comment.message}`;

        await this.githubClient.postReviewComment(
          owner,
          repo,
          prNumber,
          body,
          commitSha,
          comment.path,
          comment.line
        );

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        logger.warn(`Failed to post comment on ${comment.path}:${comment.line}`, error);
      }
    }
  }

  private formatSummaryComment(review: ReviewResult): string {
    const criticalCount = review.comments.filter(
      (c) => c.severity === 'critical'
    ).length;
    const warningCount = review.comments.filter(
      (c) => c.severity === 'warning'
    ).length;
    const suggestionCount = review.comments.filter(
      (c) => c.severity === 'suggestion'
    ).length;

    let summary = `## 🤖 AI PR Review\n\n`;
    summary += `${review.summary}\n\n`;
    summary += `### Summary\n`;
    summary += `- 🔴 Critical: ${criticalCount}\n`;
    summary += `- 🟡 Warnings: ${warningCount}\n`;
    summary += `- 🔵 Suggestions: ${suggestionCount}\n\n`;

    if (criticalCount > 0) {
      summary += `⚠️ **Please address critical issues before merging.**\n\n`;
    } else if (warningCount > 0) {
      summary += `✅ No critical issues found, but please review warnings.\n\n`;
    } else {
      summary += `✅ Looks good! Only minor suggestions.\n\n`;
    }

    summary += `---\n*Powered by AI Code Review*`;

    return summary;
  }

  private getSeverityEmoji(severity: string): string {
    switch (severity) {
      case 'critical':
        return '🔴';
      case 'warning':
        return '🟡';
      case 'suggestion':
        return '🔵';
      default:
        return '💬';
    }
  }
}
