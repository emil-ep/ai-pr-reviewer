# 🔐 Using GitHub Secrets Securely

## Why Use GitHub Secrets?

✅ **Never commit API keys to your repository**  
✅ **Keys are encrypted and secure**  
✅ **Easy to rotate/update**  
✅ **Works automatically in GitHub Actions**

## How to Add Secrets

### Step 1: Go to Repository Settings

1. Go to your repository on GitHub
2. Click **Settings** (top menu)
3. In left sidebar, click **Secrets and variables** → **Actions**
4. Click **New repository secret**

### Step 2: Add Your Secrets

Add these secrets:

#### For Bob API:
```
Name: BOB_API_KEY
Value: [Your Bob API key]
```

#### For GitHub (usually not needed):
```
Name: GITHUB_TOKEN
Value: [Auto-provided by GitHub Actions - don't add manually]
```

### Step 3: Use Secrets in Workflow

In your `.github/workflows/pr-review.yml`:

```yaml
name: Bob PR Review

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
      - name: Checkout Bob PR Reviewer
        uses: actions/checkout@v4
        with:
          repository: emil-ep/Bob-PR-reviewer
          path: bob
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        working-directory: bob
        run: npm ci
      
      - name: Build
        working-directory: bob
        run: npm run build
      
      - name: Run Bob PR Review
        working-directory: bob
        env:
          # GitHub token is automatically provided
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          
          # Your Bob API key from secrets
          BOB_API_KEY: ${{ secrets.BOB_API_KEY }}
          
          # Optional: Bob API endpoint if needed
          BOB_API_ENDPOINT: ${{ secrets.BOB_API_ENDPOINT }}
        run: node dist/index.js
```

## Important Security Notes

### ✅ DO:
- Store all API keys in GitHub Secrets
- Use `${{ secrets.SECRET_NAME }}` syntax in workflows
- Rotate keys regularly
- Use different keys for dev/prod

### ❌ DON'T:
- Commit `.env` files with real keys
- Put keys in workflow files directly
- Share secrets in public repos
- Log secret values

## How Secrets Work in GitHub Actions

```
┌─────────────────────────────────────┐
│   GitHub Repository Settings        │
│   ┌─────────────────────────────┐   │
│   │  Secrets (Encrypted)        │   │
│   │  - BOB_API_KEY: ********    │   │
│   │  - GITHUB_TOKEN: auto       │   │
│   └─────────────────────────────┘   │
└──────────────┬──────────────────────┘
               │
               │ When workflow runs
               ▼
┌─────────────────────────────────────┐
│   GitHub Actions Runner             │
│   ┌─────────────────────────────┐   │
│   │  Environment Variables      │   │
│   │  BOB_API_KEY=actual_value   │   │
│   │  GITHUB_TOKEN=actual_token  │   │
│   └─────────────────────────────┘   │
│                                     │
│   Your code reads:                  │
│   process.env.BOB_API_KEY          │
└─────────────────────────────────────┘
```

## Example: Reading Secrets in Code

### In TypeScript (src/index.ts):

```typescript
// Read from environment variables (set by GitHub Secrets)
const bobApiKey = process.env.BOB_API_KEY;
const githubToken = process.env.GITHUB_TOKEN;

if (!bobApiKey) {
  console.error('BOB_API_KEY not found in environment');
  process.exit(1);
}

if (!githubToken) {
  console.error('GITHUB_TOKEN not found in environment');
  process.exit(1);
}

// Use the keys
const bobClient = new BobAPIClient(bobApiKey);
const githubClient = new GitHubClient(githubToken);
```

## Testing Locally Without Committing Keys

### Option 1: Use .env file (gitignored)

1. Create `.env` file:
   ```bash
   BOB_API_KEY=your_key_here
   GITHUB_TOKEN=your_token_here
   ```

2. Make sure `.gitignore` includes:
   ```
   .env
   ```

3. Load in code:
   ```typescript
   import dotenv from 'dotenv';
   dotenv.config();
   ```

### Option 2: Export environment variables

```bash
export BOB_API_KEY=your_key_here
export GITHUB_TOKEN=your_token_here
npm run dev
```

### Option 3: Pass inline (temporary)

```bash
BOB_API_KEY=your_key npm run dev
```

## Organization-Level Secrets

For Instana organization (later):

1. Go to: `https://github.com/organizations/instana/settings/secrets/actions`
2. Add organization-level secrets
3. All repos in organization can use them
4. More secure and easier to manage

## Rotating Secrets

When you need to change a key:

1. Generate new key from Bob/GitHub
2. Update secret in GitHub Settings
3. Old key stops working immediately
4. No code changes needed!

## Checking if Secrets Work

Add a test step in your workflow:

```yaml
- name: Verify secrets are set
  run: |
    if [ -z "$BOB_API_KEY" ]; then
      echo "❌ BOB_API_KEY not set"
      exit 1
    fi
    echo "✅ BOB_API_KEY is set"
    
    if [ -z "$GITHUB_TOKEN" ]; then
      echo "❌ GITHUB_TOKEN not set"
      exit 1
    fi
    echo "✅ GITHUB_TOKEN is set"
  env:
    BOB_API_KEY: ${{ secrets.BOB_API_KEY }}
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Common Issues

### "Secret not found"
- Check secret name matches exactly (case-sensitive)
- Verify secret is added to correct repository
- For organization secrets, check access permissions

### "Permission denied"
- Add `permissions:` block to workflow
- Ensure `GITHUB_TOKEN` has write access

### "Secret value is empty"
- Secret might not be set
- Check in repository Settings → Secrets

## Summary

**To use secrets securely:**

1. ✅ Add secrets in GitHub Settings (never in code)
2. ✅ Reference with `${{ secrets.NAME }}` in workflows
3. ✅ Read with `process.env.NAME` in code
4. ✅ Keep `.env` in `.gitignore`
5. ✅ Never log secret values

**Your keys are safe and never committed to the repository!** 🔒