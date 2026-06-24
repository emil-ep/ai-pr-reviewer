#!/usr/bin/env node

import * as readline from 'readline';

import { AIClientFactory } from './ai/client-factory.js';
import { GitDiffAnalyzer } from './utils/git-diff-analyzer.js';
import { logger } from './utils/logger.js';

interface CommitOption {
  number: number;
  type: string;
  scope?: string;
  subject: string;
  body?: string;
  breaking: boolean;
  confidence: string;
  fullMessage: string;
}

async function main() {
  try {
    console.log('🤖 AI-Powered Commit Message Suggester\n');

    // Step 1: Analyze staged changes
    console.log('📊 Analyzing staged changes...\n');
    const analyzer = new GitDiffAnalyzer();
    const diffSummary = await analyzer.analyzeStagedChanges();

    // Display summary
    console.log(analyzer.formatSummary(diffSummary));

    // Step 2: Get AI client
    console.log('🔧 Initializing AI client...');
    const config = AIClientFactory.getConfigFromEnv();
    const aiClient = AIClientFactory.createClient(config);

    // Check if client supports commit message generation
    if (!aiClient.generateCommitMessage) {
      console.error('❌ Error: The selected AI provider does not support commit message generation yet.');
      console.error(`   Current provider: ${config.provider}`);
      console.error('   Supported providers: chatgpt, claude, grok, bob');
      process.exit(1);
    }

    // Step 3: Generate commit message suggestions
    console.log(`💭 Generating commit message suggestions with ${config.provider}...\n`);
    const result = await aiClient.generateCommitMessage(diffSummary);

    if (!result.suggestions || result.suggestions.length === 0) {
      console.error('❌ No commit message suggestions generated');
      process.exit(1);
    }

    // Step 4: Display suggestions
    console.log('✨ Suggested Commit Messages:\n');
    const options: CommitOption[] = result.suggestions.map((suggestion, index) => {
      const scope = suggestion.scope ? `(${suggestion.scope})` : '';
      const breaking = suggestion.breaking ? '!' : '';
      const subject = `${suggestion.type}${scope}${breaking}: ${suggestion.subject}`;
      
      let fullMessage = subject;
      if (suggestion.body) {
        fullMessage += `\n\n${suggestion.body}`;
      }
      if (suggestion.breaking && suggestion.body && !suggestion.body.includes('BREAKING CHANGE:')) {
        fullMessage += '\n\nBREAKING CHANGE: This commit introduces breaking changes';
      }

      return {
        number: index + 1,
        type: suggestion.type,
        scope: suggestion.scope,
        subject: suggestion.subject,
        body: suggestion.body,
        breaking: suggestion.breaking || false,
        confidence: suggestion.confidence,
        fullMessage,
      };
    });

    options.forEach((option) => {
      const confidenceEmoji = {
        high: '🟢',
        medium: '🟡',
        low: '🔴',
      }[option.confidence] || '⚪';

      console.log(`${option.number}. ${confidenceEmoji} ${option.fullMessage.split('\n')[0]}`);
      console.log(`   Confidence: ${option.confidence}`);
      if (option.body) {
        console.log(`   Body: ${option.body.slice(0, 100)}${option.body.length > 100 ? '...' : ''}`);
      }
      if (option.breaking) {
        console.log(`   ⚠️  BREAKING CHANGE`);
      }
      console.log('');
    });

    // Step 5: Let user choose
    const choice = await promptUser(
      `Choose a commit message (1-${options.length}), 'e' to edit, or 'q' to quit: `,
      options.length
    );

    if (choice === 'q') {
      console.log('👋 Cancelled');
      process.exit(0);
    }

    if (choice === 'e') {
      console.log('\n📝 Opening editor to write custom commit message...');
      console.log('   (Use your default git editor)');
      
      // Create a temp file with suggestions as comments
      const { execSync } = require('child_process');
      const fs = require('fs');
      const os = require('os');
      const path = require('path');
      
      const tempFile = path.join(os.tmpdir(), 'COMMIT_EDITMSG');
      const content = options.map(o => `# ${o.number}. ${o.fullMessage.split('\n')[0]}`).join('\n');
      fs.writeFileSync(tempFile, `\n\n${content}\n# Write your commit message above. Lines starting with # will be ignored.`);
      
      try {
        execSync(`git commit -e -F ${tempFile}`, { stdio: 'inherit' });
        console.log('✅ Committed successfully!');
      } catch (error) {
        console.error('❌ Commit cancelled or failed');
      }
      
      fs.unlinkSync(tempFile);
      process.exit(0);
    }

    const selectedOption = options[parseInt(choice) - 1];
    
    // Step 6: Confirm and commit
    console.log('\n📋 Selected commit message:');
    console.log('─'.repeat(60));
    console.log(selectedOption.fullMessage);
    console.log('─'.repeat(60));
    
    const confirm = await promptUser('\nCommit with this message? (y/n): ', 0);
    
    if (confirm.toLowerCase() !== 'y') {
      console.log('👋 Cancelled');
      process.exit(0);
    }

    // Step 7: Execute commit
    const { execSync } = require('child_process');
    try {
      execSync(`git commit -m "${selectedOption.fullMessage.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
      console.log('\n✅ Committed successfully!');
      
      // Show commit info
      const commitInfo = execSync('git log -1 --oneline', { encoding: 'utf-8' });
      console.log(`\n📝 ${commitInfo.trim()}`);
    } catch (error) {
      console.error('\n❌ Commit failed:', error);
      process.exit(1);
    }

  } catch (error: any) {
    logger.error('Error:', error);
    console.error(`\n❌ Error: ${error.message}`);
    
    if (error.message.includes('No staged changes')) {
      console.error('\n💡 Tip: Use "git add <files>" to stage changes first');
    }
    
    process.exit(1);
  }
}

async function promptUser(question: string, maxChoice: number): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      
      const trimmed = answer.trim().toLowerCase();
      
      if (trimmed === 'q' || trimmed === 'e') {
        resolve(trimmed);
        return;
      }
      
      const num = parseInt(trimmed);
      if (maxChoice > 0 && (!isNaN(num) && num >= 1 && num <= maxChoice)) {
        resolve(trimmed);
        return;
      }
      
      console.log(`Invalid choice. Please enter 1-${maxChoice}, 'e', or 'q'`);
      resolve(promptUser(question, maxChoice));
    });
  });
}

main();

// Made with Bob
