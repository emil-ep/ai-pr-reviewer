# AI PR Reviewer

Automated PR code reviews using multiple AI providers - Bob, ChatGPT, Claude, or Grok!

## Quick Setup

### 1. Add to Your Repository

Copy the workflow file to your repository:

```bash
# In your repository (e.g., xpense-tracker)
mkdir -p .github/workflows
curl -o .github/workflows/ai-pr-review.yml https://raw.githubusercontent.com/emil-ep/pr-reviewer/main/.github/workflows/pr-review-external.yml
```

### 2. Choose Your AI Provider

Set the `AI_PROVIDER` environment variable to one of: `bob`, `chatgpt`, `claude`, or `grok`

### 3. Add GitHub Secrets

Go to your repository **Settings** → **Secrets and variables** → **Actions** and add the required secrets based on your chosen provider:

#### For Bob (Free, no API key required)
- **Name**: `AI_PROVIDER` **Value**: `bob`
- **Name**: `BOB_API_ENDPOINT` **Value**: Your Bob service URL

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
2. **Analysis**: Your chosen AI fetches the PR diff and analyzes the code changes
3. **Review**: AI posts a summary and inline comments on the PR

## Features

- ✅ **Multiple AI Providers**: Choose between Bob, ChatGPT, Claude, or Grok
- ✅ Automatic PR reviews on open/update
- ✅ Manual trigger with `/review` comment
- ✅ Inline code comments with severity levels
- ✅ Summary with critical/warning/suggestion counts
- ✅ Bob option is completely free - no API costs!

## AI Provider Comparison

| Provider | Cost | Strengths |
|----------|------|-----------|
| **Bob** | Free | No API key needed, good for basic reviews |
| **ChatGPT** | Paid | Fast, excellent code understanding |
| **Claude** | Paid | Deep analysis, great for complex code |
| **Grok** | Paid | Real-time knowledge, modern approach |

## Manual Trigger

Comment `/review` on any PR to trigger a review manually.

## Local Testing

```bash
# Clone this repo
git clone https://github.com/emil-ep/pr-reviewer.git
cd pr-reviewer

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