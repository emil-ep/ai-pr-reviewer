import { AIClient, ReviewResult } from './ai/base-client.js';
import { GitHubClient, PRDiff } from './github/client.js';

import { logger } from './utils/logger.js';

export class PRReviewer {
  private githubClient: GitHubClient;
  private aiClient: AIClient;

  constructor(githubToken: string, aiClient: AIClient) {
    this.githubClient = new GitHubClient(githubToken);
    this.aiClient = aiClient;
  }

  async reviewPR(owner: string, repo: string, prNumber: number): Promise<void> {
    logger.info(`Starting review for ${owner}/${repo}#${prNumber}`);

    try {
      // Step 1: Fetch PR data
      logger.info('Fetching PR diff...');
      const prDiff = await this.githubClient.fetchPRDiff(owner, repo, prNumber);

      // Step 2: Get full file contents for context
      logger.info(`Fetching content for ${prDiff.files.length} files...`);
      const filesWithContent = await this.fetchFileContents(
        owner,
        repo,
        prDiff
      );

      // Step 3: Send to AI for review
      logger.info('Sending to AI for analysis...');
      const review = await this.aiClient.reviewPR({
        title: prDiff.pr.title,
        description: prDiff.pr.description,
        files: filesWithContent,
      });

      // Step 4: Post review comments
      logger.info(`Posting review with ${review.comments.length} comments...`);
      await this.postReview(owner, repo, prNumber, prDiff.pr.head_sha, review);

      logger.info('✅ Review completed successfully');
    } catch (error) {
      logger.error('Failed to review PR:', error);
      throw error;
    }
  }

  private async fetchFileContents(
    owner: string,
    repo: string,
    prDiff: PRDiff
  ): Promise<Array<{ filename: string; patch?: string; content?: string }>> {
    const filesWithContent = [];

    for (const file of prDiff.files.slice(0, 10)) {
      // Limit to 10 files
      try {
        const fileData: { filename: string; patch?: string; content?: string } = {
          filename: file.filename,
          patch: file.patch,
        };

        // Only fetch content for code files (not too large)
        if (file.changes < 500 && this.isCodeFile(file.filename)) {
          try {
            const content = await this.githubClient.getFileContent(
              owner,
              repo,
              file.filename,
              prDiff.pr.head_sha
            );
            fileData.content = content.content;
          } catch (error) {
            logger.warn(`Could not fetch content for ${file.filename}`);
          }
        }

        filesWithContent.push(fileData);
      } catch (error) {
        logger.warn(`Error processing file ${file.filename}:`, error);
      }
    }

    return filesWithContent;
  }

  private isCodeFile(filename: string): boolean {
    const codeExtensions = [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.py',
      '.java',
      '.go',
      '.rs',
      '.cpp',
      '.c',
      '.h',
      '.cs',
      '.rb',
      '.php',
      '.swift',
      '.kt',
    ];

    return codeExtensions.some((ext) => filename.endsWith(ext));
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
