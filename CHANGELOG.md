# Changelog

All notable changes to this extension are documented in this file.

## 2026-04-08

- Added missing custom-node detection for the currently open workflow.
- Added a yellow warning button between `Download` and `Upload` when missing nodes are detected.
- Added a missing-nodes modal with node status, source links, and manual Git URL inputs when source is unavailable.
- Added backend routes to analyze workflow dependencies and install missing nodes through `comfy node install`.
- Added bulk install flow for missing nodes with restart prompt integration.
- Added live per-node install progress for missing-node installs (current target, completed/total, success/failure counts, and progress bar).
- Added successful missing-node installs to the Downloads accordion history.

## 2026-04-05

- Added an `Upload` button to the downloader modal.
- Added support for cloning `.git` URLs directly into `custom_nodes` instead of downloading.
- Cloned `.git` repositories now automatically install their `requirements.txt` dependencies by default (when present).
- Added a Restart button
