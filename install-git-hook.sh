#!/bin/bash

# AI-Powered Commit Message Hook Installer
# This script installs a prepare-commit-msg hook globally or per-repository

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_NAME="prepare-commit-msg"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║  🤖 AI-Powered Commit Message Hook Installer             ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if we're in a git repository
check_git_repo() {
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        return 1
    fi
    return 0
}

# Install hook in current repository
install_local() {
    print_info "Installing hook in current repository..."
    
    if ! check_git_repo; then
        print_error "Not a git repository. Please run this from a git repository."
        exit 1
    fi
    
    local GIT_DIR=$(git rev-parse --git-dir)
    local HOOKS_DIR="$GIT_DIR/hooks"
    local HOOK_FILE="$HOOKS_DIR/$HOOK_NAME"
    
    # Create hooks directory if it doesn't exist
    mkdir -p "$HOOKS_DIR"
    
    # Backup existing hook if present
    if [ -f "$HOOK_FILE" ]; then
        print_warning "Existing hook found. Creating backup..."
        cp "$HOOK_FILE" "$HOOK_FILE.backup.$(date +%Y%m%d_%H%M%S)"
    fi
    
    # Create the hook
    cat > "$HOOK_FILE" << 'HOOK_EOF'
#!/bin/bash

# AI-Powered Commit Message Hook
# Suggests better commit messages using AI

COMMIT_MSG_FILE=$1
COMMIT_SOURCE=$2

# Only run for regular commits (not merge, squash, etc.)
if [ -z "$COMMIT_SOURCE" ] || [ "$COMMIT_SOURCE" = "message" ]; then
    # Try to find the AI commit suggester
    if [ -f "$HOME/.bob-pr-reviewer/dist/suggest-commit-hook.js" ]; then
        # Run the hook version (writes to commit message file)
        node "$HOME/.bob-pr-reviewer/dist/suggest-commit-hook.js" "$COMMIT_MSG_FILE" 2>/dev/null
    else
        echo "# ⚠️  AI commit suggester not found." >> "$COMMIT_MSG_FILE"
        echo "# Install with: cd /path/to/Bob-PR-reviewer && ./install-git-hook.sh --setup" >> "$COMMIT_MSG_FILE"
        echo "#" >> "$COMMIT_MSG_FILE"
    fi
fi
HOOK_EOF
    
    chmod +x "$HOOK_FILE"
    
    print_success "Hook installed successfully in: $HOOK_FILE"
    print_info "The hook will run automatically when you use 'git commit'"
}

# Install hook globally for all repositories
install_global() {
    print_info "Installing hook globally for all repositories..."
    
    local GLOBAL_HOOKS_DIR="$HOME/.git-templates/hooks"
    local HOOK_FILE="$GLOBAL_HOOKS_DIR/$HOOK_NAME"
    
    # Create directory
    mkdir -p "$GLOBAL_HOOKS_DIR"
    
    # Backup existing hook if present
    if [ -f "$HOOK_FILE" ]; then
        print_warning "Existing global hook found. Creating backup..."
        cp "$HOOK_FILE" "$HOOK_FILE.backup.$(date +%Y%m%d_%H%M%S)"
    fi
    
    # Create the hook (same content as local)
    cat > "$HOOK_FILE" << 'HOOK_EOF'
#!/bin/bash

# AI-Powered Commit Message Hook
# Suggests better commit messages using AI

COMMIT_MSG_FILE=$1
COMMIT_SOURCE=$2

# Only run for regular commits (not merge, squash, etc.)
if [ -z "$COMMIT_SOURCE" ] || [ "$COMMIT_SOURCE" = "message" ]; then
    # Try to find the AI commit suggester
    if [ -f "$HOME/.bob-pr-reviewer/dist/suggest-commit-hook.js" ]; then
        # Run the hook version (writes to commit message file)
        node "$HOME/.bob-pr-reviewer/dist/suggest-commit-hook.js" "$COMMIT_MSG_FILE" 2>/dev/null
    else
        echo "# ⚠️  AI commit suggester not found." >> "$COMMIT_MSG_FILE"
        echo "# Install with: cd /path/to/Bob-PR-reviewer && ./install-git-hook.sh --setup" >> "$COMMIT_MSG_FILE"
        echo "#" >> "$COMMIT_MSG_FILE"
    fi
fi
HOOK_EOF
    
    chmod +x "$HOOK_FILE"
    
    # Configure git to use the template directory
    git config --global init.templateDir "$HOME/.git-templates"
    
    print_success "Global hook installed successfully!"
    print_info "Hook location: $HOOK_FILE"
    print_info "New repositories will automatically get this hook"
    print_warning "For existing repositories, run: git init (safe, won't overwrite)"
}

# Setup the AI suggester tool
setup_tool() {
    print_info "Setting up AI commit suggester tool..."
    
    local INSTALL_DIR="$HOME/.bob-pr-reviewer"
    
    # Create installation directory
    mkdir -p "$INSTALL_DIR"
    
    # Copy necessary files
    print_info "Copying files to $INSTALL_DIR..."
    
    if [ -d "$SCRIPT_DIR/dist" ]; then
        cp -r "$SCRIPT_DIR/dist" "$INSTALL_DIR/"
        cp -r "$SCRIPT_DIR/node_modules" "$INSTALL_DIR/" 2>/dev/null || true
        cp "$SCRIPT_DIR/package.json" "$INSTALL_DIR/"
        cp "$SCRIPT_DIR/.env.example" "$INSTALL_DIR/.env" 2>/dev/null || true
        
        print_success "Files copied successfully"
        
        print_info ""
        print_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        print_info "📝 Configuration Options:"
        print_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        print_info ""
        print_info "✅ RECOMMENDED: Use Environment Variables (like GitHub Actions)"
        print_info "   Add to your ~/.bashrc or ~/.zshrc:"
        print_info ""
        print_info "   export AI_PROVIDER=\"chatgpt\""
        print_info "   export OPENAI_API_KEY=\"sk-your-key-here\""
        print_info ""
        print_info "   Then run: source ~/.bashrc"
        print_info ""
        print_info "   See ENVIRONMENT_SETUP.md for complete guide"
        print_info ""
        print_info "⚠️  ALTERNATIVE: Use .env file (fallback)"
        
        # Create .env if it doesn't exist
        if [ ! -f "$INSTALL_DIR/.env" ]; then
            cat > "$INSTALL_DIR/.env" << 'ENV_EOF'
# AI Provider Configuration
# NOTE: Environment variables take priority over this file
# Recommended: Set these in ~/.bashrc or ~/.zshrc instead
#
# Choose one: chatgpt, claude, grok, bob
AI_PROVIDER=chatgpt

# OpenAI (ChatGPT)
OPENAI_API_KEY=your-openai-api-key-here
OPENAI_MODEL=gpt-4-turbo-preview

# Anthropic (Claude)
# ANTHROPIC_API_KEY=your-anthropic-api-key-here
# ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# Grok
# GROK_API_KEY=your-grok-api-key-here
# GROK_MODEL=grok-beta

# Bob (Custom)
# BOB_API_ENDPOINT=your-bob-endpoint-here
ENV_EOF
            print_info "   Created: $INSTALL_DIR/.env (edit if needed)"
        fi
        print_info ""
        print_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        
        print_success "Setup complete!"
    else
        print_error "dist/ directory not found. Please run 'npm run build' first"
        exit 1
    fi
}

# Uninstall hook
uninstall() {
    local scope=$1
    
    if [ "$scope" = "global" ]; then
        local HOOK_FILE="$HOME/.git-templates/hooks/$HOOK_NAME"
        if [ -f "$HOOK_FILE" ]; then
            rm "$HOOK_FILE"
            print_success "Global hook uninstalled"
        else
            print_warning "No global hook found"
        fi
    else
        if ! check_git_repo; then
            print_error "Not a git repository"
            exit 1
        fi
        
        local GIT_DIR=$(git rev-parse --git-dir)
        local HOOK_FILE="$GIT_DIR/hooks/$HOOK_NAME"
        
        if [ -f "$HOOK_FILE" ]; then
            rm "$HOOK_FILE"
            print_success "Local hook uninstalled"
        else
            print_warning "No local hook found"
        fi
    fi
}

# Show usage
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Install AI-powered commit message hook for git

OPTIONS:
    --local         Install hook in current repository only (default)
    --global        Install hook globally for all repositories
    --setup         Setup the AI suggester tool in ~/.bob-pr-reviewer
    --uninstall     Uninstall local hook
    --uninstall-global  Uninstall global hook
    --help          Show this help message

EXAMPLES:
    # Install in current repository
    $0 --local

    # Install globally for all repositories
    $0 --global

    # Setup the tool first (required)
    $0 --setup

    # Complete setup (recommended)
    $0 --setup && $0 --global

EOF
}

# Main script
main() {
    print_header
    
    case "${1:-}" in
        --global)
            install_global
            ;;
        --local|"")
            install_local
            ;;
        --setup)
            setup_tool
            ;;
        --uninstall)
            uninstall "local"
            ;;
        --uninstall-global)
            uninstall "global"
            ;;
        --help|-h)
            show_usage
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
    
    echo ""
    print_info "Next steps:"
    if [ "${1:-}" = "--setup" ]; then
        echo "  1. Edit ~/.bob-pr-reviewer/.env to configure your AI provider"
        echo "  2. Run: $0 --global (to install globally)"
        echo "  3. Try it: git commit (in any repository)"
    else
        echo "  1. Make sure you've run: $0 --setup"
        echo "  2. Configure ~/.bob-pr-reviewer/.env with your AI API key"
        echo "  3. Try it: git commit"
    fi
    echo ""
}

main "$@"

# Made with Bob
