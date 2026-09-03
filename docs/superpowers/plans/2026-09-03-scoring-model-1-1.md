# Scoring Model 1.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved nonlinear scoring model consistently across optimisation, dominance, certificate targeting, specialists, persistence and settings UI.

**Architecture:** Keep one source of truth in `src/engine/scoring.ts`: piecewise effective-value functions plus full-loadout scoring. Consumers call those functions or re-evaluate complete combinations rather than reproducing scoring maths. Persist the algorithm version and migrate stored v1.0 settings to v1.1.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, IndexedDB/localStorage persistence.

**Spec:** `docs/superpowers/specs/2026-09-03-scoring-model-1-1-design.md`

## Global Constraints

- Preserve all gear, authentication history, vehicle and Gavel data.
- Arrow >100 penalty multiplier is 0.25 effective units, giving -0.3125 score per excess percentage point at Arrow weight 1.25.
- Luck and NPC curves have no cap; their final marginal segments continue indefinitely.
- Conditional Luck passives use the same total-Luck curve.
- Current Alien functionality remains historical-only.

---

### Task 1: Scoring settings and utility curves

**Files:**
- Modify: `src/types.ts`
- Modify: `src/defaults.ts`
- Modify: `src/engine/scoring.ts`
- Test: `src/engine/scoring.test.ts`

**Interfaces:**
- Produces: `luckEffective(luck, settings)`, `npcEffective(npc, settings)`, `expectedConditionalLuck(item, settings)` and version 1.1 `AlgorithmSettings` fields.

- [x] **Step 1: Write failing regression tests** for approved defaults, Arrow >100 behaviour, Luck curve, NPC curve, Zone weight and conditional Luck.
- [x] **Step 2: Run tests and confirm the v1.0 implementation fails those assertions.**
- [x] **Step 3: Add v1.1 fields/defaults and implement the utility functions.**
- [x] **Step 4: Route conditional Luck through the combined Luck curve and run scoring tests green.**

### Task 2: Optimiser and dominance consistency

**Files:**
- Modify: `src/engine/optimizer.ts`
- Modify: `src/engine/dominance.ts`
- Test: `src/engine/optimizer.test.ts`
- Test: `src/engine/dominance.test.ts`

**Interfaces:**
- Consumes: scoring utility functions from Task 1.
- Produces: specialist ranking and dominance proofs consistent with total-score utility.

- [x] **Step 1: Add failing Arrow specialist regression.**
- [x] **Step 2: Rank Arrow specialists with `arrowEffective`.**
- [x] **Step 3: Treat Luck and NPC as piecewise components in dominance and include expected conditional Luck.**
- [x] **Step 4: Run optimiser/dominance tests.**

### Task 3: Certificate thresholds

**Files:**
- Modify: `src/engine/certificates.ts`
- Test: `src/engine/certificates.test.ts`

**Interfaces:**
- Consumes: `evaluateCombination` and the shared scoring engine.
- Produces: minimum Normal-certificate roll thresholds based on full-loadout rescoring.

- [x] **Step 1: Add regression cases for Luck/NPC diminishing-return thresholds and conditional Luck passives.**
- [x] **Step 2: Replace linear Luck/NPC/passive threshold shortcuts with exact piecewise threshold solving using the shared scoring curves.**
- [x] **Step 3: Keep exact nonmonotonic Arrow threshold handling and run certificate tests.**

### Task 4: Stored settings migration and UI

**Files:**
- Modify: `src/data/storage.ts`
- Modify: `src/App.tsx`
- Modify: `package.json`
- Modify: `README.md`
- Test: `src/data/roundtrip.test.ts`

**Interfaces:**
- Produces: automatic v1.0 → v1.1 settings migration while preserving user data.

- [x] **Step 1: Add failing migration regression.**
- [x] **Step 2: Migrate old settings to the approved v1.1 parameters.**
- [x] **Step 3: Add Luck/NPC curve fields and v1.1 explanation to Settings UI.**
- [x] **Step 4: Bump app version and document scoring model 1.1.**

### Task 5: Verification and release artifact

**Files:**
- Verify all repository tests and TypeScript production build.
- Package the complete repository ZIP and unified patch.

- [x] **Step 1: Dependency installation was unavailable in the sandbox; all 71 repository tests passed through the local Vitest-compatible runner.**
- [x] **Step 2: Run a TypeScript application verification using temporary dependency type stubs because npm dependencies could not be installed.**
- [x] **Step 3: Attempt dependency installation/build; `npm install` timed out in the sandbox, so GitHub Actions remains the real production-build gate.**
- [x] **Step 4: Run diff/whitespace checks and remove temporary test infrastructure.**
- [x] **Step 5: Create release ZIP and patch.**
