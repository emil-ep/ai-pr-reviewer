#!/bin/bash

# Setup script for deploying Bob PR Reviewer to GitHub
# Usage: ./setup-github.sh

set -e

echo "🤖 Bob PR Reviewer - GitHub Setup"
echo "=================================="
echo ""

# Check if git is initialized
if [ ! -d .git ]; then
    echo "📦 Initializing git repository..."
    git init
    echo "✅ Git initialized"
else
    echo "✅ Git repository already initialized"
fi

# Check if remote exists
if git remote | grep -q "origin"; then
    echo "✅ Remote 'origin' already exists"
    REMOTE_URL=$(git remote get-url origin)
    echo "   Current remote: $REMOTE_URL"
    
    read -p "Do you want to change the remote URL? (y/N): " CHANGE_REMOTE
    if [[ $CHANGE_REMOTE =~ ^[Yy]$ ]]; then
        read -p "Enter new GitHub repository URL: " NEW_URL
        git remote set-url origin "$NEW_URL"
        echo "✅ Remote URL updated"
    fi
else
    echo "📝 Setting up GitHub remote..."
    read -p "Enter your GitHub repository URL (e.g., https://github.com/emil-ep/Bob-PR-reviewer.git): " REPO_URL
    git remote add origin "$REPO_URL"
    echo "✅ Remote added"
fi

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo ""
    echo "📝 Staging all files..."
    git add .
    
    echo ""
    echo "💾 Committing changes..."
    git commit -m "Initial commit: Bob PR Reviewer with MCP integration"
    echo "✅ Changes committed"
else
    echo "✅ No uncommitted changes"
fi

# Check if main branch exists
if ! git rev-parse --verify main >/dev/null 2>&1; then
    echo ""
    echo "🌿 Creating main branch..."
    git branch -M main
    echo "✅ Main branch created"
fi

echo ""
echo "🚀 Ready to push to GitHub!"
echo ""
echo "Next steps:"
echo "1. Make sure you've created the repository on GitHub: https://github.com/emil-ep/Bob-PR-reviewer"
echo "2. Run: git push -u origin main"
echo ""
echo "After pushing:"
echo "3. Add ANTHROPIC_API_KEY to repository secrets"
echo "4. Create a test PR to see Bob in action!"
echo ""
echo "📖 See QUICKSTART.md for detailed instructions"

# Made with Bob
