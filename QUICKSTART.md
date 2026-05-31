# 🚀 Quick Start - Deploy to Your Personal GitHub

This guide will help you deploy Bob PR Reviewer to your personal GitHub account (https://github.com/emil-ep/) to test it before rolling out to Instana organization.

## Prerequisites

✅ GitHub account: https://github.com/emil-ep/  
✅ Anthropic API key ([Get one here](https://console.anthropic.com/))  
✅ A test repository to try it on

## Option 1: Test in a Single Repository (Recommended First)

This is the **fastest way** to see Bob in action!

### Step 1: Choose a Test Repository

Pick any repository under your account, for example:
- Create a new test repo: `bob-pr-reviewer-test`
- Or use an existing repo

### Step 2: Add GitHub Secret

1. Go to your repository on GitHub
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add:
   - Name: `ANTHROPIC_API_KEY`
   - Value: Your Anthropic API key (starts with `sk-ant-`)
5. Click **Add secret**

### Step 3: Add Workflow File

Copy the workflow file to your test repository:

```bash
# In your test repository
mkdir -p .github/workflows
cp /path/to/Bob-PR-reviewer/.github/workflows/pr-review.yml .github/workflows/
cp /path/to/Bob-PR-reviewer/.github/bob-reviewer.yml .github/
```

Or create them manually:

**`.github/workflows/pr-review.yml`:**
```yaml
name: Bob PR Review

on:
  pull_request:
    types: [opened, synchronize, reopened]
  issue_comment:
    types: [created]

jobs:
  review:
    runs-on: ubuntu-latest
    if: |
      github.event_name == 'pull_request' ||
      (github.event_name == 'issue_comment' && 
       github.event.issue.pull_request &&
       contains(github.event.comment.body, '/review'))
    
    permissions:
      contents: read
      pull-requests: write
      issues: write
    
    steps:
      - name: Checkout Bob PR Reviewer
        uses: actions/checkout@v4
        with:
          repository: emil-ep/Bob-PR-reviewer
          path: bob-reviewer
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        working-directory: bob-reviewer
        run: npm ci
      
      - name: Build
        working-directory: bob-reviewer
        run: npm run build
      
      - name: Run Bob PR Review
        working-directory: bob-reviewer
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: node dist/index.js
```

**`.github/bob-reviewer.yml`:**
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
```

### Step 4: Commit and Push

```bash
git add .github/
git commit -m "Add Bob PR Reviewer"
git push origin main
```

### Step 5: Test It!

Create a test PR:

```bash
# Create a new branch
git checkout -b test-bob-review

# Make a simple change
echo "console.log('test');" > test.js
git add test.js
git commit -m "Test Bob reviewer"
git push origin test-bob-review
```

Then:
1. Go to GitHub and create a PR from `test-bob-review` to `main`
2. Wait 1-2 minutes
3. Bob will automatically review your PR! 🎉

## Option 2: Deploy as Reusable Workflow (Multiple Repos)

If you want to use Bob across multiple repositories in your account:

### Step 1: Create Central Repository

1. Push this Bob-PR-reviewer code to your GitHub:

```bash
cd /Users/emil/Documents/hobby-projects/Bob-PR-reviewer
git init
git add .
git commit -m "Initial commit: Bob PR Reviewer"
git remote add origin https://github.com/emil-ep/Bob-PR-reviewer.git
git push -u origin main
```

2. Make the repository public (or keep private if you have GitHub Pro)

### Step 2: Add Secret to Account

Add `ANTHROPIC_API_KEY` at the account level:

1. Go to https://github.com/settings/secrets/actions
2. Click **New repository secret**
3. Add your Anthropic API key

### Step 3: Use in Any Repository

In any repository where you want Bob to review PRs, add this workflow:

**`.github/workflows/bob-review.yml`:**
```yaml
name: Bob PR Review

on:
  pull_request:
    types: [opened, synchronize, reopened]
  issue_comment:
    types: [created]

jobs:
  review:
    uses: emil-ep/Bob-PR-reviewer/.github/workflows/pr-review.yml@main
    secrets:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

That's it! Now Bob will review PRs in that repository.

## Option 3: GitHub App (For Organization-Wide Later)

Once you've tested and are happy with Bob, you can create a GitHub App for organization-wide deployment. See `ORGANIZATION_DEPLOYMENT.md` for details.

## Troubleshooting

### Bob Doesn't Review

**Check GitHub Actions:**
1. Go to your repository
2. Click **Actions** tab
3. Look for the workflow run
4. Check logs for errors

**Common Issues:**

❌ **Missing ANTHROPIC_API_KEY**
```
Solution: Add it to repository secrets
```

❌ **Workflow not triggered**
```
Solution: Check .github/workflows/pr-review.yml exists
```

❌ **Permission denied**
```
Solution: Go to Settings → Actions → General
Enable: "Read and write permissions"
```

### Bob Posts No Comments

**Check Configuration:**
1. Look at `.github/bob-reviewer.yml`
2. Check `min_severity` setting
3. Try setting it to `suggestion` to see all comments

### Review Takes Too Long

**Optimize:**
1. Reduce `max_files` in config
2. Add more patterns to `ignore_patterns`
3. Reduce file size with `max_file_size`

## What to Expect

### First PR Review

When you create your first test PR:

1. **GitHub Actions starts** (10-20 seconds)
2. **Bob analyzes code** (30-60 seconds)
3. **Comments appear** on your PR

### Example Review

Bob will post comments like:

```
💬 Bob PR Reviewer commented

## Review Summary
I've reviewed your changes. Here's what I found:

📁 test.js
Line 1: 🔵 SUGGESTION
  Consider adding error handling around console.log
  
Overall: Changes look good! Minor suggestions for improvement.
```

## Next Steps

After testing in your personal repo:

1. ✅ **Verify Bob works** - Check review quality
2. ✅ **Adjust configuration** - Tune settings in bob-reviewer.yml
3. ✅ **Test with real code** - Try on actual PRs
4. ✅ **Monitor costs** - Check Anthropic usage
5. ✅ **Scale to Instana** - Deploy organization-wide

## Cost Tracking

Monitor your usage:
1. Go to https://console.anthropic.com/
2. Check **Usage** tab
3. See costs per review

Typical costs:
- Small PR: $0.20-0.50
- Medium PR: $0.50-1.50
- Large PR: $1.50-3.00

## Getting Help

If you run into issues:

1. Check the **Actions** tab for error logs
2. Review `DEPLOYMENT.md` for detailed setup
3. Check `HOW_IT_WORKS.md` to understand the flow
4. Look at `ARCHITECTURE.md` for technical details

## Ready to Deploy to Instana?

Once you're happy with Bob's performance:

1. Follow `ORGANIZATION_DEPLOYMENT.md`
2. Create GitHub App for Instana org
3. Deploy webhook server
4. Install across all repositories

---

**Let's get Bob reviewing your code! 🚀**