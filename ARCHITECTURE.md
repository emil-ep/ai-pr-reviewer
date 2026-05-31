# 🏗️ Architecture Documentation - Bob PR Reviewer

## Overview

Bob PR Reviewer is an AI-powered code review system that uses Claude (via Anthropic API) through the Model Context Protocol (MCP) to provide intelligent, context-aware PR reviews on GitHub.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         GitHub Platform                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐         ┌──────────────┐                      │
│  │  Pull Request│         │   Comment    │                      │
│  │    Event     │         │   /review    │                      │
│  └──────┬───────┘         └──────┬───────┘                      │
│         │                        │                               │
│         └────────────┬───────────┘                               │
│                      ▼                                            │
│         ┌────────────────────────┐                               │
│         │  GitHub Actions        │                               │
│         │  Workflow Runner       │                               │
│         └────────┬───────────────┘                               │
└──────────────────┼───────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Bob PR Reviewer (MCP Server)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    MCP Server Core                          │ │
│  │  - stdio transport                                          │ │
│  │  - Tool registration                                        │ │
│  │  - Request handling                                         │ │
│  └────────────────┬───────────────────────────────────────────┘ │
│                   │                                              │
│  ┌────────────────▼───────────────────────────────────────────┐ │
│  │                    MCP Tools Layer                          │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │ │
│  │  │fetch_pr_diff │  │get_file_     │  │post_review_  │    │ │
│  │  │              │  │content       │  │comment       │    │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘    │ │
│  │  ┌──────────────┐                                          │ │
│  │  │list_pr_files │                                          │ │
│  │  └──────────────┘                                          │ │
│  └────────────────┬───────────────────────────────────────────┘ │
│                   │                                              │
│  ┌────────────────▼───────────────────────────────────────────┐ │
│  │                 GitHub API Client                           │ │
│  │  - Octokit wrapper                                          │ │
│  │  - PR operations                                            │ │
│  │  - Comment posting                                          │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Anthropic Claude API                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Bob (Claude 3.5 Sonnet)                                   │ │
│  │  - Receives PR context via MCP tools                       │ │
│  │  - Analyzes code with full project understanding           │ │
│  │  - Uses tools to explore codebase                          │ │
│  │  - Generates intelligent review comments                   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. GitHub Integration Layer

**Triggers:**
- `pull_request` events: `opened`, `synchronize`, `reopened`
- `issue_comment` events: comments containing `/review`

**Workflow:** `.github/workflows/pr-review.yml`
- Checks out repository
- Sets up Node.js environment
- Installs dependencies
- Builds TypeScript code
- Runs MCP server with environment variables

### 2. MCP Server Core

**File:** `src/server.ts`

**Responsibilities:**
- Initialize MCP server with stdio transport
- Register available tools
- Handle tool execution requests
- Manage errors and logging

**Key Features:**
- Tool discovery via `ListToolsRequestSchema`
- Tool execution via `CallToolRequestSchema`
- Structured error handling
- Comprehensive logging

### 3. MCP Tools

#### `fetch_pr_diff`
**Purpose:** Fetch PR metadata and file changes

**Input:**
```typescript
{
  owner: string,
  repo: string,
  pr_number: number
}
```

**Output:**
```typescript
{
  pr: {
    number, title, description, author,
    base_branch, head_branch, head_sha
  },
  files: [
    { filename, status, additions, deletions, patch }
  ],
  stats: {
    total_files, total_additions, total_deletions
  }
}
```

#### `get_file_content`
**Purpose:** Read full file content from PR branch

**Input:**
```typescript
{
  owner: string,
  repo: string,
  path: string,
  ref: string
}
```

**Output:**
```typescript
{
  path: string,
  content: string,
  size: number,
  encoding: string
}
```

#### `post_review_comment`
**Purpose:** Post review comments (inline or general)

**Input:**
```typescript
{
  owner: string,
  repo: string,
  pr_number: number,
  body: string,
  commit_id?: string,  // for inline
  path?: string,       // for inline
  line?: number,       // for inline
  side?: 'LEFT'|'RIGHT'
}
```

#### `list_pr_files`
**Purpose:** List all changed files in PR

**Input:**
```typescript
{
  owner: string,
  repo: string,
  pr_number: number
}
```

**Output:**
```typescript
{
  files: [
    { path, status, additions, deletions }
  ]
}
```

### 4. GitHub API Client

**File:** `src/github/client.ts`

**Responsibilities:**
- Wrap Octokit REST API
- Implement PR operations
- Handle GitHub API errors
- Manage rate limiting

**Key Methods:**
- `fetchPRDiff()` - Get PR details and changes
- `getFileContent()` - Read file from repository
- `postReviewComment()` - Post comments on PR
- `listPRFiles()` - List changed files

### 5. Bob (Claude) Integration

**How Bob Reviews PRs:**

1. **Receives PR Context**
   - GitHub Actions triggers MCP server
   - MCP server connects to Claude API
   - Bob receives PR number and repository info

2. **Explores Codebase**
   ```
   Bob uses: fetch_pr_diff(owner, repo, pr_number)
   Bob sees: Changed files and diffs
   
   Bob uses: get_file_content(path, ref)
   Bob reads: Full file context
   
   Bob uses: list_pr_files(owner, repo, pr_number)
   Bob understands: Scope of changes
   ```

3. **Analyzes Code**
   - Security vulnerabilities
   - Logic errors and bugs
   - Performance issues
   - Best practices violations
   - Missing tests or documentation

4. **Generates Review**
   - Creates structured feedback
   - Identifies specific line numbers
   - Assigns severity levels
   - Provides actionable suggestions

5. **Posts Comments**
   ```
   Bob uses: post_review_comment(body, path, line)
   GitHub displays: Inline comments on PR
   ```

## Data Flow

### PR Review Flow

```
1. Developer creates/updates PR
   ↓
2. GitHub triggers workflow
   ↓
3. Workflow starts MCP server
   ↓
4. MCP server connects to Claude
   ↓
5. Bob uses fetch_pr_diff tool
   ↓
6. Bob analyzes changed files
   ↓
7. Bob uses get_file_content for context
   ↓
8. Bob generates review comments
   ↓
9. Bob uses post_review_comment tool
   ↓
10. Comments appear on GitHub PR
```

### Manual Review Flow

```
1. User comments "/review" on PR
   ↓
2. GitHub triggers issue_comment event
   ↓
3. Workflow checks for /review command
   ↓
4. [Same as steps 3-10 above]
```

## Configuration System

**File:** `.github/bob-reviewer.yml`

**Structure:**
```yaml
review:
  # Review behavior
  auto_review: boolean
  max_files: number
  ignore_patterns: string[]
  focus: string[]

bob:
  # Claude configuration
  model: string
  max_tokens: number
  temperature: number

github:
  # GitHub integration
  review_type: 'review'|'comments'
  event: 'APPROVE'|'REQUEST_CHANGES'|'COMMENT'

comments:
  # Comment settings
  min_severity: 'critical'|'warning'|'suggestion'
  max_per_file: number
```

## Security Considerations

### Secrets Management
- `GITHUB_TOKEN` - Auto-provided by GitHub Actions
- `ANTHROPIC_API_KEY` - Stored in GitHub Secrets
- Never logged or exposed in outputs

### Permissions
- **Read:** Repository contents, PR metadata
- **Write:** PR comments, review status
- **No access to:** Secrets, sensitive files

### Rate Limiting
- GitHub API: 5000 requests/hour
- Anthropic API: Based on tier
- Implemented exponential backoff

## Performance Characteristics

### Latency
- Small PR (1-5 files): 30-60 seconds
- Medium PR (6-15 files): 1-2 minutes
- Large PR (16-30 files): 2-4 minutes

### Resource Usage
- Memory: ~200MB per review
- CPU: Minimal (I/O bound)
- Network: ~1-5MB per review

### Scalability
- Concurrent reviews: Limited by GitHub Actions runners
- Cost scales linearly with PR size
- Can handle 100+ PRs/day

## Error Handling

### GitHub API Errors
- Retry with exponential backoff
- Log detailed error information
- Graceful degradation

### Claude API Errors
- Catch and log API failures
- Provide fallback responses
- Alert on repeated failures

### Configuration Errors
- Validate config on startup
- Use sensible defaults
- Warn about invalid settings

## Monitoring & Logging

### Log Levels
- **DEBUG:** Detailed execution flow
- **INFO:** Key operations and results
- **WARN:** Non-critical issues
- **ERROR:** Failures requiring attention

### Metrics Tracked
- Review execution time
- Number of files reviewed
- Comments posted
- API costs
- Error rates

## Future Enhancements

### Planned Features
1. **Multi-model support** - GPT-4, Gemini
2. **Custom rules engine** - Team-specific standards
3. **Review analytics** - Dashboard and insights
4. **Automated fixes** - Code patch suggestions
5. **GitLab/Bitbucket** - Support other platforms

### Optimization Opportunities
1. **Caching** - Cache file contents and analyses
2. **Parallel processing** - Review files concurrently
3. **Incremental reviews** - Only review changed lines
4. **Smart file selection** - Prioritize critical files

## Technology Stack

- **Language:** TypeScript
- **Runtime:** Node.js 20+
- **MCP SDK:** @modelcontextprotocol/sdk
- **GitHub API:** @octokit/rest
- **AI Model:** Claude 3.5 Sonnet (Anthropic)
- **CI/CD:** GitHub Actions

## Development Workflow

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run in development
npm run dev

# Run in production
npm start
```

## Testing Strategy

### Unit Tests
- GitHub client methods
- Tool handlers
- Configuration loader

### Integration Tests
- MCP server communication
- GitHub API interactions
- End-to-end review flow

### Manual Testing
- Create test PRs
- Verify comment placement
- Check review quality

---

**Last Updated:** 2026-05-31  
**Version:** 1.0.0