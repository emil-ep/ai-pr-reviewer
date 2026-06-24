import { GitDiffSummary } from '../ai/base-client.js';
import { execSync } from 'child_process';
import { logger } from './logger.js';

export class GitDiffAnalyzer {
  private readonly EXCLUDED_FILES = [
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'Cargo.lock',
    'Gemfile.lock',
    'composer.lock',
    'poetry.lock',
    '*.min.js',
    '*.min.css',
    '*.map',
    'dist/',
    'build/',
    'node_modules/',
    '.next/',
    'coverage/',
  ];

  private readonly MAX_CRITICAL_LINES = 50;

  /**
   * Analyze staged git changes and create a token-optimized summary
   */
  async analyzeStagedChanges(): Promise<GitDiffSummary> {
    try {
      // Check if there are staged changes
      const stagedFiles = this.getStagedFiles();
      if (stagedFiles.length === 0) {
        throw new Error('No staged changes found. Use "git add" to stage files first.');
      }

      // Get diff statistics
      const stats = this.getDiffStats();
      
      // Get file-level changes
      const files = this.getFileChanges();
      
      // Extract modified functions/classes
      const modifiedFunctions = this.extractModifiedFunctions();
      
      // Get critical code snippets
      const criticalChanges = this.getCriticalChanges();

      return {
        totalFiles: stats.totalFiles,
        totalAdditions: stats.totalAdditions,
        totalDeletions: stats.totalDeletions,
        files,
        modifiedFunctions,
        criticalChanges,
      };
    } catch (error) {
      logger.error('Failed to analyze git diff:', error);
      throw error;
    }
  }

  /**
   * Get list of staged files
   */
  private getStagedFiles(): string[] {
    try {
      const output = execSync('git diff --cached --name-only', { encoding: 'utf-8' });
      return output.trim().split('\n').filter(f => f.length > 0);
    } catch (error) {
      return [];
    }
  }

  /**
   * Get diff statistics (additions/deletions per file)
   */
  private getDiffStats(): { totalFiles: number; totalAdditions: number; totalDeletions: number } {
    try {
      const output = execSync('git diff --cached --numstat', { encoding: 'utf-8' });
      const lines = output.trim().split('\n').filter(l => l.length > 0);
      
      let totalAdditions = 0;
      let totalDeletions = 0;
      let totalFiles = 0;

      for (const line of lines) {
        const [additions, deletions] = line.split('\t');
        if (additions !== '-' && deletions !== '-') {
          totalAdditions += parseInt(additions, 10);
          totalDeletions += parseInt(deletions, 10);
          totalFiles++;
        }
      }

      return { totalFiles, totalAdditions, totalDeletions };
    } catch (error) {
      logger.error('Failed to get diff stats:', error);
      return { totalFiles: 0, totalAdditions: 0, totalDeletions: 0 };
    }
  }

  /**
   * Get file-level changes with status
   */
  private getFileChanges(): GitDiffSummary['files'] {
    try {
      const output = execSync('git diff --cached --numstat', { encoding: 'utf-8' });
      const statusOutput = execSync('git diff --cached --name-status', { encoding: 'utf-8' });
      
      const numstatLines = output.trim().split('\n').filter(l => l.length > 0);
      const statusLines = statusOutput.trim().split('\n').filter(l => l.length > 0);
      
      const statusMap = new Map<string, string>();
      for (const line of statusLines) {
        const [status, ...pathParts] = line.split('\t');
        const path = pathParts.join('\t');
        statusMap.set(path, status);
      }

      const files: GitDiffSummary['files'] = [];

      for (const line of numstatLines) {
        const [additions, deletions, ...pathParts] = line.split('\t');
        const path = pathParts.join('\t');
        
        // Skip excluded files
        if (this.shouldExcludeFile(path)) {
          continue;
        }

        const status = statusMap.get(path) || 'M';
        const statusType = this.mapGitStatus(status);

        files.push({
          path,
          additions: additions === '-' ? 0 : parseInt(additions, 10),
          deletions: deletions === '-' ? 0 : parseInt(deletions, 10),
          status: statusType,
        });
      }

      return files;
    } catch (error) {
      logger.error('Failed to get file changes:', error);
      return [];
    }
  }

  /**
   * Extract modified functions and classes from diff
   */
  private extractModifiedFunctions(): GitDiffSummary['modifiedFunctions'] {
    try {
      const output = execSync('git diff --cached -U0', { encoding: 'utf-8' });
      const functions: GitDiffSummary['modifiedFunctions'] = [];
      
      const lines = output.split('\n');
      let currentFile = '';

      for (const line of lines) {
        // Track current file
        if (line.startsWith('diff --git')) {
          const match = line.match(/b\/(.+)$/);
          if (match) {
            currentFile = match[1];
          }
          continue;
        }

        // Skip excluded files
        if (this.shouldExcludeFile(currentFile)) {
          continue;
        }

        // Extract function/class definitions
        if (line.startsWith('+') || line.startsWith('-')) {
          const cleanLine = line.substring(1).trim();
          
          // Match function definitions
          const functionMatch = cleanLine.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
          const arrowFunctionMatch = cleanLine.match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/);
          const methodMatch = cleanLine.match(/^(?:public|private|protected|static)?\s*(?:async\s+)?(\w+)\s*\(/);
          const classMatch = cleanLine.match(/^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/);
          const interfaceMatch = cleanLine.match(/^(?:export\s+)?interface\s+(\w+)/);

          if (functionMatch) {
            functions.push({ file: currentFile, name: functionMatch[1], type: 'function' });
          } else if (arrowFunctionMatch) {
            functions.push({ file: currentFile, name: arrowFunctionMatch[1], type: 'function' });
          } else if (methodMatch) {
            functions.push({ file: currentFile, name: methodMatch[1], type: 'method' });
          } else if (classMatch) {
            functions.push({ file: currentFile, name: classMatch[1], type: 'class' });
          } else if (interfaceMatch) {
            functions.push({ file: currentFile, name: interfaceMatch[1], type: 'interface' });
          }
        }
      }

      // Remove duplicates
      const uniqueFunctions = Array.from(
        new Map(functions.map(f => [`${f.file}:${f.name}`, f])).values()
      );

      return uniqueFunctions.slice(0, 20); // Limit to 20 most important
    } catch (error) {
      logger.error('Failed to extract modified functions:', error);
      return [];
    }
  }

  /**
   * Get critical code changes (first N lines of most important changes)
   */
  private getCriticalChanges(): string[] {
    try {
      const output = execSync('git diff --cached -U1', { encoding: 'utf-8' });
      const lines = output.split('\n');
      const criticalLines: string[] = [];
      let currentFile = '';
      let lineCount = 0;

      for (const line of lines) {
        if (lineCount >= this.MAX_CRITICAL_LINES) {
          break;
        }

        // Track current file
        if (line.startsWith('diff --git')) {
          const match = line.match(/b\/(.+)$/);
          if (match) {
            currentFile = match[1];
          }
          continue;
        }

        // Skip excluded files
        if (this.shouldExcludeFile(currentFile)) {
          continue;
        }

        // Include file headers and hunks
        if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) {
          criticalLines.push(line);
          lineCount++;
          continue;
        }

        // Include added/removed lines (skip context)
        if (line.startsWith('+') || line.startsWith('-')) {
          criticalLines.push(line);
          lineCount++;
        }
      }

      return criticalLines;
    } catch (error) {
      logger.error('Failed to get critical changes:', error);
      return [];
    }
  }

  /**
   * Check if file should be excluded from analysis
   */
  private shouldExcludeFile(path: string): boolean {
    return this.EXCLUDED_FILES.some(pattern => {
      if (pattern.endsWith('/')) {
        return path.startsWith(pattern);
      }
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(path);
      }
      return path === pattern || path.endsWith(pattern);
    });
  }

  /**
   * Map git status codes to our status types
   */
  private mapGitStatus(status: string): 'added' | 'modified' | 'deleted' | 'renamed' {
    switch (status.charAt(0)) {
      case 'A':
        return 'added';
      case 'D':
        return 'deleted';
      case 'R':
        return 'renamed';
      case 'M':
      default:
        return 'modified';
    }
  }

  /**
   * Format the summary for display
   */
  formatSummary(summary: GitDiffSummary): string {
    const lines: string[] = [];
    
    lines.push(`📊 Changes Summary:`);
    lines.push(`   Files: ${summary.totalFiles}`);
    lines.push(`   Additions: +${summary.totalAdditions}`);
    lines.push(`   Deletions: -${summary.totalDeletions}`);
    lines.push('');

    if (summary.files.length > 0) {
      lines.push('📁 Modified Files:');
      for (const file of summary.files.slice(0, 10)) {
        const statusEmoji = {
          added: '✨',
          modified: '📝',
          deleted: '🗑️',
          renamed: '📋',
        }[file.status];
        lines.push(`   ${statusEmoji} ${file.path} (+${file.additions} -${file.deletions})`);
      }
      if (summary.files.length > 10) {
        lines.push(`   ... and ${summary.files.length - 10} more files`);
      }
      lines.push('');
    }

    if (summary.modifiedFunctions && summary.modifiedFunctions.length > 0) {
      lines.push('🔧 Modified Functions/Classes:');
      for (const func of summary.modifiedFunctions.slice(0, 10)) {
        const typeEmoji = {
          function: '⚡',
          class: '🏛️',
          method: '🔨',
          interface: '📐',
        }[func.type];
        lines.push(`   ${typeEmoji} ${func.name} in ${func.file}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}
