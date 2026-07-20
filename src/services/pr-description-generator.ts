import { AIClient, PRData } from '../ai/base-client.js';
import { PRContext, PRContextBuilder } from '../github/context-builder.js';

import { GitHubClient } from '../github/client.js';
import { logger } from '../utils/logger.js';

export interface GeneratorConfig {
  githubToken: string;
  aiClient: AIClient;
}

export class PRDescriptionGenerator {
  private githubClient: GitHubClient;
  private contextBuilder: PRContextBuilder;
  private aiClient: AIClient;

  constructor(config: GeneratorConfig) {
    this.githubClient = new GitHubClient(config.githubToken);
    this.contextBuilder = new PRContextBuilder(config.githubToken);
    this.aiClient = config.aiClient;
  }

  /**
   * Convert PRContext to PRData format expected by AI clients
   */
  private convertContextToPRData(context: PRContext): PRData {
    return {
      title: context.title,
      description: context.description,
      author: context.author,
      baseBranch: context.baseBranch,
      headBranch: context.headBranch,
      // Review-round fields are not used for description generation
      reviewRound: 1,
      openThreads: [],
      resolvedThreads: [],
      previousReviews: [],
      commits: context.commits,
      linkedIssues: context.linkedIssues,
      relatedFiles: context.relatedFiles,
      affectedDependencies: context.affectedDependencies,
      files: context.changedFiles,
      stats: context.stats,
    };
  }

  /**
   * Generate and update PR description automatically
   * @param owner Repository owner
   * @param repo Repository name
   * @param prNumber Pull request number
   * @returns Generated description
   */
  async generateAndUpdate(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<string> {
    try {
      logger.info(`Starting PR description generation for ${owner}/${repo}#${prNumber}`);

      // Check if AI client supports description generation
      if (!this.aiClient.generatePRDescription) {
        throw new Error('AI client does not support PR description generation');
      }

      // Step 1: Build comprehensive context
      logger.info('Building PR context...');
      const context = await this.contextBuilder.buildContext(owner, repo, prNumber);
      
      logger.info(`Context built: ${context.commitCount} commits, ${context.linkedIssues.length} issues, ${context.changedFiles.length} files`);

      // Step 2: Convert context to PRData format
      const prData = this.convertContextToPRData(context);

      // Step 3: Generate description using AI
      logger.info('Generating PR description with AI...');
      const result = await this.aiClient.generatePRDescription(prData);
      
      logger.info(`Description generated (confidence: ${result.metadata.confidence})`);

      // Step 4: Update PR description on GitHub
      logger.info('Updating PR description on GitHub...');
      await this.githubClient.updatePRDescription(
        owner,
        repo,
        prNumber,
        result.description
      );

      logger.info('PR description updated successfully');
      
      return result.description;
    } catch (error) {
      logger.error('Failed to generate and update PR description', error);
      throw error;
    }
  }

  /**
   * Generate PR description without updating (for preview)
   * @param owner Repository owner
   * @param repo Repository name
   * @param prNumber Pull request number
   * @returns Generated description
   */
  async generatePreview(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<string> {
    try {
      logger.info(`Generating PR description preview for ${owner}/${repo}#${prNumber}`);

      if (!this.aiClient.generatePRDescription) {
        throw new Error('AI client does not support PR description generation');
      }

      const context = await this.contextBuilder.buildContext(owner, repo, prNumber);
      const prData = this.convertContextToPRData(context);
      const result = await this.aiClient.generatePRDescription(prData);
      
      logger.info('Preview generated successfully');
      
      return result.description;
    } catch (error) {
      logger.error('Failed to generate PR description preview', error);
      throw error;
    }
  }
}
