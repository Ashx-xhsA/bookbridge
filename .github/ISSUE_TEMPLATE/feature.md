---
name: Feature
about: New feature or enhancement
title: ''
labels: ''
assignees: ''
---

## Description
<!-- What does this feature do? -->

## Acceptance Criteria
<!-- Testable conditions that define done -->
- [ ] 
- [ ] 

## Security Definition of Done
<!-- Must check ALL boxes before closing this issue -->

**Authentication & Authorization**
- [ ] All new API routes call `auth()` and return 401 if unauthenticated
- [ ] Resource-by-ID routes check `resource.ownerId === userId` (return 403 if mismatch)

**Input Validation**
- [ ] All request inputs validated with a Zod schema before use
- [ ] No user-controlled values passed to shell commands or dynamic evaluation

**Secret Hygiene**
- [ ] No API keys, tokens, or passwords hardcoded in any file
- [ ] Error messages do not expose stack traces, DB errors, or internal paths to client

**Data Exposure**
- [ ] API responses only return fields the caller needs
- [ ] Logs contain no PII, secrets, or session tokens

**Dependencies**
- [ ] `npm audit` passes with no high/critical vulnerabilities
- [ ] Any new packages verified as real (not AI-hallucinated) on npm/PyPI

## Notes
