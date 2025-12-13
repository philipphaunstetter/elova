# Changelog

All notable changes to the Elova project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- About Elova section in profile dropdown with version information (PRO-53)
- API endpoint `/api/about` for retrieving application metadata
- Automated release management system with version bumping
- GitHub Actions workflow for automatic release creation and tagging
- Release script (`scripts/release.sh`) for streamlined release process

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
