# 🔍 How Bob PR Reviewer Actually Works

## The Big Picture

Bob PR Reviewer is an AI assistant that reviews your code changes automatically. Think of it as having a senior developer review every PR, but powered by Claude AI.

## Current System (What We Built)

### Simple Flow Diagram

```
Developer                GitHub                Bob PR Reviewer           Claude AI
    |                      |                          |                      |
    |--[1] Create PR------>|                          |                      |
    |                      |                          |                      |
    |                      |--[2] Trigger Workflow--->|                      |
    |                      |                          |                      |
    |                      |                          |--[3] "Analyze PR"--->|
    |                      |                          |                      |
    |                      |                          |<--[4] Use Tools------|
    |                      |                          |                      |
    |                      |<--[5] Fetch PR Data------|                      |
    |                      |                          |                      |
    |                      |---[6] PR Details-------->|                      |
    |                      |                          |                      |
    |                      |                          |--[7] "Here's PR"--->|
    |                      |                          |                      |
    |                      |                          |                      |--[8] Analyze
    |                      |                          |                      |    Code
    |                      |                          |                      |
    |                      |                          |<--[9] Review---------|
    |                      |                          |                      |
    |                      |<--[10] Post Comments-----|                      |
    |                      |                          |                      |
    |<--[11] See Review----|                          |                      |
    |                      |                          |                      |
```

### Step-by-Step Explanation

**Step 1: Developer Creates PR**
```
You: git push origin feature-branch
You: Create PR on GitHub
```

**Step 2: GitHub Triggers Workflow**
```
GitHub detects: New PR created
GitHub runs: .github/workflows/pr-review.yml
GitHub Actions: Starts a virtual machine
```

**Step 3: Bob Starts Analyzing**
```
Workflow: npm run build
Workflow: node dist/index.js
MCP Server: Connects to Claude API
Bob: "I need to review a PR"
```

**Step 4: Bob Uses MCP Tools**
```
Bob thinks: "I need to see what changed"
Bob uses tool: fetch_pr_diff
Bob thinks: "I need to read the full files"
Bob uses tool: get_file_content
Bob thinks: "Let me check related code"
Bob uses tool: list_pr_files
```

**Step 5-6: Fetch PR Data**
```
MCP Server → GitHub API: "Give me PR #123"
GitHub API → MCP Server: "Here's the data"
```

**Step 7: Send to Claude**
```
MCP Server → Claude: "Here's a PR with these changes..."
Claude receives:
  - PR title and description
  - List of changed files
  - Code diffs
  - Full file contents
```

**Step 8: Claude Analyzes**
```
Claude thinks:
  ✓ Check for security issues
  ✓ Look for logic errors
  ✓ Find performance problems
  ✓ Verify best practices
  ✓ Check for missing tests
```

**Step 9: Claude Generates Review**
```
Claude creates:
  - Summary of changes
  - Specific line comments
  - Severity levels (critical/warning/suggestion)
  - Actionable recommendations
```

**Step 10: Post Comments**
```
Bob uses tool: post_review_comment
MCP Server → GitHub API: "Post these comments"
GitHub API: Comments appear on PR
```

**Step 11: Developer Sees Review**
```
You see on GitHub:
  ✓ Summary comment
  ✓ Inline comments on specific lines
  ✓ Suggestions for improvements
```

## What You Need for Instana Organization

### Problem with Current System

```
Instana Org (100+ repos)
├── repo-1/
│   └── .github/workflows/pr-review.yml  ❌ Must install
├── repo-2/
│   └── .github/workflows/pr-review.yml  ❌ Must install
├── repo-3/
│   └── .github/workflows/pr-review.yml  ❌ Must install
└── ... (97 more repos)
    └── .github/workflows/pr-review.yml  ❌ Must install each!
```

**Issues:**
- ❌ Must install workflow in every repository
- ❌ Hard to maintain 100+ copies
- ❌ Updates require changing all repos
- ❌ New repos need manual setup

### Solution: GitHub App (Organization-Wide)

```
Instana Organization
├── repo-1/  ✅ Automatic
├── repo-2/  ✅ Automatic
├── repo-3/  ✅ Automatic
└── ... (97 more repos) ✅ All automatic!
         │
         │ All PRs send webhooks to:
         ▼
┌─────────────────────────────┐
│   Bob Reviewer GitHub App   │
│   (Single Installation)     │
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│   Webhook Server (Hosted)   │
│   - Receives all PR events  │
│   - Runs Bob for each PR    │
└─────────────────────────────┘
```

## Organization-Wide Flow

### Detailed Flow for Instana

```
Any Developer in Instana          GitHub App              Webhook Server           Bob/Claude
       |                              |                         |                      |
       |--[1] Create PR in any repo-->|                         |                      |
       |                              |                         |                      |
       |                              |--[2] Send Webhook------>|                      |
       |                              |    (PR event)           |                      |
       |                              |                         |                      |
       |                              |                         |--[3] Start Review--->|
       |                              |                         |                      |
       |                              |<--[4] Request PR Data---|                      |
       |                              |                         |                      |
       |                              |---[5] Send PR Data----->|                      |
       |                              |                         |                      |
       |                              |                         |--[6] Analyze-------->|
       |                              |                         |                      |
       |                              |                         |<--[7] Review---------|
       |                              |                         |                      |
       |                              |<--[8] Post Comments-----|                      |
       |                              |                         |                      |
       |<--[9] See Review-------------|                         |                      |
       |                              |                         |                      |
```

### What Happens Behind the Scenes

**1. PR Created in Any Repo**
```
Developer: Creates PR in instana/backend-service
GitHub: Detects PR event
GitHub: "Bob Reviewer app is installed, send webhook"
```

**2. Webhook Sent**
```
GitHub → Webhook Server: POST https://bob-reviewer.com/webhook
Payload:
{
  "action": "opened",
  "repository": "instana/backend-service",
  "pull_request": {
    "number": 456,
    "title": "Add new feature",
    ...
  }
}
```

**3. Webhook Server Processes**
```
Server receives webhook
Server validates signature (security)
Server extracts: owner=instana, repo=backend-service, pr=456
Server starts MCP server
Server connects to Claude API
```

**4. Bob Analyzes**
```
Bob: "I need to review instana/backend-service#456"
Bob uses: fetch_pr_diff(instana, backend-service, 456)
Bob uses: get_file_content(src/api.ts)
Bob analyzes: Security, logic, performance
Bob generates: Review comments
```

**5. Comments Posted**
```
Bob uses: post_review_comment(...)
GitHub API: Posts comments on PR
Developer sees: Review on GitHub
```

## Key Differences

### Per-Repository (Current)

```
┌─────────────────────────────────────────┐
│           Each Repository               │
│  ┌─────────────────────────────────┐   │
│  │  .github/workflows/             │   │
│  │    pr-review.yml                │   │
│  │                                 │   │
│  │  Runs on: GitHub Actions        │   │
│  │  Triggers: PR events in this repo│  │
│  │  Scope: Only this repository    │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘

Pros: Simple, no hosting needed
Cons: Must install in every repo
```

### Organization-Wide (Recommended)

```
┌─────────────────────────────────────────┐
│        Instana Organization             │
│  ┌─────┐  ┌─────┐  ┌─────┐            │
│  │Repo1│  │Repo2│  │Repo3│  ... 100+  │
│  └──┬──┘  └──┬──┘  └──┬──┘            │
│     │        │        │                 │
│     └────────┴────────┴─────────────────┤
│              All send webhooks          │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│      Bob Reviewer GitHub App            │
│  - Single installation                  │
│  - Covers all repos automatically       │
│  - Centralized configuration            │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│      Webhook Server (Your hosting)      │
│  - Receives webhooks from all repos     │
│  - Runs Bob for each PR                 │
│  - Posts reviews back to GitHub         │
└─────────────────────────────────────────┘

Pros: One installation, covers everything
Cons: Need to host webhook server
```

## What You Need to Deploy

### For Organization-Wide (Instana)

**1. Create GitHub App**
```
Go to: https://github.com/organizations/instana/settings/apps
Create: "Bob PR Reviewer" app
Configure: Webhooks, permissions
Install: In Instana organization
```

**2. Host Webhook Server**
```
Options:
- Vercel (easiest, $0-20/month)
- AWS Lambda (scalable, pay per use)
- Railway/Render (simple, $5-20/month)
- Your own server (full control)
```

**3. Configure Secrets**
```
Environment variables:
- ANTHROPIC_API_KEY (Claude API)
- GITHUB_APP_ID (from GitHub)
- GITHUB_PRIVATE_KEY (from GitHub)
- WEBHOOK_SECRET (for security)
```

**4. Deploy and Test**
```
Deploy webhook server
Install app in organization
Create test PR
Verify Bob reviews it
```

## Real-World Example

### Scenario: Developer Creates PR

```
Time: 10:00 AM
Developer: Alice
Repository: instana/payment-service
Action: Creates PR #789 "Fix payment validation"

10:00:00 - Alice pushes code
10:00:01 - GitHub detects PR
10:00:02 - GitHub sends webhook to Bob
10:00:03 - Webhook server receives event
10:00:04 - Bob starts analyzing
10:00:05 - Bob fetches PR diff (3 files changed)
10:00:10 - Bob reads full file contents
10:00:15 - Bob analyzes with Claude
10:00:45 - Bob generates review
10:00:46 - Bob posts 5 comments on PR
10:00:47 - Alice sees review on GitHub

Total time: 47 seconds
Cost: ~$0.30
```

### What Alice Sees

```
PR #789: Fix payment validation

💬 Bob PR Reviewer commented 1 minute ago:

## Review Summary
I've reviewed your changes. Found 2 security concerns and 3 suggestions.

📁 src/payment/validator.ts
Line 45: 🔴 CRITICAL - SQL injection vulnerability
  The user input is not sanitized before database query.
  Recommendation: Use parameterized queries.

Line 67: 🟡 WARNING - Missing error handling
  Payment failures should be logged for audit.
  
Line 89: 🔵 SUGGESTION - Consider using async/await
  Would improve code readability.

Overall: Please address the critical security issue before merging.
```

## Summary

**Current System:**
- ✅ Works great for single repository
- ✅ No hosting needed
- ❌ Must install in each repo
- ❌ Not scalable for organizations

**Organization-Wide System:**
- ✅ Single installation
- ✅ Covers all repos automatically
- ✅ Centralized management
- ❌ Requires hosting webhook server

**For Instana:** You need the organization-wide GitHub App approach.

## Next Steps

Would you like me to:
1. Build the complete webhook server for organization-wide deployment?
2. Create deployment scripts for Vercel/AWS?
3. Add organization-level configuration management?
4. Set up monitoring and cost tracking?

Let me know and I'll implement the full solution!