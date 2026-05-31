#!/usr/bin/env node

import { PRReviewer } from './reviewer.js';
import { logger } from './utils/logger.js';

async function main() {
  const githubToken = process.env.GITHUB_TOKEN;
  const grokApiKey = process.env.GROK_API_KEY;
  const prNumber = process.env.PR_NUMBER;
  const repoOwner = process.env.REPO_OWNER;
  const repoName = process.env.REPO_NAME;

  // Validate required environment variables
  if (!githubToken) {
    logger.error('GITHUB_TOKEN environment variable is required');
    process.exit(1);
  }

  if (!grokApiKey) {
    logger.error('GROK_API_KEY environment variable is required');
    logger.error('Please add GROK_API_KEY to your GitHub repository secrets');
    logger.error('Get your API key from: https://console.x.ai/');
    process.exit(1);
  }

  if (!prNumber || !repoOwner || !repoName) {
    logger.error('PR_NUMBER, REPO_OWNER, and REPO_NAME environment variables are required');
    process.exit(1);
  }

  logger.info('🤖 Starting Grok PR Reviewer...');
  logger.info(`Repository: ${repoOwner}/${repoName}`);
  logger.info(`PR Number: #${prNumber}`);

  try {
    const reviewer = new PRReviewer(githubToken, grokApiKey);
    await reviewer.reviewPR(repoOwner, repoName, parseInt(prNumber));
    
    logger.info('✅ Review completed successfully!');
  } catch (error) {
    logger.error('❌ Failed to review PR:', error);
    process.exit(1);
  }
}

main();

// Made with Bob
