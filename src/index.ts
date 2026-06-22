#!/usr/bin/env node

import { AIClientFactory } from './ai/client-factory.js';
import { PRReviewer } from './reviewer.js';
import { logger } from './utils/logger.js';

async function main() {
  const githubToken = process.env.GITHUB_TOKEN;
  const prNumber = process.env.PR_NUMBER;
  const repoOwner = process.env.REPO_OWNER;
  const repoName = process.env.REPO_NAME;

  // Validate required environment variables
  if (!githubToken) {
    logger.error('GITHUB_TOKEN environment variable is required');
    process.exit(1);
  }

  if (!prNumber || !repoOwner || !repoName) {
    logger.error('PR_NUMBER, REPO_OWNER, and REPO_NAME environment variables are required');
    process.exit(1);
  }

  logger.info('🤖 Starting AI PR Reviewer...');
  logger.info(`Repository: ${repoOwner}/${repoName}`);
  logger.info(`PR Number: #${prNumber}`);

  try {
    // Create AI client based on environment configuration
    const aiConfig = AIClientFactory.getConfigFromEnv();
    const aiClient = AIClientFactory.createClient(aiConfig);
    
    logger.info(`Using AI provider: ${aiConfig.provider}`);

    const reviewer = new PRReviewer(githubToken, aiClient);
    await reviewer.reviewPR(repoOwner, repoName, parseInt(prNumber));
    
    logger.info('✅ Review completed successfully!');
  } catch (error) {
    logger.error('❌ Failed to review PR:', error);
    process.exit(1);
  }
}

main();
