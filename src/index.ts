#!/usr/bin/env node

import { PRReviewerServer } from './server.js';
import { logger } from './utils/logger.js';

async function main() {
  const githubToken = process.env.GITHUB_TOKEN;

  if (!githubToken) {
    logger.error('GITHUB_TOKEN environment variable is required');
    process.exit(1);
  }

  try {
    const server = new PRReviewerServer(githubToken);
    await server.start();
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();

// Made with Bob
