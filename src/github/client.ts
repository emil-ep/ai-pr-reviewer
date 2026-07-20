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

/** A single existing review thread on a PR (inline comment or general comment). */
export interface ExistingReviewComment {
  id: number;
  path: string;
  line: number | null;
  body: string;
  /** true when the thread has been resolved (dismissed/resolved in the UI). */
  resolved: boolean;
  /** The bot comment marker so we can identify our own prior comments. */
  isBotComment: boolean;
}

/** Summary of a previous bot review round. */
export interface PreviousBotReview {
  id: number;
  submittedAt: string;
  state: string; // APPROVED | CHANGES_REQUESTED | COMMENTED
  body: string;
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

  /**
   * Fetch all existing inline review comments on a PR.
   * GitHub does not expose a "resolved" flag on review comments directly via REST,
   * but we can approximate by checking if the thread has a reply that acknowledges
   * it or if the comment body contains a resolved marker we write.
   * We use the GraphQL API for the authoritative resolved state.
   */
  async fetchExistingReviewComments(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<ExistingReviewComment[]> {
    try {
      // Use GraphQL to get threads with resolved state
      const query = `
        query($owner: String!, $repo: String!, $prNumber: Int!) {
          repository(owner: $owner, name: $repo) {
            pullRequest(number: $prNumber) {
              reviewThreads(first: 100) {
                nodes {
                  isResolved
                  comments(first: 10) {
                    nodes {
                      databaseId
                      path
                      line
                      body
                      author { login }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const result = await this.octokit.graphql<{
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: Array<{
                isResolved: boolean;
                comments: {
                  nodes: Array<{
                    databaseId: number;
                    path: string;
                    line: number | null;
                    body: string;
                    author: { login: string };
                  }>;
                };
              }>;
            };
          };
        };
      }>(query, { owner, repo, prNumber });

      const comments: ExistingReviewComment[] = [];
      const threads = result.repository.pullRequest.reviewThreads.nodes;

      for (const thread of threads) {
        for (const c of thread.comments.nodes) {
          comments.push({
            id: c.databaseId,
            path: c.path,
            line: c.line,
            body: c.body,
            resolved: thread.isResolved,
            isBotComment: c.body.includes('<!-- bob-pr-review -->'),
          });
        }
      }

      return comments;
    } catch (error) {
      // GraphQL may fail if token lacks sufficient scope — fall back gracefully
      return [];
    }
  }

  /**
   * Fetch previous bot review submissions on a PR (Reviews API, not comments).
   */
  async fetchPreviousBotReviews(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<PreviousBotReview[]> {
    try {
      const { data: reviews } = await this.octokit.pulls.listReviews({
        owner,
        repo,
        pull_number: prNumber,
      });

      return reviews
        .filter((r) => r.body?.includes('<!-- bob-pr-review -->'))
        .map((r) => ({
          id: r.id,
          submittedAt: r.submitted_at || '',
          state: r.state,
          body: r.body || '',
        }));
    } catch (error) {
      return [];
    }
  }

  /**
   * Submit a full GitHub review (atomic — all inline comments + verdict in one API call).
   * This is the correct way to post a code review; it appears as a single review event
   * in the PR timeline and allows REQUEST_CHANGES / APPROVE verdicts.
   */
  async submitReview(
    owner: string,
    repo: string,
    prNumber: number,
    commitId: string,
    event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
    body: string,
    comments: Array<{
      path: string;
      line: number;
      side?: 'LEFT' | 'RIGHT';
      body: string;
    }>
  ): Promise<void> {
    try {
      await this.octokit.pulls.createReview({
        owner,
        repo,
        pull_number: prNumber,
        commit_id: commitId,
        event,
        body,
        comments: comments.map((c) => ({
          path: c.path,
          line: c.line,
          side: c.side ?? 'RIGHT',
          body: c.body,
        })),
      });
    } catch (error) {
      throw new Error(`Failed to submit review: ${error}`);
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
