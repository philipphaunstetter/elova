# Warp + Linear Quick Reference Card

## When Tagging @Warp in Linear

### Elova Sales Website Project
**Target Repos:** `elova-sales` OR `elova-documentation`

```
@Warp [your task] - work in elova-sales
@Warp [your task] - work in elova-documentation
@Warp [your task] - update elova-sales and elova-documentation
```

**Examples:**
- `@Warp Add pricing calculator to sales page - work in elova-sales`
- `@Warp Update API reference docs - work in elova-documentation`
- `@Warp Add new case study to sales and docs - update elova-sales and elova-documentation`

---

### Elova 1.0 Project
**Target Repos:** `elova` OR `elova-validation`

```
@Warp [your task] - work in elova
@Warp [your task] - work in elova-validation
@Warp [your task] - update elova and elova-validation
```

**Examples:**
- `@Warp Fix dashboard time period bug - work in elova`
- `@Warp Add email validation logic - work in elova-validation`
- `@Warp Implement new validation flow across app and service - update elova and elova-validation`

---

## Branch Naming (Auto-Applied by Warp)

```
feature/<LINEAR-ID>-<description>
fix/<LINEAR-ID>-<description>
```

Examples:
- `feature/PRO-54-add-pricing-calculator`
- `fix/PRO-55-dashboard-time-bug`

---

## Commit Format (Auto-Applied by Warp)

```
<type>(<LINEAR-ID>): <description>
```

Examples:
- `feat(PRO-54): add pricing calculator component`
- `fix(PRO-55): resolve dashboard time period selection`

---

## Environment Info

**Environment:** `elova` (q0uMESnZo0PQ6RUMEFsn5A)  
**All Repos Available:**
- philipphaunstetter/elova
- philipphaunstetter/elova-validation
- philipphaunstetter/elova-sales
- philipphaunstetter/elova-documentation

---

## Quick Commands

```bash
# View environment details
warp environment get q0uMESnZo0PQ6RUMEFsn5A

# Check integration status
warp integration list

# Add new repo to environment
warp environment update q0uMESnZo0PQ6RUMEFsn5A \
  --repo "philipphaunstetter/new-repo" \
  --setup-command "cd new-repo && npm ci" \
  --force
```

---

## Troubleshooting

**Warp worked on wrong repo?**
→ Make sure you explicitly mentioned the repo name in your @Warp comment

**Need to switch repos mid-task?**
→ Comment again with new repo context: `@Warp Continue in elova-documentation instead`

**PR went to wrong repo?**
→ Close the PR and re-tag Warp with explicit repo mention
