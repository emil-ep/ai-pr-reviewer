import { Octokit } from '@octokit/rest';
import { logger } from '../utils/logger.js';

export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  date: string;
}

export interface LinkedIssue {
  number: number;
  title: string;
  body: string;
  labels: string[];
  state: string;
}

export interface RelatedFile {
  path: string;
  reason: string; // Why this file is related
  content?: string;
}

export interface PRContext {
  // Basic PR info
  title: string;
  description: string;
  author: string;
  baseBranch: string;
  headBranch: string;
  
  // Commit history - the "what" and "why"
  commits: CommitInfo[];
  commitCount: number;
  
  // Linked issues - business context
  linkedIssues: LinkedIssue[];
  
  // Related files - broader codebase context
  relatedFiles: RelatedFile[];
  
  // Changed files with full context
  changedFiles: Array<{
    filename: string;
    patch?: string;
    content?: string;
    status: string;
  }>;
  
  // Dependencies and imports
  affectedDependencies: string[];
  
  // Statistics
  stats: {
    totalFiles: number;
    totalAdditions: number;
    totalDeletions: number;
  };
}

export class PRContextBuilder {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  /**
   * Build comprehensive context for a PR
   */
  async buildContext(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<PRContext> {
    logger.info('Building comprehensive PR context...');

    // Fetch all context in parallel for efficiency
    const [prData, commits, linkedIssues, files] = await Promise.all([
      this.fetchPRData(owner, repo, prNumber),
      this.fetchCommitHistory(owner, repo, prNumber),
      this.fetchLinkedIssues(owner, repo, prNumber),
      this.fetchChangedFiles(owner, repo, prNumber),
    ]);

    // Analyze dependencies and find related files
    const affectedDependencies = this.extractAffectedDependencies(files);
    const relatedFiles = await this.findRelatedFiles(
      owner,
      repo,
      prData.headSha,
      files
    );

    return {
      title: prData.title,
      description: prData.description,
      author: prData.author,
      baseBranch: prData.baseBranch,
      headBranch: prData.headBranch,
      commits,
      commitCount: commits.length,
      linkedIssues,
      relatedFiles,
      changedFiles: files,
      affectedDependencies,
      stats: prData.stats,
    };
  }

  /**
   * Fetch basic PR data
   */
  private async fetchPRData(owner: string, repo: string, prNumber: number) {
    const { data: pr } = await this.octokit.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    const { data: files } = await this.octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
    });

    return {
      title: pr.title,
      description: pr.body || '',
      author: pr.user?.login || 'unknown',
      baseBranch: pr.base.ref,
      headBranch: pr.head.ref,
      headSha: pr.head.sha,
      stats: {
        totalFiles: files.length,
        totalAdditions: files.reduce((sum, f) => sum + f.additions, 0),
        totalDeletions: files.reduce((sum, f) => sum + f.deletions, 0),
      },
    };
  }

  /**
   * Fetch commit history to understand the "what" and "why"
   */
  private async fetchCommitHistory(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<CommitInfo[]> {
    try {
      const { data: commits } = await this.octokit.pulls.listCommits({
        owner,
        repo,
        pull_number: prNumber,
      });

      return commits.map((commit) => ({
        sha: commit.sha,
        message: commit.commit.message,
        author: commit.commit.author?.name || 'unknown',
        date: commit.commit.author?.date || '',
      }));
    } catch (error) {
      logger.warn('Failed to fetch commit history:', error);
      return [];
    }
  }

  /**
   * Extract linked issues from PR description and commits
   * Looks for patterns like: #123, fixes #123, closes #123, resolves #123
   */
  private async fetchLinkedIssues(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<LinkedIssue[]> {
    try {
      const { data: pr } = await this.octokit.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });

      // Extract issue numbers from PR body
      const issueNumbers = this.extractIssueNumbers(pr.body || '');

      // Fetch issue details
      const issues: LinkedIssue[] = [];
      for (const issueNumber of issueNumbers.slice(0, 5)) {
        // Limit to 5 issues
        try {
          const { data: issue } = await this.octokit.issues.get({
            owner,
            repo,
            issue_number: issueNumber,
          });

          issues.push({
            number: issue.number,
            title: issue.title,
            body: issue.body || '',
            labels: issue.labels.map((l) =>
              typeof l === 'string' ? l : l.name || ''
            ),
            state: issue.state,
          });
        } catch (error) {
          logger.warn(`Failed to fetch issue #${issueNumber}:`, error);
        }
      }

      return issues;
    } catch (error) {
      logger.warn('Failed to fetch linked issues:', error);
      return [];
    }
  }

  /**
   * Extract issue numbers from text
   */
  private extractIssueNumbers(text: string): number[] {
    const patterns = [
      /#(\d+)/g, // #123
      /(?:fixes|closes|resolves|fix|close|resolve)\s+#(\d+)/gi, // fixes #123
    ];

    const numbers = new Set<number>();
    for (const pattern of patterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        numbers.add(parseInt(match[1], 10));
      }
    }

    return Array.from(numbers);
  }

  /**
   * Fetch changed files with full content
   */
  private async fetchChangedFiles(
    owner: string,
    repo: string,
    prNumber: number
  ) {
    const { data: pr } = await this.octokit.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    const { data: files } = await this.octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
    });

    const changedFiles = [];
    for (const file of files.slice(0, 15)) {
      // Limit to 15 files
      const fileData: any = {
        filename: file.filename,
        patch: file.patch,
        status: file.status,
      };

      // Fetch full content for code files
      if (file.changes < 500 && this.isCodeFile(file.filename)) {
        try {
          const { data } = await this.octokit.repos.getContent({
            owner,
            repo,
            path: file.filename,
            ref: pr.head.sha,
          });

          if ('content' in data && data.type === 'file') {
            fileData.content = Buffer.from(data.content, 'base64').toString(
              'utf-8'
            );
          }
        } catch (error) {
          logger.warn(`Could not fetch content for ${file.filename}`);
        }
      }

      changedFiles.push(fileData);
    }

    return changedFiles;
  }

  /**
   * Find related files that might be affected by changes
   */
  private async findRelatedFiles(
    owner: string,
    repo: string,
    ref: string,
    changedFiles: any[]
  ): Promise<RelatedFile[]> {
    const relatedFiles: RelatedFile[] = [];

    // Find test files for changed source files
    for (const file of changedFiles.slice(0, 5)) {
      // Limit analysis
      if (this.isSourceFile(file.filename)) {
        const testFile = this.findTestFile(file.filename);
        if (testFile) {
          try {
            const { data } = await this.octokit.repos.getContent({
              owner,
              repo,
              path: testFile,
              ref,
            });

            if ('content' in data && data.type === 'file') {
              relatedFiles.push({
                path: testFile,
                reason: `Test file for ${file.filename}`,
                content: Buffer.from(data.content, 'base64').toString('utf-8'),
              });
            }
          } catch (error) {
            // Test file doesn't exist, that's okay
          }
        }
      }
    }

    // Find config files if dependencies changed
    const hasPackageChanges = changedFiles.some(
      (f) =>
        f.filename === 'package.json' ||
        f.filename === 'requirements.txt' ||
        f.filename === 'go.mod'
    );

    if (hasPackageChanges) {
      const configFiles = ['tsconfig.json', 'jest.config.js', '.eslintrc.js'];
      for (const configFile of configFiles) {
        try {
          const { data } = await this.octokit.repos.getContent({
            owner,
            repo,
            path: configFile,
            ref,
          });

          if ('content' in data && data.type === 'file') {
            relatedFiles.push({
              path: configFile,
              reason: 'Configuration file that may be affected by dependency changes',
              content: Buffer.from(data.content, 'base64').toString('utf-8'),
            });
          }
        } catch (error) {
          // Config file doesn't exist
        }
      }
    }

    return relatedFiles;
  }

  /**
   * Extract affected dependencies from changed files
   */
  private extractAffectedDependencies(files: any[]): string[] {
    const dependencies = new Set<string>();

    for (const file of files) {
      if (file.filename === 'package.json' && file.patch) {
        // Extract npm package names from diff
        const packagePattern = /"([^"]+)":\s*"[^"]+"/g;
        const matches = file.patch.matchAll(packagePattern);
        for (const match of matches) {
          dependencies.add(match[1]);
        }
      } else if (file.filename === 'requirements.txt' && file.patch) {
        // Extract Python package names
        const lines = file.patch.split('\n');
        for (const line of lines) {
          if (line.startsWith('+') && !line.startsWith('+++')) {
            const pkg = line.substring(1).trim().split('==')[0];
            if (pkg) dependencies.add(pkg);
          }
        }
      } else if (file.filename === 'go.mod' && file.patch) {
        // Extract Go module names
        const modulePattern = /require\s+([^\s]+)/g;
        const matches = file.patch.matchAll(modulePattern);
        for (const match of matches) {
          dependencies.add(match[1]);
        }
      }
    }

    return Array.from(dependencies);
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

  private isSourceFile(filename: string): boolean {
    return (
      this.isCodeFile(filename) &&
      !filename.includes('.test.') &&
      !filename.includes('.spec.') &&
      !filename.includes('__tests__')
    );
  }

  private findTestFile(sourceFile: string): string | null {
    const ext = sourceFile.substring(sourceFile.lastIndexOf('.'));
    const baseName = sourceFile.substring(0, sourceFile.lastIndexOf('.'));

    // Common test file patterns
    const patterns = [
      `${baseName}.test${ext}`,
      `${baseName}.spec${ext}`,
      `${baseName}_test${ext}`,
      sourceFile.replace('/src/', '/__tests__/'),
    ];

    return patterns[0]; // Return first pattern for now
  }
}

// Made with Bob
