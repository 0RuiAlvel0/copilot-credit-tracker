# Change Log

All notable changes to the "copilot-credit-tracker" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.1.5]

- This one adds the refresh time (time interval between requests to the GH API so you can change how fast your usage is updated). Still under tests to confirm this is workign as expected, sometimes it will not update in time, not sure why.
- 0.1.4 was only a minor adjustment, so no change log for that.

## [0.1.3] - 2026-09-04

- Corrected the release after the wrong version was previously compiled and published.

## [0.1.2] - 2026-09-03

### Changed

- Updated the README for improved clarity and a more complete project overview.
- Sorted the usage breakdown in the details panel (solves issue #1).

## [0.1.1] - 2026-08-01

### Changed

- Bumped extension version in `package.json` to `0.1.1` due to some issues on getting the version to update on the marketplace. No code changes were made in this release.

## [0.1.0] - 2026-08-01

### Added

- Added `src/history.ts` with history management helpers for usage tracking.

### Changed

- Refactored the command flow in `src/extension.ts` to show a more detailed usage breakdown in Copilot Credit Tracker.
- Bumped extension version in `package.json` to `0.1.0`.

### Tests

- Expanded test coverage in `src/test/extension.test.ts` for the new history behavior and detailed breakdown flow.

## [0.0.4] - 2026-07-16

### Changed

- Refresh the status bar usage data every 30 minutes (previously every hour).
- Updated extension version to `0.0.4`.

## [0.0.3] - 2026-07-16

### Added

- Initial public release.