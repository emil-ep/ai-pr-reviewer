# AI PR Reviewer

An **AI-agnostic** automated PR code reviewer. Choose your AI provider - Bob, ChatGPT, Claude, Grok, or easily add your own!

## Quick Setup

### 1. Add to Your Repository

Copy the workflow file to your repository:

```bash
# In your repository (e.g., xpense-tracker)
mkdir -p .github/workflows
curl -o .github/workflows/ai-pr-review.yml https://raw.githubusercontent.com/emil-ep/ai-pr-reviewer/main/.github/workflows/pr-review-external.yml
```

### 2. Choose Your AI Provider

Set the `AI_PROVIDER` environment variable to one of: `bob`, `chatgpt`, `claude`, or `grok`

### 3. Add GitHub Secrets

Go to your repository **Settings** → **Secrets and variables** → **Actions** and add the required secrets based on your chosen provider:

#### For Bob (Self-hosted)
- **Name**: `AI_PROVIDER` **Value**: `bob`
- **Name**: `BOB_API_ENDPOINT` **Value**: Your Bob Shell Wrapper service URL

#### For ChatGPT
- **Name**: `AI_PROVIDER` **Value**: `chatgpt`
- **Name**: `OPENAI_API_KEY` **Value**: Your OpenAI API key
- **Name**: `OPENAI_MODEL` **Value**: `gpt-4-turbo-preview` (optional)

#### For Claude
- **Name**: `AI_PROVIDER` **Value**: `claude`
- **Name**: `ANTHROPIC_API_KEY` **Value**: Your Anthropic API key
- **Name**: `ANTHROPIC_MODEL` **Value**: `claude-3-5-sonnet-20241022` (optional)

#### For Grok
- **Name**: `AI_PROVIDER` **Value**: `grok`
- **Name**: `GROK_API_KEY` **Value**: Your Grok API key
- **Name**: `GROK_MODEL` **Value**: `grok-beta` (optional)

### 4. Done!

That's it! Your chosen AI will now automatically review all PRs in your repository.

## How It Works

1. **Trigger**: When a PR is opened/updated or someone comments `/review`
2. **Context Gathering**: Fetches comprehensive context including:
   - Commit history (what changed and why)
   - Linked issues (business requirements)
   - Related files (test files, configs)
   - Dependency changes (security impact)
3. **Analysis**: Your chosen AI analyzes code with full context
4. **Review**: AI posts context-aware summary and inline comments

## Features

### Core Features
- ✅ **AI-Agnostic Architecture**: Choose any AI provider or add your own
- ✅ **Provider Flexibility**: Switch providers with a single environment variable
- ✅ **No Vendor Lock-in**: You control which AI you use
- ✅ Automatic PR reviews on open/update
- ✅ Manual trigger with `/review` comment
- ✅ Inline code comments with severity levels
- ✅ Summary with critical/warning/suggestion counts
- ✅ Extensible design for adding new AI providers

### 🆕 Enhanced Context System
- ✅ **Commit History Analysis**: Understands the evolution of changes
- ✅ **Linked Issue Detection**: Verifies alignment with requirements
- ✅ **Related Files Detection**: Identifies impacted test files and configs
- ✅ **Dependency Impact Analysis**: Tracks package changes and security risks
- ✅ **Context-Aware Reviews**: AI references commits, issues, and related files

[Learn more about Enhanced Context →](./ENHANCED_CONTEXT.md)

## Supported AI Providers

The tool is **AI-agnostic** and currently supports:

| Provider | Type | Setup |
|----------|------|-------|
| **Bob** | Self-hosted | Deploy your own Bob Shell Wrapper |
| **ChatGPT** | API | Add OpenAI API key |
| **Claude** | API | Add Anthropic API key |
| **Grok** | API | Add xAI API key |

**Want to add another provider?** The extensible architecture makes it easy! Just implement the `AIClient` interface and add it to the factory.

## Manual Trigger

Comment `/review` on any PR to trigger a review manually.

## Local Testing

```bash
# Clone this repo
git clone https://github.com/emil-ep/ai-pr-reviewer.git
cd ai-pr-reviewer

# Install dependencies
npm install

# Set environment variables (example for Bob)
export GITHUB_TOKEN=your_github_token
export AI_PROVIDER=bob
export BOB_API_ENDPOINT=https://your-bob-service.com
export PR_NUMBER=123
export REPO_OWNER=your-username
export REPO_NAME=your-repo

# For ChatGPT instead:
# export AI_PROVIDER=chatgpt
# export OPENAI_API_KEY=sk-your-key
# export OPENAI_MODEL=gpt-4-turbo-preview

# For Claude instead:
# export AI_PROVIDER=claude
# export ANTHROPIC_API_KEY=sk-ant-your-key
# export ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# For Grok instead:
# export AI_PROVIDER=grok
# export GROK_API_KEY=xai-your-key
# export GROK_MODEL=grok-beta

# Build and run
npm run build
node dist/index.js
```

## Project Structure

```
.
├── src/
│   ├── index.ts              # Entry point
│   ├── reviewer.ts           # Main review orchestrator
│   ├── ai/
│   │   ├── base-client.ts    # AI client interface
│   │   ├── client-factory.ts # Factory for creating AI clients
│   │   ├── bob-client.ts     # Bob API integration
│   │   ├── chatgpt-client.ts # ChatGPT integration
│   │   ├── claude-client.ts  # Claude integration
│   │   └── grok-client.ts    # Grok integration
│   ├── github/
│   │   └── client.ts         # GitHub API wrapper
│   └── utils/
│       └── logger.ts         # Logging utility
└── .github/workflows/
    └── pr-review-external.yml # GitHub Actions workflow
```

## Requirements

- Node.js 20+
- GitHub repository with Actions enabled
- API credentials for your chosen AI provider:
  - **Bob**: Bob Shell Wrapper service endpoint (free)
  - **ChatGPT**: OpenAI API key
  - **Claude**: Anthropic API key
  - **Grok**: Grok API key

## License

MIT