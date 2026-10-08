# Restore PR 36 mobile dependency compatibility

Restore the compatible mobile SDK graph and remove the high/critical audit regression without weakening security policy or reverting web fixes.

## Scope and authorization

- User authorized local implementation and verification on `feat/mobile-complete-reviewed`; no push or remote mutation.
- Base boundary: `7db843373cb9db06fac89db1df1569020cab131e`.
- Source surfaces: `apps/mobile/package.json`, `package-lock.json`.
- Tracking surface: `odd/tasks/pr36-dependency-alignment.md`.
- Preserve web Next 16.4.0 and all existing advisory-specific exceptions. Do not add exceptions or modify application code.

## Work unit

- [ ] T1: Restore SDK-compatible mobile declarations, regenerate the root lock, clean-install and verify the resulting graph; commit the coherent fix locally.
  - Route: delegated direct; two non-trivial dependency files and preparation for writing trigger a bounded writer.
  - Test-first: use the actual production audit as RED, dependency alignment as GREEN, then existing regression checks. No artificial application test is needed for dependency-only remediation.
  - Acceptance: no unexcepted high/critical findings; Expo compatibility check passes; web and mobile checks pass, or failures are explicitly recorded without claiming completion.
  - Rollback boundary: the mobile manifest and generated root lock only.

## Applicable checks

1. `npm ci` from the root, after lock regeneration.
2. `node --test .github/scripts/audit-production-dependencies.test.mjs`.
3. `node .github/scripts/audit-production-dependencies.mjs` with the existing supported Windows npm CLI path override.
4. `npm run lint --workspace @wok/web`, `npm run typecheck --workspace @wok/web`, `npm run test --workspace @wok/web`, `npm run build --workspace @wok/web`.
5. `npm run lint --workspace mobile`, `npm run typecheck --workspace mobile`, `npm run test --workspace mobile`.
6. `npx --no-install expo install --check` from `apps/mobile`, with `CI=1`.
7. Parent spot check: repeat the production audit gate after writer verification.
8. Native risk assessment and review routing under the current user-owned RDD mode (on).

## Progress and evidence

- Exploration: PR36 HEAD matches the clean checkout. Expo was downgraded from ~57 to ^44, RN from 0.86 to ^0.72, NativeWind from 4 to 2, and Tailwind from 3 to 4.
- Observed RED: previous read-only lock audit reported 39 high and 1 critical findings, with 14 blocked package names. Audit classifier tests: 6/6 pass.
- Existing node_modules is stale relative to the committed lock; clean installation is required.
- Restored the prior SDK 57 stack, removed the unintended mobile Next dependency, and aligned `expo-constants`, `expo-linking`, and `expo-router` patch declarations with Expo 57.0.27's bundled recommendations.
- Standard lock regeneration first failed on obsolete Router 58 optional peers. Removing only 118 obsolete mobile-local lock entries and synchronizing the workspace declaration allowed `npm install --package-lock-only --ignore-scripts` to pass without peer-validation bypasses.
- Regenerated graph: Expo 57.0.27, Router 57.0.25, React Native 0.86.3, NativeWind 4.2.7, Tailwind 3.4.19, Reanimated 4.5.1, mobile Worklets 0.10.1, and mobile React/React DOM 19.2.3. Web Next remains 16.4.0; existing root Undici 7.29.1, Node Fetch 2.7.0, and Semver 7.8.5 are preserved.
- Observed fresh audit RED: exit 1, 61 production findings (39 high, 1 critical), with 14 unexcepted blockers. GREEN and repeated final audit: exit 0, 36 production findings (15 moderate, 21 high, 0 critical), with no unexcepted blockers. The only direct high advisories are the existing documented `node-forge` and `braces` exceptions; no exceptions were added.
- Required clean installation failed: `npm ci` returned EPERM / exit -4048 while unlinking `node_modules/.react-native-css-interop-whUmiTYU/node_modules/lightningcss-win32-x64-msvc/lightningcss.win32-x64-msvc.node`. The file is not read-only. Read-only process-module inspection found no confirmed owner. No processes were terminated or locked binaries deleted.
- Status: implementation and independent clean-snapshot checks verified; original installation remains incomplete. Commit: pending. Native assessment: high/unassessable before commit due untracked tracking inventory; committed-candidate assessment pending.
- Mirror: Engram topic `odd/pr36-dependency-alignment/tasks`.

### Observed verification

| Command | Result |
| --- | --- |
| `npm install --package-lock-only --ignore-scripts` | Exit 0 after targeted stale-entry removal. |
| `npm ci` | Exit -4048 / EPERM on the native binary named above; installation incomplete. |
| `node --test .github/scripts/audit-production-dependencies.test.mjs` | Exit 0; 6/6 tests pass. |
| `node .github/scripts/audit-production-dependencies.mjs` | Exit 0; no unexcepted high/critical findings. |
| `npm run lint --workspace @wok/web` | Exit 1; `eslint` missing after incomplete installation. |
| `npm run typecheck --workspace @wok/web` | Exit 1; `tsc` missing after incomplete installation. |
| `npm run test --workspace @wok/web` | Exit 1; `vitest` missing after incomplete installation. |
| `npm run build --workspace @wok/web` | Exit 1; `next` missing after incomplete installation. |
| `npm run lint --workspace mobile` | Exit 1; `eslint` missing after incomplete installation. |
| `npm run typecheck --workspace mobile` | Exit 1; `tsc` missing after incomplete installation. |
| `npm run test --workspace mobile` | Exit 1; 8 test files cannot load missing `jiti`, `typescript`, or `tailwindcss/loadConfig`. |
| `CI=1 npx --no-install expo install --check` | Exit 1; missing local Expo CLI triggered a registry lookup that failed with sandbox ENOTFOUND. No compatibility verdict. |
| `git diff --check` | Exit 0. |

Runtime boundary: clean-install-dependent checks are unavailable, not accepted application failures. Device/native smoke testing was not authorized. Rollback affects only the mobile manifest and regenerated lock; tracking preserves the observed evidence.

## Delivery

- Strategy: ask-on-risk. Forecast: fewer than 100 authored changed lines; generated lockfile changes excluded from the authored forecast.
- One dependency work unit; no PR creation or publishing. Device/native smoke testing is outside this local fix and remains unverified.

## Next step

Record independent proof, perform the parent audit spot check, commit the coherent local fix, and follow native committed-candidate review routing. No push. Original worktree installation recovery and device smoke testing remain separate.

## Independent clean-install proof

Verified identical candidate bytes in `C:/Users/Tomy/Desktop/ProyAsian/pr36-verify-local`, a tracked archive of base HEAD with only the mobile manifest and root lock overlaid. Original files and processes were not changed by verification.

- `npm ci --registry=https://registry.npmjs.org`: exit 0, 1,050 packages installed without peer bypasses or lock mutation.
- Audit classifier: exit 0, 6/6 tests. Production audit gate: exit 0, no unexcepted high/critical findings.
- Web lint, typecheck, tests (60 files / 389 tests), and build: all exit 0.
- Mobile lint, typecheck, tests (70 tests), and Expo compatibility check: all exit 0.
- Manifest SHA256: `258BAC4538DB93A27F5A9625FFEEFD616AE8AB61F9D62E77FB5666C036E92944`.
- Root lock SHA256: `468079DB2D19D155D9EB44DB7EC08EDDD69A8C5E1209D3E4DDA78E57DCEF978D`.
- Web Next remains 16.4.0; Expo 57.0.27 and RN 0.86.3; no obsolete mobile Expo 44/RN 0.72 nodes or nested mobile lock.
- Full-install audit reports 38 findings (15 moderate, 23 high); production gate uses existing exceptions and does not imply zero vulnerabilities.
- Next build regenerated snapshot-only `apps/web/next-env.d.ts`; original candidate source stayed unchanged.
- Original `node_modules` is incomplete after EPERM; no process termination or locked binary deletion was authorized or performed.
- Parent audit spot check in the original checkout: exit 0; no unexcepted high/critical findings.
