# 🤖 Bob PR Reviewer

An AI-powered GitHub Pull Request reviewer using **Bob (Claude)** via the Model Context Protocol (MCP). Bob analyzes your PRs for logic errors, security vulnerabilities, performance issues, and best practices, providing intelligent inline comments and comprehensive reviews.

## ✨ Features

- 🔍 **Deep Code Analysis** - Bob uses MCP tools to explore your entire codebase for context-aware reviews
- 🛡️ **Security Scanning** - Identifies potential security vulnerabilities and unsafe patterns
- ⚡ **Performance Insights** - Suggests optimizations and identifies bottlenecks
- 📝 **Best Practices** - Enforces coding standards and suggests improvements
- 💬 **Inline Comments** - Posts specific feedback on exact lines of code
- 🔄 **Auto & Manual Triggers** - Reviews automatically on PR creation or via `/review` command
- ⚙️ **Highly Configurable** - Customize review focus, severity levels, and more

## 🏗️ Architecture

```
GitHub PR Event → GitHub Actions → MCP Server → Bob (Claude API)
                                        ↓
                                   GitHub Tools
                                   - fetch_pr_diff
                                   - get_file_content
                                   - post_review_comment
                                   - list_pr_files
```

Bob uses MCP tools to:
1. Fetch PR changes and metadata
2. Read full file contents for context
3. Search related code across the repository
4. Analyze code with full project understanding
5. Post intelligent, actionable feedback

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- GitHub repository with Actions enabled
- Anthropic API key ([Get one here](https://console.anthropic.com/))
- GitHub Personal Access Token with `repo` and `pull_request` permissions

### Installation

1. **Clone or add to your repository:**

```bash
git clone https://github.com/yourusername/bob-pr-reviewer.git
cd bob-pr-reviewer
npm install
```

2. **Configure GitHub Secrets:**

Go to your repository → Settings → Secrets and variables → Actions, and add:

- `ANTHROPIC_API_KEY` - Your Anthropic API key
- `GITHUB_TOKEN` - Automatically provided by GitHub Actions (no need to add)

3. **Copy the workflow file:**

The `.github/workflows/pr-review.yml` file is already included. It will automatically trigger on:
- Pull request opened, synchronized, or reopened
- Comment containing `/review` on a PR

4. **Customize configuration (optional):**

Edit `.github/bob-reviewer.yml` to customize:
- File patterns to ignore
- Review focus areas
- Comment severity levels
- Maximum files/comments
- And more!

### Local Development

1. **Copy environment variables:**

```bash
cp .env.example .env
```

2. **Edit `.env` with your credentials:**

```env
GITHUB_TOKEN=ghp_your_token_here
ANTHROPIC_API_KEY=sk-ant-your_key_here
LOG_LEVEL=debug
```

3. **Build and run:**

```bash
npm run build
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

## 📖 Usage

### Automatic Reviews

Bob automatically reviews PRs when they are:
- Opened
- Updated (new commits pushed)
- Reopened

### Manual Reviews

Comment `/review` on any PR to trigger a fresh review:

```
/review
```

You can also request focused reviews:

```
/review --focus security
/review --focus performance
```

### Review Output

Bob provides:

1. **Summary Comment** - Overall assessment of the PR
2. **Inline Comments** - Specific feedback on individual lines
3. **Severity Levels**:
   - 🔴 **Critical** - Must fix (security, bugs)
   - 🟡 **Warning** - Should fix (performance, quality)
   - 🔵 **Suggestion** - Consider (improvements, style)

## ⚙️ Configuration

Edit `.github/bob-reviewer.yml` to customize Bob's behavior:

```yaml
review:
  auto_review: true
  max_files: 20
  ignore_patterns:
    - "*.md"
    - "*.lock"
  focus:
    - security
    - logic
    - performance
    - best_practices

bob:
  model: claude-3-5-sonnet-20241022
  max_tokens: 4096
  temperature: 0.3

github:
  review_type: review
  event: COMMENT
```

### Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `review.auto_review` | Auto-review on PR events | `true` |
| `review.max_files` | Max files to review | `20` |
| `review.max_file_size` | Max file size (KB) | `500` |
| `review.ignore_patterns` | Files to skip | See config |
| `review.focus` | Review aspects | All |
| `bob.model` | Claude model | `claude-3-5-sonnet-20241022` |
| `bob.temperature` | Response creativity | `0.3` |
| `comments.min_severity` | Min severity to post | `suggestion` |
| `comments.max_per_file` | Max comments per file | `10` |

## 🔧 MCP Tools

Bob uses these MCP tools for PR analysis:

### `fetch_pr_diff`
Fetches PR metadata, changed files, and diffs.

```typescript
{
  owner: "username",
  repo: "repository",
  pr_number: 123
}
```

### `get_file_content`
Retrieves full file content from a specific branch.

```typescript
{
  owner: "username",
  repo: "repository",
  path: "src/file.ts",
  ref: "feature-branch"
}
```

### `post_review_comment`
Posts inline or general comments on the PR.

```typescript
{
  owner: "username",
  repo: "repository",
  pr_number: 123,
  body: "Review comment...",
  path: "src/file.ts",  // optional for inline
  line: 45,             // optional for inline
  commit_id: "abc123"   // required for inline
}
```

### `list_pr_files`
Lists all files changed in the PR.

```typescript
{
  owner: "username",
  repo: "repository",
  pr_number: 123
}
```

## 💰 Cost Estimation

Bob uses Claude 3.5 Sonnet via Anthropic API:

| PR Size | Estimated Cost |
|---------|----------------|
| Small (1-5 files) | $0.20 - $0.50 |
| Medium (6-15 files) | $0.50 - $1.50 |
| Large (16-30 files) | $1.50 - $3.00 |

**Monthly estimate** (100 PRs): $50-150

### Cost Optimization

- Set `max_files` to limit files reviewed
- Use `ignore_patterns` to skip non-code files
- Adjust `max_file_size` to skip large files
- Set `min_severity` to reduce comment volume

## 🛠️ Development

### Project Structure

```
bob-pr-reviewer/
├── src/
│   ├── index.ts           # Entry point
│   ├── server.ts          # MCP server implementation
│   ├── github/
│   │   └── client.ts      # GitHub API wrapper
│   ├── utils/
│   │   └── logger.ts      # Logging utilities
│   └── config/
│       └── loader.ts      # Config file loader
├── .github/
│   ├── workflows/
│   │   └── pr-review.yml  # GitHub Actions workflow
│   └── bob-reviewer.yml   # Configuration file
├── package.json
├── tsconfig.json
└── README.md
```

### Building

```bash
npm run build
```

### Testing Locally

```bash
# Set environment variables
export GITHUB_TOKEN=your_token
export ANTHROPIC_API_KEY=your_key

# Run the MCP server
npm run dev
```

### Adding New Tools

1. Add tool definition in `src/server.ts` (`ListToolsRequestSchema` handler)
2. Implement tool handler in `src/server.ts` (`CallToolRequestSchema` handler)
3. Add corresponding method in `src/github/client.ts` if needed

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details

## 🙏 Acknowledgments

- Built with [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
- Powered by [Anthropic Claude](https://www.anthropic.com/)
- GitHub integration via [Octokit](https://github.com/octokit/rest.js)

## 📞 Support

- 🐛 [Report Issues](https://github.com/yourusername/bob-pr-reviewer/issues)
- 💬 [Discussions](https://github.com/yourusername/bob-pr-reviewer/discussions)
- 📧 Email: your.email@example.com

## 🔮 Roadmap

- [ ] Support for multiple AI models (GPT-4, Gemini)
- [ ] Custom rule engine for team-specific standards
- [ ] Integration with CI/CD pipelines
- [ ] Review history and analytics dashboard
- [ ] Support for GitLab and Bitbucket
- [ ] Automated fix suggestions with code patches

---

**Made with ❤️ by developers, for developers**