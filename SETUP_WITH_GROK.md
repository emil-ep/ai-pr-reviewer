# 🚀 Setup Guide - Grok PR Reviewer with GitHub Secrets

## Overview

This guide shows you how to set up the PR reviewer using **Grok AI** (xAI) with **GitHub Secrets** (no keys committed to code).

## What You'll Need

1. ✅ GitHub account (https://github.com/emil-ep/)
2. ✅ Grok API key from https://console.x.ai/
3. ✅ A test repository

## Step-by-Step Setup

### Step 1: Get Your Grok API Key

1. Go to https://console.x.ai/
2. Sign in with your account
3. Navigate to API Keys section
4. Create a new API key
5. Copy the key (starts with `xai-`)
6. **Keep it safe - you'll add it to GitHub Secrets**

### Step 2: Push This Code to GitHub

```bash
cd /Users/emil/Documents/hobby-projects/Bob-PR-reviewer

# Initialize git if not already done
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit: Grok PR Reviewer"

# Add your GitHub repository as remote
git remote add origin https://github.com/emil-ep/grok-pr-reviewer.git

# Push to GitHub
git push -u origin main
```

### Step 3: Add GitHub Secret (IMPORTANT!)

This is how you use your API key **without committing it**:

1. Go to your repository on GitHub:
   `https://github.com/emil-ep/grok-pr-reviewer`

2. Click **Settings** (top menu)

3. In left sidebar: **Secrets and variables** → **Actions**

4. Click **New repository secret**

5. Add your Grok API key:
   ```
   Name: GROK_API_KEY
   Value: xai-your-actual-api-key-here
   ```

6. Click **Add secret**

**✅ Your API key is now secure and will never be in your code!**

### Step 4: Test in a Repository

Now let's test it in any repository:

#### Option A: Test in the Same Repository

1. Create a test branch:
   ```bash
   git checkout -b test-grok-review
   ```

2. Make a simple change:
   ```bash
   echo "console.log('test');" > test.js
   git add test.js
   git commit -m "Test Grok reviewer"
   git push origin test-grok-review
   ```

3. Create a PR on GitHub from `test-grok-review` to `main`

4. Wait 1-2 minutes - Grok will review it! 🎉

#### Option B: Test in Another Repository

1. In your test repository, create `.github/workflows/grok-review.yml`:

```yaml
name: Grok PR Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    
    steps:
      - name: Checkout Grok PR Reviewer
        uses: actions/checkout@v4
        with:
          repository: emil-ep/grok-pr-reviewer
          path: grok-reviewer
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        working-directory: grok-reviewer
        run: npm ci
      
      - name: Build
        working-directory: grok-reviewer
        run: npm run build
      
      - name: Run Grok PR Review
        working-directory: grok-reviewer
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GROK_API_KEY: ${{ secrets.GROK_API_KEY }}
          PR_NUMBER: ${{ github.event.pull_request.number }}
          REPO_OWNER: ${{ github.repository_owner }}
          REPO_NAME: ${{ github.event.repository.name }}
        run: node dist/index.js
```

2. Add `GROK_API_KEY` secret to that repository too

3. Create a test PR - Grok will review it!

## How GitHub Secrets Work

```
┌─────────────────────────────────────┐
│   Your Repository on GitHub         │
│                                     │
│   Settings → Secrets                │
│   ┌─────────────────────────────┐   │
│   │  GROK_API_KEY (encrypted)   │   │
│   │  Value: xai-abc123...       │   │
│   └─────────────────────────────┘   │
└──────────────┬──────────────────────┘
               │
               │ When PR is created
               ▼
┌─────────────────────────────────────┐
│   GitHub Actions Workflow           │
│                                     │
│   env:                              │
│     GROK_API_KEY: ${{ secrets... }} │
│                                     │
│   ↓ Injects as environment variable │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   Your Code (src/index.ts)          │
│                                     │
│   const key = process.env.GROK_...  │
│   ✅ Key is available               │
│   ❌ Never in git history           │
└─────────────────────────────────────┘
```

## What Happens When You Create a PR

1. **Developer creates PR** → GitHub detects it
2. **Workflow triggers** → GitHub Actions starts
3. **Code is checked out** → Your reviewer code is downloaded
4. **Dependencies installed** → `npm ci`
5. **Code is built** → `npm run build`
6. **Secrets injected** → `GROK_API_KEY` becomes available
7. **Reviewer runs** → Fetches PR, sends to Grok, posts comments
8. **Review appears** → Comments show up on your PR!

**Total time: 1-2 minutes**

## Example Review Output

Grok will post comments like:

```
🤖 Grok PR Review

This PR adds a new authentication feature. Overall structure looks good.

### Summary
- 🔴 Critical: 1
- 🟡 Warnings: 2
- 🔵 Suggestions: 3

⚠️ Please address critical issues before merging.

---

📁 src/auth.ts
Line 45: 🔴 CRITICAL
SQL injection vulnerability detected. User input is not sanitized.
Recommendation: Use parameterized queries.

Line 67: 🟡 WARNING
Missing error handling for authentication failures.

Line 89: 🔵 SUGGESTION
Consider using async/await for better readability.
```

## Troubleshooting

### "GROK_API_KEY not found"

**Solution:** Add the secret to repository settings
1. Go to Settings → Secrets and variables → Actions
2. Add `GROK_API_KEY` with your actual key

### "Permission denied"

**Solution:** Enable write permissions
1. Go to Settings → Actions → General
2. Workflow permissions → Select "Read and write permissions"
3. Save

### "Workflow not running"

**Solution:** Check workflow file
1. Ensure `.github/workflows/grok-review.yml` exists
2. Check the file is valid YAML
3. Look at Actions tab for errors

### "Review takes too long"

**Solution:** Optimize configuration
1. Edit `.github/bob-reviewer.yml`
2. Reduce `max_files` to 10
3. Add more patterns to `ignore_patterns`

## Cost Estimation

Grok API pricing (as of 2024):
- Input: ~$5 per 1M tokens
- Output: ~$15 per 1M tokens

**Typical PR review:**
- Small PR (1-5 files): $0.10-0.30
- Medium PR (6-15 files): $0.30-1.00
- Large PR (16-30 files): $1.00-2.50

**Monthly estimate (100 PRs):** ~$30-100

## Security Best Practices

✅ **DO:**
- Store API keys in GitHub Secrets
- Use `${{ secrets.NAME }}` in workflows
- Rotate keys regularly
- Monitor usage in Grok console

❌ **DON'T:**
- Commit `.env` files with real keys
- Put keys directly in workflow files
- Share secrets publicly
- Log secret values

## Next Steps

After successful testing:

1. ✅ **Verify it works** - Check review quality
2. ✅ **Adjust configuration** - Tune settings
3. ✅ **Deploy to more repos** - Add workflow to other projects
4. ✅ **Scale to organization** - Use for Instana (see ORGANIZATION_DEPLOYMENT.md)

## Getting Help

- 📖 Read `GITHUB_SECRETS_GUIDE.md` for more on secrets
- 📖 Read `HOW_IT_WORKS.md` to understand the system
- 🐛 Check Actions tab for error logs
- 💬 Check Grok console for API issues

---

**Your API key is safe! It's encrypted in GitHub and never appears in your code.** 🔒