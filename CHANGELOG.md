# Changelog

All notable changes to the Elova project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2025-12-13

### Changes
- feat: Add About Elova section to profile dropdown (PRO-53) (#16)

## [0.2.0] - 2025-12-13

### Changes
- feat: add automated release management system
- Fix: Status Distribution Chart bar alignment (#13)
- Fix: Dashboard time period selection not working correctly (#12)
- Fix: Dashboard time period calculation bug (PRO-51) (#11)
- Updaated test behavior
- chore: upgrade test-local.sh to use rsync and git root (#9)
- chore: update WARP.md and local test script (#6)
- Merge pull request #5 from philipphaunstetter/fix/n8n-demo-height
- chore(ci): normalize workflow filename to docker-ci.yml
- fix(n8n-demo): ensure full height for embedded workflow

## [0.1.0] - 2024-12-13

### Added
- Initial release of Elova
- Dashboard with workflow monitoring
- Time period selection for analytics
- n8n integration via setup wizard
- Demo mode for testing
- Docker containerization with multi-architecture support (amd64/arm64)
- SQLite database with configuration storage
- Local testing script for development

### Fixed
- Dashboard time period selection not working correctly (#12)
- Dashboard time period calculation bug (PRO-51) (#11)
- n8n demo workflow height display (#5)

### Changed
- Updated local test script to use rsync and git root (#9)
- Normalized CI workflow filename to `docker-ci.yml`
