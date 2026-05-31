# 🚀 Deployment Guide - Bob PR Reviewer

This guide covers deploying Bob PR Reviewer to your GitHub repository.

## Prerequisites

✅ Node.js 20+ installed  
✅ GitHub repository with Actions enabled  
✅ Anthropic API key ([Get one](https://console.anthropic.com/))  
✅ GitHub account with repository admin access

## Step-by-Step Deployment

### 1. Add Bob to Your Repository

**Option A: As a Submodule (Recommended)**

```bash
cd your-repository
git submodule add https://github.com/yourusername/bob-pr-reviewer.git .github/bob-pr-reviewer
cd .github/bob-pr-reviewer
npm install
npm run build
```

**Option B: Copy Files Directly**

```bash
# Copy the necessary files to your repository
cp -r bob-pr-reviewer/.github/workflows/pr-review.yml your-repo/.github/workflows/
cp -r bob-pr-reviewer/.github/bob-reviewer.yml your-repo/.github/
```

### 2. Configure GitHub Secrets

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add the following secrets:

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Your Anthropic API key |

**Note:** `GITHUB_TOKEN` is automatically provided by GitHub Actions.

### 3. Customize Configuration (Optional)

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
```

See [Configuration Options](#configuration-options) below for details.

### 4. Enable GitHub Actions

1. Go to **Settings** → **Actions** → **General**
2. Under **Actions permissions**, select:
   - ✅ Allow all actions and reusable workflows
3. Under **Workflow permissions**, select:
   - ✅ Read and write permissions
   - ✅ Allow GitHub Actions to create and approve pull requests

### 5. Test the Setup

Create a test PR to verify Bob is working:

```bash
git checkout -b test-bob-review
echo "console.log('test');" > test.js
git add test.js
git commit -m "Test Bob PR reviewer"
git push origin test-bob-review
```

Then create a PR on GitHub. Bob should automatically review it within 1-2 minutes.

## Configuration Options

### Review Settings

```yaml
review:
  # Auto-review on PR events
  auto_review: true
  
  # Maximum files to review (cost control)
  max_files: 20
  
  # Maximum file size in KB
  max_file_size: 500
  
  # File patterns to ignore
  ignore_patterns:
    - "*.md"
    - "*.json"
    - "*.lock"
    - "dist/**"
    - "build/**"
  
  # Languages to review (empty = all)
  languages:
    - javascript
    - typescript
    - python
  
  # Review focus areas
  focus:
    - security
    - logic
    - performance
    - best_practices
    - testing
    - documentation
```

### Comment Settings

```yaml
comments:
  # Minimum severity to post
  min_severity: suggestion  # critical|warning|suggestion
  
  # Post summary comment
  post_summary: true
  
  # Post inline comments
  post_inline: true
  
  # Maximum comments per file
  max_per_file: 10
  
  # Maximum total comments
  max_total: 50
```

### Bob (Claude) Settings

```yaml
bob:
  # Claude model
  model: claude-3-5-sonnet-20241022
  
  # Max tokens for analysis
  max_tokens: 4096
  
  # Temperature (0.0-1.0)
  temperature: 0.3
```

### GitHub Settings

```yaml
github:
  # Post as review or comments
  review_type: review  # review|comments
  
  # Review event type
  event: COMMENT  # APPROVE|REQUEST_CHANGES|COMMENT
  
  # Auto-label PRs
  auto_label: true
  labels:
    needs_work: "needs-work"
    looks_good: "looks-good"
    security_issue: "security"
```

## Usage

### Automatic Reviews

Bob automatically reviews PRs when:
- A PR is opened
- New commits are pushed to a PR
- A PR is reopened

### Manual Reviews

Trigger a review by commenting on a PR:

```
/review
```

Focused reviews:

```
/review --focus security
/review --focus performance
```

## Troubleshooting

### Bob Doesn't Review PRs

**Check GitHub Actions:**
1. Go to **Actions** tab in your repository
2. Look for failed workflow runs
3. Check the logs for errors

**Common Issues:**

- ❌ **Missing ANTHROPIC_API_KEY**: Add it to repository secrets
- ❌ **Insufficient permissions**: Enable write permissions in Actions settings
- ❌ **Workflow not triggered**: Check `.github/workflows/pr-review.yml` exists

### Reviews Are Too Expensive

**Optimize costs:**

1. Reduce `max_files` in config
2. Add more patterns to `ignore_patterns`
3. Set `max_file_size` lower
4. Increase `min_severity` to reduce comments

### Bob Posts Too Many Comments

**Adjust comment limits:**

```yaml
comments:
  min_severity: warning  # Only post warnings and critical
  max_per_file: 5        # Reduce comments per file
  max_total: 20          # Reduce total comments
```

### Reviews Are Too Slow

**Speed up reviews:**

1. Reduce `max_files` to review fewer files
2. Add large files to `ignore_patterns`
3. Use `max_file_size` to skip large files

## Advanced Configuration

### Custom System Prompt

Add a custom prompt for Bob:

```yaml
bob:
  custom_prompt: |
    You are a senior code reviewer for our team.
    Focus on:
    - Security vulnerabilities
    - Performance bottlenecks
    - Code maintainability
    
    Our coding standards:
    - Use TypeScript strict mode
    - Prefer functional programming
    - Write comprehensive tests
```

### Multiple Environments

Use different configs for different branches:

```yaml
# .github/bob-reviewer-production.yml
review:
  focus:
    - security
    - performance
  min_severity: warning

# .github/bob-reviewer-development.yml
review:
  focus:
    - best_practices
    - documentation
  min_severity: suggestion
```

Update workflow to use different configs:

```yaml
- name: Determine config
  id: config
  run: |
    if [[ "${{ github.base_ref }}" == "main" ]]; then
      echo "file=bob-reviewer-production.yml" >> $GITHUB_OUTPUT
    else
      echo "file=bob-reviewer-development.yml" >> $GITHUB_OUTPUT
    fi
```

## Monitoring

### View Review History

Check the **Actions** tab to see:
- Review execution times
- API costs (in logs)
- Success/failure rates

### Cost Tracking

Bob logs estimated costs in the workflow output:

```
[INFO] PR Review Complete
[INFO] Files reviewed: 12
[INFO] Comments posted: 8
[INFO] Estimated cost: $0.85
```

## Updating Bob

### Update to Latest Version

```bash
cd .github/bob-pr-reviewer
git pull origin main
npm install
npm run build
```

### Update Configuration

Edit `.github/bob-reviewer.yml` and commit changes. Bob will use the new config on the next review.

## Security Best Practices

1. **Never commit API keys** - Always use GitHub Secrets
2. **Limit permissions** - Only grant necessary permissions to Actions
3. **Review Bob's suggestions** - Don't blindly accept all recommendations
4. **Monitor costs** - Set up billing alerts in Anthropic console
5. **Rotate keys regularly** - Update API keys periodically

## Support

- 📖 [Full Documentation](README.md)
- 🐛 [Report Issues](https://github.com/yourusername/bob-pr-reviewer/issues)
- 💬 [Discussions](https://github.com/yourusername/bob-pr-reviewer/discussions)

## Next Steps

After deployment:

1. ✅ Test with a sample PR
2. ✅ Adjust configuration based on results
3. ✅ Monitor costs and performance
4. ✅ Share feedback with the team
5. ✅ Iterate and improve

---

**Happy reviewing! 🎉**