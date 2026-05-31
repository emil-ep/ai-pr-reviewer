# 🏢 Organization-Wide Deployment Guide

## Current System vs Organization-Wide Deployment

### ❌ Current Implementation (Per-Repository)
The current system requires:
- Installing the workflow in **each repository**
- Each repo has its own `.github/workflows/pr-review.yml`
- Secrets configured per repository
- **Not scalable** for organizations with many repos

### ✅ Organization-Wide Solution (What You Need)

For Instana organization, you need a **centralized GitHub App** that:
- Listens to PR events across **all repositories**
- Single deployment, works everywhere
- Centralized configuration and secrets
- Automatic coverage for new repositories

## How the System Actually Works

### Current Architecture (Per-Repo)

```
Repository A                    Repository B
    │                               │
    ├─ .github/workflows/           ├─ .github/workflows/
    │  └─ pr-review.yml             │  └─ pr-review.yml
    │                               │
    ▼                               ▼
GitHub Actions Runner          GitHub Actions Runner
    │                               │
    ├─ Runs MCP Server              ├─ Runs MCP Server
    │                               │
    ▼                               ▼
Bob (Claude API)               Bob (Claude API)
    │                               │
    └─ Posts comments               └─ Posts comments
```

**Problems:**
- Must install workflow in every repo
- Duplicate configuration
- Hard to maintain at scale

### Organization-Wide Architecture (Recommended)

```
                    Instana Organization
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
    Repo A              Repo B              Repo C
        │                   │                   │
        └───────────────────┴───────────────────┘
                            │
                    PR Events (Webhooks)
                            │
                            ▼
        ┌─────────────────────────────────────┐
        │      GitHub App (Bob Reviewer)      │
        │  - Installed at organization level  │
        │  - Receives webhooks from all repos │
        │  - Single configuration             │
        └─────────────────┬───────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────┐
        │      Webhook Server (Node.js)       │
        │  - Hosted on cloud (AWS/Vercel)     │
        │  - Processes PR events              │
        │  - Runs MCP Server                  │
        └─────────────────┬───────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────┐
        │         Bob (Claude API)            │
        │  - Analyzes PRs via MCP tools       │
        │  - Posts reviews on all repos       │
        └─────────────────────────────────────┘
```

## Implementation Options for Organization-Wide

### Option 1: GitHub App (Recommended for Organizations)

**Pros:**
- ✅ Single installation for entire organization
- ✅ Automatic coverage for all repos
- ✅ Centralized configuration
- ✅ Better security (fine-grained permissions)
- ✅ Professional appearance (shows as a bot)

**Cons:**
- ❌ Requires hosting a webhook server
- ❌ More complex initial setup
- ❌ Need to manage infrastructure

**Best for:** Organizations with 10+ repositories

### Option 2: Reusable Workflow (Simpler Alternative)

**Pros:**
- ✅ No server hosting needed
- ✅ Uses GitHub Actions
- ✅ Centralized workflow definition
- ✅ Easy to maintain

**Cons:**
- ❌ Each repo needs minimal setup
- ❌ Less automated than GitHub App

**Best for:** Organizations with moderate repo count

### Option 3: Organization-Level GitHub Actions

**Pros:**
- ✅ No per-repo setup
- ✅ Organization-wide secrets
- ✅ Centralized management

**Cons:**
- ❌ Requires GitHub Enterprise
- ❌ Limited to GitHub Actions runners

## Recommended Solution: GitHub App

For Instana organization, I recommend building a **GitHub App** with a hosted webhook server.

### Architecture Components

```
┌─────────────────────────────────────────────────────────────┐
│                    GitHub App: "Bob Reviewer"                │
├─────────────────────────────────────────────────────────────┤
│  Permissions:                                                │
│  - Pull requests: Read & Write                               │
│  - Contents: Read                                            │
│  - Issues: Read & Write (for comments)                       │
│                                                               │
│  Webhook Events:                                             │
│  - pull_request (opened, synchronize, reopened)              │
│  - issue_comment (created)                                   │
│                                                               │
│  Installation:                                               │
│  - Installed at Instana organization level                   │
│  - Automatically applies to all repositories                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Webhooks
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Webhook Server (Hosted Service)                 │
├─────────────────────────────────────────────────────────────┤
│  Technology: Node.js + Express                               │
│  Hosting: AWS Lambda / Vercel / Railway / Render            │
│                                                               │
│  Endpoints:                                                  │
│  - POST /webhook - Receives GitHub events                    │
│  - GET /health - Health check                                │
│                                                               │
│  Processing:                                                 │
│  1. Verify webhook signature                                 │
│  2. Parse PR event                                           │
│  3. Start MCP server                                         │
│  4. Bob analyzes PR                                          │
│  5. Post review comments                                     │
└─────────────────────────────────────────────────────────────┘
```

## Step-by-Step: Building the GitHub App

### Phase 1: Create GitHub App

1. **Go to GitHub Organization Settings**
   - Navigate to: `https://github.com/organizations/instana/settings/apps`
   - Click "New GitHub App"

2. **Configure App Settings**
   ```
   Name: Bob PR Reviewer
   Description: AI-powered code review bot using Claude
   Homepage URL: https://your-webhook-server.com
   Webhook URL: https://your-webhook-server.com/webhook
   Webhook Secret: [Generate a secure secret]
   ```

3. **Set Permissions**
   ```
   Repository permissions:
   - Contents: Read
   - Pull requests: Read & Write
   - Issues: Read & Write
   
   Organization permissions:
   - Members: Read (optional, for team mentions)
   ```

4. **Subscribe to Events**
   ```
   ✅ Pull request
   ✅ Issue comment
   ```

5. **Create App**
   - Generate private key (download and save securely)
   - Note the App ID

### Phase 2: Build Webhook Server

I'll create the webhook server code for you:

**File Structure:**
```
bob-pr-reviewer-server/
├── src/
│   ├── index.ts              # Express server
│   ├── webhook-handler.ts    # GitHub webhook processing
│   ├── mcp-runner.ts         # Run MCP server for reviews
│   └── github-app-auth.ts    # GitHub App authentication
├── package.json
└── vercel.json               # Deployment config
```

**Key Components:**

1. **Webhook Handler** - Receives and validates GitHub events
2. **MCP Runner** - Starts MCP server for each PR
3. **GitHub App Auth** - Authenticates as the app
4. **Review Orchestrator** - Coordinates the review process

### Phase 3: Deploy Webhook Server

**Hosting Options:**

#### Option A: Vercel (Easiest)
```bash
npm install -g vercel
vercel deploy
```

#### Option B: AWS Lambda
```bash
serverless deploy
```

#### Option C: Railway/Render
- Connect GitHub repo
- Auto-deploy on push

### Phase 4: Install App in Organization

1. **Install the App**
   - Go to app settings
   - Click "Install App"
   - Select "Instana" organization
   - Choose "All repositories" or select specific ones

2. **Configure Secrets**
   - Add `ANTHROPIC_API_KEY` to server environment
   - Add GitHub App private key
   - Add webhook secret

3. **Test**
   - Create a test PR in any repo
   - Bob should automatically review it

## Implementation Code

Let me create the webhook server implementation:

### 1. Webhook Server (src/webhook-server.ts)

```typescript
import express from 'express';
import { Webhooks } from '@octokit/webhooks';
import { createAppAuth } from '@octokit/auth-app';
import { runPRReview } from './mcp-runner.js';

const app = express();
const webhooks = new Webhooks({
  secret: process.env.WEBHOOK_SECRET!,
});

// GitHub App authentication
const auth = createAppAuth({
  appId: process.env.GITHUB_APP_ID!,
  privateKey: process.env.GITHUB_PRIVATE_KEY!,
});

// Handle pull request events
webhooks.on('pull_request.opened', async ({ payload }) => {
  console.log(`PR opened: ${payload.repository.full_name}#${payload.pull_request.number}`);
  
  // Get installation token
  const { token } = await auth({
    type: 'installation',
    installationId: payload.installation!.id,
  });
  
  // Run review
  await runPRReview({
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    prNumber: payload.pull_request.number,
    token,
  });
});

webhooks.on('pull_request.synchronize', async ({ payload }) => {
  // Handle PR updates
  // Same as above
});

webhooks.on('issue_comment.created', async ({ payload }) => {
  // Check if comment is on a PR and contains /review
  if (payload.issue.pull_request && payload.comment.body.includes('/review')) {
    // Run review
  }
});

// Webhook endpoint
app.post('/webhook', express.json(), async (req, res) => {
  try {
    await webhooks.verifyAndReceive({
      id: req.headers['x-github-delivery'] as string,
      name: req.headers['x-github-event'] as any,
      signature: req.headers['x-hub-signature-256'] as string,
      payload: req.body,
    });
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Error');
  }
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook server listening on port ${PORT}`);
});
```

### 2. MCP Runner (src/mcp-runner.ts)

```typescript
import { PRReviewerServer } from './server.js';

export async function runPRReview(params: {
  owner: string;
  repo: string;
  prNumber: number;
  token: string;
}) {
  const { owner, repo, prNumber, token } = params;
  
  console.log(`Starting review for ${owner}/${repo}#${prNumber}`);
  
  // Create MCP server instance
  const server = new PRReviewerServer(token);
  
  // Start server (connects to Claude)
  await server.start();
  
  // Bob will use MCP tools to:
  // 1. Fetch PR diff
  // 2. Analyze code
  // 3. Post review comments
  
  console.log(`Review completed for ${owner}/${repo}#${prNumber}`);
}
```

## Configuration for Organization

Create a centralized config that applies to all repos:

**config/organization-config.yml**
```yaml
organization: instana

# Default settings for all repositories
defaults:
  review:
    auto_review: true
    max_files: 20
    focus:
      - security
      - logic
      - performance
  
  bob:
    model: claude-3-5-sonnet-20241022
    temperature: 0.3

# Repository-specific overrides
repositories:
  instana/critical-service:
    review:
      focus:
        - security
        - performance
      min_severity: warning
  
  instana/documentation:
    review:
      auto_review: false
      focus:
        - documentation
```

## Deployment Checklist

- [ ] Create GitHub App in Instana organization
- [ ] Generate and save private key
- [ ] Build webhook server
- [ ] Deploy webhook server to cloud
- [ ] Configure environment variables
- [ ] Install app in organization
- [ ] Test with sample PR
- [ ] Monitor logs and costs
- [ ] Document for team

## Cost Considerations

**For Organization-Wide Deployment:**

- **Webhook Server Hosting:** $5-20/month (Vercel/Railway)
- **Claude API:** $50-500/month (depends on PR volume)
- **Total:** ~$100-500/month for active organization

**Cost Optimization:**
- Set `max_files` limit
- Use `ignore_patterns` extensively
- Review only critical repositories
- Implement caching for repeated analyses

## Monitoring & Maintenance

**Metrics to Track:**
- PRs reviewed per day
- Average review time
- API costs
- Error rates
- User feedback

**Maintenance Tasks:**
- Update Claude model version
- Adjust configuration based on feedback
- Monitor and optimize costs
- Update dependencies

## Next Steps

Would you like me to:
1. ✅ Build the complete webhook server implementation?
2. ✅ Create deployment scripts for Vercel/AWS?
3. ✅ Add organization-wide configuration system?
4. ✅ Create monitoring and analytics dashboard?

Let me know and I'll implement the full organization-wide solution!