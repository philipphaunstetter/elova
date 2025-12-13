#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the project root directory (parent of scripts/)
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Function to print colored messages
info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Function to get current version from package.json
get_current_version() {
    node -p "require('./package.json').version"
}

# Function to update version in package.json
update_package_version() {
    local new_version=$1
    node -e "
        const fs = require('fs');
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        pkg.version = '$new_version';
        fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
    "
}

# Function to increment version
increment_version() {
    local version=$1
    local bump_type=$2
    
    IFS='.' read -ra PARTS <<< "$version"
    local major=${PARTS[0]}
    local minor=${PARTS[1]}
    local patch=${PARTS[2]}
    
    case $bump_type in
        major)
            major=$((major + 1))
            minor=0
            patch=0
            ;;
        minor)
            minor=$((minor + 1))
            patch=0
            ;;
        patch)
            patch=$((patch + 1))
            ;;
        *)
            error "Invalid bump type: $bump_type"
            ;;
    esac
    
    echo "$major.$minor.$patch"
}

# Check if on staging branch
current_branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$current_branch" != "staging" ]; then
    error "You must be on the 'staging' branch to create a release. Current branch: $current_branch"
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    error "You have uncommitted changes. Please commit or stash them first."
fi

# Fetch latest from remote
info "Fetching latest changes from remote..."
git fetch origin

# Check if staging is up to date with remote
LOCAL=$(git rev-parse @)
REMOTE=$(git rev-parse @{u})
BASE=$(git merge-base @ @{u})

if [ $LOCAL != $REMOTE ]; then
    if [ $LOCAL = $BASE ]; then
        error "Your staging branch is behind the remote. Please pull first: git pull origin staging"
    elif [ $REMOTE = $BASE ]; then
        warn "Your staging branch is ahead of remote. This is fine for a release."
    else
        error "Your staging branch has diverged from remote. Please resolve this first."
    fi
fi

# Get current version
current_version=$(get_current_version)
info "Current version: $current_version"

# Ask for bump type
echo ""
echo "Select version bump type:"
echo "  1) patch (bug fixes)          - $current_version → $(increment_version $current_version patch)"
echo "  2) minor (new features)       - $current_version → $(increment_version $current_version minor)"
echo "  3) major (breaking changes)   - $current_version → $(increment_version $current_version major)"
echo "  4) custom version"
echo ""
read -p "Enter choice [1-4]: " choice

case $choice in
    1)
        new_version=$(increment_version $current_version patch)
        ;;
    2)
        new_version=$(increment_version $current_version minor)
        ;;
    3)
        new_version=$(increment_version $current_version major)
        ;;
    4)
        read -p "Enter custom version (e.g., 1.2.3): " new_version
        if ! [[ $new_version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            error "Invalid version format. Must be X.Y.Z"
        fi
        ;;
    *)
        error "Invalid choice"
        ;;
esac

info "New version will be: $new_version"

# Confirm
echo ""
read -p "Create release $new_version? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    info "Release cancelled"
    exit 0
fi

# Create release branch
release_branch="release/v$new_version"
info "Creating release branch: $release_branch"
git checkout -b "$release_branch"

# Update version in package.json
info "Updating version in package.json..."
update_package_version "$new_version"

# Create or update CHANGELOG.md
changelog_entry="## [$new_version] - $(date +%Y-%m-%d)

### Changes
$(git --no-pager log main..staging --pretty=format:"- %s" | grep -v "Merge branch" || echo "- See commit history for details")
"

if [ -f "CHANGELOG.md" ]; then
    info "Updating CHANGELOG.md..."
    # Insert new entry after the first line (title)
    echo "$changelog_entry" | cat - <(tail -n +2 CHANGELOG.md) > CHANGELOG.md.tmp
    head -n 1 CHANGELOG.md > CHANGELOG.md.new
    cat CHANGELOG.md.tmp >> CHANGELOG.md.new
    mv CHANGELOG.md.new CHANGELOG.md
    rm CHANGELOG.md.tmp
else
    info "Creating CHANGELOG.md..."
    echo "# Changelog" > CHANGELOG.md
    echo "" >> CHANGELOG.md
    echo "$changelog_entry" >> CHANGELOG.md
fi

# Commit changes
info "Committing version bump..."
git add package.json CHANGELOG.md
git commit -m "chore: bump version to v$new_version"

# Push release branch
info "Pushing release branch to remote..."
git push -u origin "$release_branch"

# Create PR
info "Creating Pull Request..."
pr_url=$(gh pr create \
    --base main \
    --head "$release_branch" \
    --title "Release v$new_version" \
    --body "## Release v$new_version

### Deployment
This release will deploy:
- \`newflowio/elova:latest\`
- \`newflowio/elova:v$new_version\`

### Changes
$changelog_entry

---
**After merging**: Create a GitHub Release with tag \`v$new_version\`" \
    2>&1 | grep -o 'https://[^ ]*' || echo "")

if [ -n "$pr_url" ]; then
    info "Pull Request created: $pr_url"
else
    warn "Could not extract PR URL, but PR may have been created successfully"
fi

echo ""
info "✓ Release process started successfully!"
echo ""
echo "Next steps:"
echo "  1. Review and merge the PR: ${pr_url:-Check GitHub}"
echo "  2. After merge, create GitHub Release:"
echo "     gh release create v$new_version --title \"v$new_version\" --notes-file CHANGELOG.md --target main"
echo "  3. The CI will automatically:"
echo "     - Build and push newflowio/elova:latest"
echo "     - Build and push newflowio/elova:v$new_version"
echo "  4. Sync changes back to staging:"
echo "     git checkout staging && git merge main && git push origin staging"
echo ""
