# CHANGELOG Management Guide

## Problem
The `CHANGELOG.md` file causes merge conflicts on nearly every PR because multiple feature branches modify the same section (usually `[Unreleased]`), creating conflicts when merging to `staging`.

## Solutions Implemented

### 1. Git Attributes (Automated Solution)
We've added a `.gitattributes` file that configures Git to use the "union" merge strategy for `CHANGELOG.md`:

```gitattributes
CHANGELOG.md merge=union
```

**What this does:**
- Automatically combines changes from both branches
- Reduces manual conflict resolution
- Still requires occasional cleanup for duplicate entries

**Limitations:**
- May result in duplicate entries that need manual cleanup
- Doesn't guarantee perfect formatting

### 2. Recommended Workflow Options

Choose **ONE** of these approaches for your team:

#### Option A: Update CHANGELOG in PRs (Current Approach)
✅ **Pros:** Complete changelog at all times  
❌ **Cons:** Frequent conflicts (mitigated by `.gitattributes`)

**Process:**
1. Create feature branch from `staging`
2. Update `CHANGELOG.md` with your changes in `[Unreleased]` section
3. If conflicts occur during PR, resolve by merging both entries
4. The `.gitattributes` file will help auto-merge most cases

#### Option B: Update CHANGELOG Only on Staging (Recommended)
✅ **Pros:** Zero conflicts during feature development  
❌ **Cons:** Requires discipline to update before release

**Process:**
1. **In feature branches:** Do NOT update CHANGELOG.md
2. **Before merging to staging:** Update CHANGELOG in a separate commit
3. **Or**: Update CHANGELOG directly on staging after merge
4. **Before release:** Ensure all changes are documented

#### Option C: Automated CHANGELOG from PR Descriptions
✅ **Pros:** No manual updates, zero conflicts  
❌ **Cons:** Requires tooling setup, less control over formatting

**Process:**
1. Use conventional commits in PR titles: `feat:`, `fix:`, `chore:`, etc.
2. Use tools like `conventional-changelog` to auto-generate
3. Run during release process to create CHANGELOG entries

## Immediate Action Items

### For the Team
1. **Decide on approach:** Discuss which option (A, B, or C) fits your workflow
2. **Document in WARP.md:** Add the chosen process to project rules
3. **Update PR template:** Include CHANGELOG guidelines if choosing Option A

### For Warp Agent
The `.gitattributes` file has been added to reduce conflicts. When creating PRs:
- **If using Option A:** Always branch from latest `staging` and update CHANGELOG
- **If using Option B:** Skip CHANGELOG updates in feature branches
- **If using Option C:** Use conventional commit format in PR titles

## Example CHANGELOG Entry Format

```markdown
## [Unreleased]

### Added
- About Elova section in profile dropdown (PRO-53)
- New API endpoint for version information

### Fixed
- Dashboard time period calculation (PRO-51)

### Changed
- Updated local test script to use rsync
```

## Testing the Solution

After adding `.gitattributes`, test with these commands:

```bash
# Check merge strategy
git check-attr merge CHANGELOG.md
# Should output: CHANGELOG.md: merge: union

# Simulate a merge
git merge --no-commit --no-ff <branch>
# Check if CHANGELOG.md auto-merges
```

## Further Reading
- [Git Attributes Documentation](https://git-scm.com/docs/gitattributes)
- [Keep a Changelog](https://keepachangelog.com/)
- [Conventional Commits](https://www.conventionalcommits.org/)
