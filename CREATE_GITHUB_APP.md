# 🤖 Creating Bob as a GitHub App Bot

## Understanding GitHub Apps

GitHub Apps appear as **bots** with their own identity (e.g., "Bob PR Reviewer[bot]") and can work across multiple repositories.

## Important: Where to Create GitHub Apps

❌ **Personal Account Settings** - No "Apps" section  
✅ **GitHub Developer Settings** - This is where you create apps!

## Step-by-Step: Create Bob as a GitHub App

### Step 1: Go to Developer Settings

1. Go to: **https://github.com/settings/apps**
2. Or navigate: GitHub → Settings → Developer settings → GitHub Apps
3. Click **"New GitHub App"**

### Step 2: Configure Basic Information

Fill in the form:

```
GitHub App name: Bob PR Reviewer
Description: AI-powered code review bot using Claude
Homepage URL: https://github.com/emil-ep/Bob-PR-reviewer
```

### Step 3: Webhook Configuration

**For now, we'll disable webhooks** (we'll add them later when you host the server):

```
☐ Active (uncheck this box)
```

Or if you want to set it up now:

```
☑ Active
Webhook URL: https://your-server.com/webhook (we'll set this up later)
Webhook secret: (generate a random secret)
```

### Step 4: Set Permissions

**Repository permissions:**
```
Contents: Read-only
Issues: Read and write
Pull requests: Read and write
```

**Subscribe to events:**
```
☑ Pull request
☑ Issue comment
```

### Step 5: Where can this app be installed?

```
⚪ Only on this account (emil-ep)
```

### Step 6: Create the App

1. Click **"Create GitHub App"**
2. You'll see a success message
3. **Important:** Generate and download the private key
   - Scroll down to "Private keys"
   - Click "Generate a private key"
   - Save the `.pem` file securely

### Step 7: Note Your App Details

After creation, note these values:
```
App ID: (shown on the app page)
Client ID: (shown on the app page)
Private Key: (the .pem file you downloaded)
```

### Step 8: Install the App

1. On your app page, click **"Install App"** in the left sidebar
2. Select your account (emil-ep)
3. Choose:
   - ⚪ All repositories (Bob will work on all your repos)
   - ⚪ Only select repositories (choose specific repos)
4. Click **"Install"**

## What You Have Now

✅ **Bob PR Reviewer** app created  
✅ App installed on your account  
✅ Private key downloaded  
✅ App ID noted  

## Next: Deploy the Webhook Server

Now you need to host a server that receives webhooks from GitHub. Here are your options:

### Option A: Quick Test with Replit (Easiest)

1. Go to https://replit.com
2. Create a new Node.js repl
3. I'll give you the code to paste
4. Get the repl URL (e.g., `https://your-repl.replit.app`)
5. Add this URL to your GitHub App webhook settings

### Option B: Deploy to Vercel (Recommended)

1. Install Vercel CLI: `npm install -g vercel`
2. I'll create the webhook server code
3. Run: `vercel deploy`
4. Get the deployment URL
5. Add this URL to your GitHub App webhook settings

### Option C: Use ngrok for Local Testing

1. Install ngrok: https://ngrok.com/
2. Run the webhook server locally
3. Run: `ngrok http 3000`
4. Use the ngrok URL in GitHub App settings

## Simpler Alternative: Use GitHub Actions (No Bot Identity)

If you don't need the bot identity and just want Bob to work:

### Quick Setup (5 minutes):

1. **Push this code to GitHub:**
   ```bash
   cd /Users/emil/Documents/hobby-projects/Bob-PR-reviewer
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/emil-ep/Bob-PR-reviewer.git
   git push -u origin main
   ```

2. **In any repository where you want Bob:**
   
   Create `.github/workflows/bob-review.yml`:
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
         - name: Checkout Bob
           uses: actions/checkout@v4
           with:
             repository: emil-ep/Bob-PR-reviewer
             path: bob
         
         - name: Setup Node.js
           uses: actions/setup-node@v4
           with:
             node-version: '20'
         
         - name: Install & Build
           working-directory: bob
           run: |
             npm ci
             npm run build
         
         - name: Review PR
           working-directory: bob
           env:
             GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
             ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
           run: node dist/index.js
   ```

3. **Add Secret:**
   - Go to repository Settings → Secrets → Actions
   - Add `ANTHROPIC_API_KEY`

4. **Create a test PR** - Bob will review it!

**Difference:**
- ❌ Won't show as "Bob[bot]"
- ✅ Will show as "github-actions[bot]"
- ✅ Much simpler to set up
- ✅ No server hosting needed

## Which Approach Should You Use?

### For Testing (Recommended):
**Use GitHub Actions approach** - It's simpler and works immediately.

### For Production (Later):
**Create GitHub App** - Better for organization-wide deployment.

## Let Me Help You Choose

**Tell me what you prefer:**

1. **Quick test** - Use GitHub Actions (no bot identity, but works in 5 minutes)
2. **Full bot** - Create GitHub App + deploy webhook server (takes 30 minutes)
3. **Both** - Test with Actions first, then upgrade to App later

Which would you like to do first?