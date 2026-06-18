# Bob Shell Wrapper Integration Setup

## Overview

The PR reviewer has been successfully updated to use your hosted Bob Shell Wrapper API instead of external AI services like Grok. This provides better control, security, and integration with your existing Bob infrastructure.

## What Changed

### 1. New Bob Client (`src/ai/bob-client.ts`)
- Integrates with your Bob Shell Wrapper API
- Implements health check and PR review functionality
- Uses the `/api/v1/execute` endpoint to send commands to Bob
- Parses JSON responses with proper TypeScript types

### 2. Updated Files
- **`src/reviewer.ts`**: Now uses `BobClient` instead of `GrokClient`
- **`src/index.ts`**: Reads `BOB_API_ENDPOINT` environment variable
- **`.github/workflows/pr-review-external.yml`**: Updated to use `BOB_API_ENDPOINT` secret
- **`.env.example`**: Updated with correct environment variables

### 3. Environment Variables
- **Old**: `GROK_API_KEY`
- **New**: `BOB_API_ENDPOINT` (URL of your hosted Bob Shell Wrapper service)

## Setup Instructions

### Step 1: Add GitHub Secret

You need to add the `BOB_API_ENDPOINT` secret to your GitHub repository:

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `BOB_API_ENDPOINT`
5. Value: Your Bob Shell Wrapper API endpoint (e.g., `https://your-bob-service.example.com`)
6. Click **Add secret**

### Step 2: Copy Workflow to Target Repository

Copy the workflow file to any repository where you want PR reviews:

```bash
# In your target repository (e.g., xpense-tracker)
mkdir -p .github/workflows
cp /path/to/pr-reviewer/.github/workflows/pr-review-external.yml .github/workflows/
git add .github/workflows/pr-review-external.yml
git commit -m "Add Bob PR reviewer workflow"
git push
```

### Step 3: Test the Integration

1. Create a test PR in your target repository
2. The workflow should trigger automatically
3. Check the Actions tab to see the review in progress
4. Bob will post review comments on the PR

## How It Works

### Request Flow

1. **GitHub Actions Trigger**: PR opened/updated or `/review` comment
2. **Fetch PR Data**: Get diff and file contents from GitHub API
3. **Send to Bob**: POST request to `/api/v1/execute` with PR context
4. **Bob Analysis**: Your hosted Bob service analyzes the code
5. **Post Comments**: Review results posted back to GitHub PR

### Bob Shell Wrapper API Integration

The reviewer sends a command to your Bob service:

```json
{
  "command": "Review this pull request:\n\nTitle: <PR title>\nDescription: <PR description>\n\nFiles changed:\n<file diffs and content>"
}
```

Bob responds with:

```json
{
  "success": true,
  "output": "<Bob's review analysis>",
  "error": null
}
```

The reviewer then parses Bob's output to extract:
- Summary
- Individual comments with severity (critical/warning/suggestion)
- File paths and line numbers for inline comments

## API Endpoints Used

### Health Check
```
GET /health
Response: { "status": "ok" }
```

### Execute Command
```
POST /api/v1/execute
Body: { "command": "string" }
Response: { "success": boolean, "output": string, "error": string | null }
```

## Troubleshooting

### Issue: "BOB_API_ENDPOINT environment variable is required"
**Solution**: Add the `BOB_API_ENDPOINT` secret to your GitHub repository settings.

### Issue: "Failed to connect to Bob API"
**Solution**: 
- Verify your Bob Shell Wrapper service is running and accessible
- Check the endpoint URL is correct
- Ensure there are no firewall rules blocking GitHub Actions

### Issue: "Bob returned an error"
**Solution**: 
- Check the Bob service logs
- Verify the command format is correct
- Ensure Bob has proper permissions and resources

## Testing Locally

To test locally before deploying:

```bash
# Set environment variables
export GITHUB_TOKEN=your_github_token
export BOB_API_ENDPOINT=https://your-bob-service.example.com
export PR_NUMBER=123
export REPO_OWNER=your-username
export REPO_NAME=your-repo

# Build and run
npm run build
node dist/index.js
```

## Next Steps

1. **Add BOB_API_ENDPOINT secret** to your GitHub repositories
2. **Deploy workflow** to target repositories (e.g., xpense-tracker)
3. **Test with a sample PR** to verify everything works
4. **Refine Bob's prompts** based on review quality
5. **Monitor and optimize** based on usage patterns

## Security Considerations

- The `BOB_API_ENDPOINT` is stored as a GitHub secret (encrypted)
- Only GitHub Actions can access the secret
- Bob service should implement authentication if exposed publicly
- Consider rate limiting on the Bob API endpoint
- Review logs regularly for any suspicious activity

## Cost Optimization

Since you're using your own hosted Bob service:
- No per-request API costs
- Control over resource allocation
- Can implement custom caching strategies
- Full control over rate limiting and quotas

## Support

For issues or questions:
1. Check the GitHub Actions logs for detailed error messages
2. Review the Bob Shell Wrapper service logs
3. Verify all environment variables are set correctly
4. Test the Bob API endpoint directly using curl or Postman

---

**Status**: ✅ Integration complete and ready for testing
**Last Updated**: 2026-06-18