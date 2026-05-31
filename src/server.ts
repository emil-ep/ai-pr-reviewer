import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { GitHubClient } from './github/client.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { logger } from './utils/logger.js';

export class PRReviewerServer {
  private server: Server;
  private githubClient: GitHubClient;

  constructor(githubToken: string) {
    this.githubClient = new GitHubClient(githubToken);

    this.server = new Server(
      {
        name: 'bob-pr-reviewer',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    logger.info('PR Reviewer MCP Server initialized');
  }

  private setupToolHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [
        {
          name: 'fetch_pr_diff',
          description: 'Fetch PR diff, metadata, and changed files from GitHub',
          inputSchema: {
            type: 'object',
            properties: {
              owner: {
                type: 'string',
                description: 'Repository owner (username or organization)',
              },
              repo: {
                type: 'string',
                description: 'Repository name',
              },
              pr_number: {
                type: 'number',
                description: 'Pull request number',
              },
            },
            required: ['owner', 'repo', 'pr_number'],
          },
        },
        {
          name: 'get_file_content',
          description: 'Get full file content from a specific branch or commit',
          inputSchema: {
            type: 'object',
            properties: {
              owner: {
                type: 'string',
                description: 'Repository owner',
              },
              repo: {
                type: 'string',
                description: 'Repository name',
              },
              path: {
                type: 'string',
                description: 'File path in the repository',
              },
              ref: {
                type: 'string',
                description: 'Branch name, tag, or commit SHA',
              },
            },
            required: ['owner', 'repo', 'path', 'ref'],
          },
        },
        {
          name: 'post_review_comment',
          description: 'Post a review comment on a pull request (inline or general)',
          inputSchema: {
            type: 'object',
            properties: {
              owner: {
                type: 'string',
                description: 'Repository owner',
              },
              repo: {
                type: 'string',
                description: 'Repository name',
              },
              pr_number: {
                type: 'number',
                description: 'Pull request number',
              },
              body: {
                type: 'string',
                description: 'Comment body (supports Markdown)',
              },
              commit_id: {
                type: 'string',
                description: 'Commit SHA (required for inline comments)',
              },
              path: {
                type: 'string',
                description: 'File path (for inline comments)',
              },
              line: {
                type: 'number',
                description: 'Line number (for inline comments)',
              },
              side: {
                type: 'string',
                enum: ['LEFT', 'RIGHT'],
                description: 'Side of diff (LEFT for old, RIGHT for new)',
              },
            },
            required: ['owner', 'repo', 'pr_number', 'body'],
          },
        },
        {
          name: 'list_pr_files',
          description: 'List all files changed in a pull request',
          inputSchema: {
            type: 'object',
            properties: {
              owner: {
                type: 'string',
                description: 'Repository owner',
              },
              repo: {
                type: 'string',
                description: 'Repository name',
              },
              pr_number: {
                type: 'number',
                description: 'Pull request number',
              },
            },
            required: ['owner', 'repo', 'pr_number'],
          },
        },
      ];

      return { tools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        logger.info(`Executing tool: ${name}`, args);

        switch (name) {
          case 'fetch_pr_diff':
            return await this.handleFetchPRDiff(args);

          case 'get_file_content':
            return await this.handleGetFileContent(args);

          case 'post_review_comment':
            return await this.handlePostReviewComment(args);

          case 'list_pr_files':
            return await this.handleListPRFiles(args);

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        logger.error(`Tool execution failed: ${name}`, error);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private async handleFetchPRDiff(args: any) {
    const { owner, repo, pr_number } = args;
    const result = await this.githubClient.fetchPRDiff(owner, repo, pr_number);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  private async handleGetFileContent(args: any) {
    const { owner, repo, path, ref } = args;
    const result = await this.githubClient.getFileContent(owner, repo, path, ref);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  private async handlePostReviewComment(args: any) {
    const { owner, repo, pr_number, body, commit_id, path, line, side } = args;
    await this.githubClient.postReviewComment(
      owner,
      repo,
      pr_number,
      body,
      commit_id,
      path,
      line,
      side
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: true, message: 'Comment posted successfully' }),
        },
      ],
    };
  }

  private async handleListPRFiles(args: any) {
    const { owner, repo, pr_number } = args;
    const result = await this.githubClient.listPRFiles(owner, repo, pr_number);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('MCP Server started and listening on stdio');
  }
}

// Made with Bob
