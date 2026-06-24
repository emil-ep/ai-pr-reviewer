import { Octokit } from '@octokit/rest';

export interface PRMetadata {
  number: number;
  title: string;
  description: string;
  author: string;
  base_branch: string;
  head_branch: string;
  head_sha: string;
}

export interface FileChange {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

export interface PRDiff {
  pr: PRMetadata;
  files: FileChange[];
  stats: {
    total_files: number;
    total_additions: number;
    total_deletions: number;
  };
}

export class GitHubClient {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async fetchPRDiff(owner: string, repo: string, prNumber: number): Promise<PRDiff> {
    try {
      // Fetch PR details
      const { data: pr } = await this.octokit.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });

      // Fetch PR files
      const { data: files } = await this.octokit.pulls.listFiles({
        owner,
        repo,
        pull_number: prNumber,
      });

      const fileChanges: FileChange[] = files.map(file => ({
        filename: file.filename,
        status: file.status as FileChange['status'],
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        patch: file.patch,
      }));

      const stats = {
        total_files: files.length,
        total_additions: files.reduce((sum, f) => sum + f.additions, 0),
        total_deletions: files.reduce((sum, f) => sum + f.deletions, 0),
      };

      return {
        pr: {
          number: pr.number,
          title: pr.title,
          description: pr.body || '',
          author: pr.user?.login || 'unknown',
          base_branch: pr.base.ref,
          head_branch: pr.head.ref,
          head_sha: pr.head.sha,
        },
        files: fileChanges,
        stats,
      };
    } catch (error) {
      throw new Error(`Failed to fetch PR diff: ${error}`);
    }
  }

  async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref: string
  ): Promise<{ path: string; content: string; size: number; encoding: string }> {
    try {
      const { data } = await this.octokit.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });

      if ('content' in data && data.type === 'file') {
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        return {
          path: data.path,
          content,
          size: data.size,
          encoding: 'utf-8',
        };
      }

      throw new Error('Path is not a file');
    } catch (error) {
      throw new Error(`Failed to get file content: ${error}`);
    }
  }

  async postReviewComment(
    owner: string,
    repo: string,
    prNumber: number,
    body: string,
    commitId?: string,
    path?: string,
    line?: number,
    side: 'LEFT' | 'RIGHT' = 'RIGHT'
  ): Promise<void> {
    try {
      if (path && line && commitId) {
        // Post inline comment
        await this.octokit.pulls.createReviewComment({
          owner,
          repo,
          pull_number: prNumber,
          body,
          commit_id: commitId,
          path,
          line,
          side,
        });
      } else {
        // Post general comment
        await this.octokit.issues.createComment({
          owner,
          repo,
          issue_number: prNumber,
          body,
        });
      }
    } catch (error) {
      throw new Error(`Failed to post review comment: ${error}`);
    }
  }

  async updatePRDescription(
    owner: string,
    repo: string,
    prNumber: number,
    description: string
  ): Promise<void> {
    try {
      await this.octokit.pulls.update({
        owner,
        repo,
        pull_number: prNumber,
        body: description,
      });
    } catch (error) {
      throw new Error(`Failed to update PR description: ${error}`);
    }
  }

  async listPRFiles(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<{ files: Array<{ path: string; status: string; additions: number; deletions: number }> }> {
    try {
      const { data: files } = await this.octokit.pulls.listFiles({
        owner,
        repo,
        pull_number: prNumber,
      });

      return {
        files: files.map(file => ({
          path: file.filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
        })),
      };
    } catch (error) {
      throw new Error(`Failed to list PR files: ${error}`);
    }
  }
}
