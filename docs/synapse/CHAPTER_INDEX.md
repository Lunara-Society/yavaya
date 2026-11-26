# Chapter index

| Chapter | Title | Authorised | Status | Checkpoint |
| --- | --- | --- | --- | --- |
| 00 | Master directive and persistent project memory; Android app connected to EAS | 26 Nov 2026 | Done, with open items in [KNOWN_ISSUES.md](KNOWN_ISSUES.md) | see the commit that adds this file |
| 01 | Proposed: Synapse foundation, see [NEXT_CHAPTER.md](NEXT_CHAPTER.md) | not yet | Not started | — |

A chapter is marked done only when its end-of-chapter record exists in these
files and its claims are backed by tests or measurements in
[TEST_REPORTS.md](TEST_REPORTS.md) and [PERFORMANCE_BUDGET.md](PERFORMANCE_BUDGET.md).

## Chapter 00: what was delivered

- `docs/synapse/`, the twelve memory files, with the master directive stored
  word for word.
- `mobile/`, the first mobile codebase: an Expo app that opens yavaya.lat in a
  native Android frame, linked to the existing EAS project (no duplicate
  created), with development, preview and production build profiles.
- `.easignore` at the repository root, so EAS uploads only `mobile/`.
- The Android upload keystore, generated and stored by EAS on the first build.
- The first preview APK (see [TEST_REPORTS.md](TEST_REPORTS.md) for the build
  and its link).
- Not done in Chapter 00, by the directive: no redesign, no replacement of the
  production website, nothing published to Google Play.
