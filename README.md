# Bob PR Reviewer

Automated PR code reviews using Bob AI - completely free, no API keys required!

## Quick Setup

### 1. Add to Your Repository

Copy the workflow file to your repository:

```bash
# In your repository (e.g., xpense-tracker)
mkdir -p .github/workflows
curl -o .github/workflows/bob-pr-review.yml https://raw.githubusercontent.com/emil-ep/pr-reviewer/main/.github/workflows/pr-review-external.yml
```

### 2. Add GitHub Secret

1. Go to your repository **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Add:
   - **Name**: `BOB_API_ENDPOINT`
   - **Value**: Your Bob service URL (e.g., `https://your-bob-service.com`)

### 3. Done!

That's it! Bob will now automatically review all PRs in your repository.

## How It Works

1. **Trigger**: When a PR is opened/updated or someone comments `/review`
2. **Analysis**: Bob fetches the PR diff and analyzes the code changes
3. **Review**: Bob posts a summary and inline comments on the PR

## Features

- ✅ Automatic PR reviews on open/update
- ✅ Manual trigger with `/review` comment
- ✅ Inline code comments with severity levels
- ✅ Summary with critical/warning/suggestion counts
- ✅ Free - no API costs!

## Manual Trigger

Comment `/review` on any PR to trigger a review manually.

## Local Testing

```bash
# Clone this repo
git clone https://github.com/emil-ep/pr-reviewer.git
cd pr-reviewer

# Install dependencies
npm install

# Set environment variables
export GITHUB_TOKEN=your_github_token
export BOB_API_ENDPOINT=https://your-bob-service.com
export PR_NUMBER=123
export REPO_OWNER=your-username
export REPO_NAME=your-repo

# Build and run
npm run build
node dist/index.js
```

## Project Structure

```
.
├── src/
│   ├── index.ts           # Entry point
│   ├── reviewer.ts        # Main review orchestrator
│   ├── ai/
│   │   └── bob-client.ts  # Bob API integration
│   ├── github/
│   │   └── client.ts      # GitHub API wrapper
│   └── utils/
│       └── logger.ts      # Logging utility
└── .github/workflows/
    └── pr-review-external.yml  # GitHub Actions workflow
```

## Requirements

- Node.js 20+
- GitHub repository with Actions enabled
- Bob Shell Wrapper service endpoint

## License

MIT

---

Made with ❤️ using Bob AI