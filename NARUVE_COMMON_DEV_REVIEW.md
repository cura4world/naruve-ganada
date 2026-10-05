# Naruve Common Development Principles Review

Source of truth:
https://github.com/cura4world/naruve-hq/blob/main/strategy/NARUVE_COMMON_DEVELOPMENT_PRINCIPLES.md

This file is a project review pointer, not a replacement for this repository's canonical technical decisions.

## Ganada priority checks
- secret / API key handling and leak response
- audio/image delivery optimization
- official CLI for deployment/log inspection where useful
- cost guardrails and usage alerts
- test/security/release-state separation

For each relevant principle classify: APPLY / ALREADY_APPLIED / NOT_APPLICABLE / DEFER.

Do not replatform stable infrastructure solely to standardize vendors. Record meaningful adopted decisions in the project canonical docs / LAB_STATUS.
