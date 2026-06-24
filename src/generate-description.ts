#!/usr/bin/env node

import { AIClientFactory } from './ai/client-factory.js';
import { PRDescriptionGenerator } from './services/pr-description-generator.js';
import { config } from 'dotenv';
import { logger } from './utils/logger.js';

// Load environment variables
config();

async function main() {
  try {
    // Validate required environment variables
    const githubToken = process.env.GITHUB_TOKEN;
    const owner = process.env.REPO_OWNER;
    const repo = process.env.REPO_NAME;
    const prNumber = process.env.PR_NUMBER;

    if (!githubToken) {
      throw new Error('GITHUB_TOKEN environment variable is required');
    }

    if (!owner) {
      throw new Error('REPO_OWNER environment variable is required');
    }

    if (!repo) {
      throw new Error('REPO_NAME environment variable is required');
    }

    if (!prNumber) {
      throw new Error('PR_NUMBER environment variable is required');
    }

    const prNum = parseInt(prNumber, 10);
    if (isNaN(prNum)) {
      throw new Error('PR_NUMBER must be a valid number');
    }

    logger.info('='.repeat(60));
    logger.info('PR Description Generator');
    logger.info('='.repeat(60));
    logger.info(`Repository: ${owner}/${repo}`);
    logger.info(`PR Number: #${prNum}`);
    logger.info(`AI Provider: ${process.env.AI_PROVIDER || 'bob'}`);
    logger.info('='.repeat(60));

    // Create AI client from environment variables
    const clientConfig = AIClientFactory.getConfigFromEnv();
    const aiClient = AIClientFactory.createClient(clientConfig);

    // Create generator
    const generator = new PRDescriptionGenerator({
      githubToken,
      aiClient,
    });

    // Generate and update PR description
    logger.info('Starting PR description generation...');
    const description = await generator.generateAndUpdate(owner, repo, prNum);

    logger.info('='.repeat(60));
    logger.info('✅ PR description generated and updated successfully!');
    logger.info('='.repeat(60));
    logger.info('Generated Description:');
    logger.info('-'.repeat(60));
    logger.info(description);
    logger.info('='.repeat(60));

    process.exit(0);
  } catch (error) {
    logger.error('❌ Failed to generate PR description', error);
    
    if (error instanceof Error) {
      logger.error(`Error: ${error.message}`);
      if (error.stack) {
        logger.error(`Stack: ${error.stack}`);
      }
    }

    process.exit(1);
  }
}

// Run the main function
main();
