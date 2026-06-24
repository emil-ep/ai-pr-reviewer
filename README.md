# AI PR Reviewer

An **AI-agnostic** automated PR assistant. Choose your AI provider - Bob, ChatGPT, Claude, Grok, or easily add your own!

## Quick Setup

### 1. Add to Your Repository

Copy the workflow file to your repository:

```bash
# In your repository (e.g., xpense-tracker)
mkdir -p .github/workflows
curl -o .github/workflows/ai-pr-assistant.yml https://raw.githubusercontent.com/emil-ep/ai-pr-reviewer/main/.github/workflows/pr-review-external.yml
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

That's it! Your AI assistant will now:
- ✅ **Auto-generate PR descriptions** when you create a PR (if description is empty)
- ✅ **Review code** when you comment `/review` on a PR

## How It Works

### Automatic PR Description Generation

When you create a new PR **without a description**, the AI automatically:

1. **Analyzes Context**: Fetches comprehensive context including:
   - Commit history (what changed and why)
   - Linked issues (business requirements)
   - Related files (test files, configs)
   - Dependency changes (security impact)

2. **Generates Description**: Creates an industry-standard PR description with:
   - Summary of changes
   - Detailed change list
   - Impact analysis
   - Testing information
   - Related issues

3. **Updates PR**: Automatically updates the PR with the generated description

**You can edit the description** if you want to make changes!

### Manual Code Review

Comment `/review` on any PR to trigger a comprehensive code review. The AI will:

1. **Analyze Changes**: Reviews all modified files
2. **Find Issues**: Identifies bugs, security vulnerabilities, performance issues
3. **Post Comments**: Adds inline comments and a summary

## Features

### Core Features
- ✅ **AI-Agnostic Architecture**: Choose any AI provider or add your own
- ✅ **Provider Flexibility**: Switch providers with a single environment variable
- ✅ **No Vendor Lock-in**: You control which AI you use
- ✅ **Auto PR Descriptions**: Generates descriptions when PR is created (if empty)
- ✅ **Manual Code Review**: Trigger with `/review` comment
- ✅ **Inline code comments** with severity levels
- ✅ **Summary** with critical/warning/suggestion counts
- ✅ **Extensible design** for adding new AI providers

### 🆕 Enhanced Context System
- ✅ **Commit History Analysis**: Understands the evolution of changes
- ✅ **Linked Issue Detection**: Verifies alignment with requirements
- ✅ **Related Files Detection**: Identifies impacted test files and configs
- ✅ **Dependency Impact Analysis**: Tracks package changes and security risks
- ✅ **Context-Aware Reviews**: AI references commits, issues, and related files

[Learn more about Enhanced Context →](./ENHANCED_CONTEXT.md)

### 🆕 Auto PR Description Generation
- ✅ **Automatic PR Descriptions**: AI generates comprehensive descriptions when PRs are created
- ✅ **Industry Standards**: Follows Conventional Commits and GitHub PR templates
- ✅ **AI Transparency**: Clearly marks AI-generated content
- ✅ **Context-Aware**: Analyzes commits, issues, files, and dependencies
- ✅ **Editable**: You can modify the generated description

[Learn more about Auto PR Descriptions →](./AUTO_PR_DESCRIPTION.md)

## Supported AI Providers

The tool is **AI-agnostic** and currently supports:

| Provider | Type | Setup |
|----------|------|-------|
| **Bob** | Self-hosted | Deploy your own Bob Shell Wrapper |
| **ChatGPT** | API | Add OpenAI API key |
| **Claude** | API | Add Anthropic API key |
| **Grok** | API | Add xAI API key |

**Want to add another provider?** The extensible architecture makes it easy! Just implement the `AIClient` interface and add it to the factory.

## Usage

### Auto PR Description (Automatic)

Simply create a PR without a description:

```bash
git checkout -b feature/new-feature
# Make changes
git commit -m "feat: add new feature"
git push origin feature/new-feature
# Create PR without description - AI generates it automatically!
```

### Code Review (Manual)

Comment `/review` on any PR to trigger a review:

```
/review
```

The AI will analyze the code and post:
- Summary with issue counts
- Inline comments on specific lines
- Suggestions for improvements

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

# For PR description generation
node dist/generate-description.js

# For PR review
node dist/index.js
```

## Project Structure

```
.
├── src/
│   ├── index.ts                    # Entry point for PR review
│   ├── generate-description.ts     # Entry point for description generation
│   ├── reviewer.ts                 # Main review orchestrator
│   ├── ai/
│   │   ├── base-client.ts          # AI client interface
│   │   ├── client-factory.ts       # Factory for creating AI clients
│   │   ├── bob-client.ts           # Bob API integration
│   │   ├── chatgpt-client.ts       # ChatGPT integration
│   │   ├── claude-client.ts        # Claude integration
│   │   └── grok-client.ts          # Grok integration
│   ├── github/
│   │   ├── client.ts               # GitHub API wrapper
│   │   └── context-builder.ts      # PR context builder
│   ├── services/
│   │   └── pr-description-generator.ts  # Description generation service
│   └── utils/
│       └── logger.ts               # Logging utility
└── .github/workflows/
    └── pr-review-external.yml      # Unified GitHub Actions workflow
```
## 🎯 Bonus: AI Commit Message Suggester

Get AI-generated commit messages automatically when you run `git commit` in **any repository**!

### Quick Setup

```bash
# 1. Build and setup
npm run build
./install-git-hook.sh --setup

# 2. Configure (add to ~/.bashrc or ~/.zshrc)
export AI_PROVIDER="chatgpt"
export OPENAI_API_KEY="sk-your-key-here"

# 3. Install globally
./install-git-hook.sh --global

# 4. Use in any repo
cd /path/to/any/repo
git commit  # AI suggestions appear automatically!
```

### Commands

```bash
# Install hook globally (all repos)
./install-git-hook.sh --global

# Install in current repo only
./install-git-hook.sh --local

# Uninstall
./install-git-hook.sh --uninstall-global
```

### How It Works

When you run `git commit`, the hook:
1. Analyzes your staged changes (token-optimized)
2. Generates 3 commit message suggestions using AI
3. Shows them as comments in your editor
4. You uncomment one or write your own

**Example:**
```
# 🤖 AI-Generated Commit Message Suggestions
# 
# 1. feat(auth): add OAuth 2.0 authentication
#    Confidence: high
#
# 2. feat(auth): implement OAuth authentication flow
#    Confidence: medium
```


## Requirements

- Node.js 18+
- GitHub repository with Actions enabled
- API credentials for your chosen AI provider:
  - **Bob**: Bob Shell Wrapper service endpoint (free)
  - **ChatGPT**: OpenAI API key
  - **Claude**: Anthropic API key
  - **Grok**: Grok API key

## License

MIT