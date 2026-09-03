# Local Gear Screenshot Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local-only screenshot-to-gear draft workflow that feeds the existing GearEditor and optimiser.

**Architecture:** Keep OCR, parsing, and UI separated. The deterministic parser is tested directly; the OCR adapter is browser-only and lazy-loads Tesseract.js; App integration converts a confirmed parsed scan into an ordinary `GearItem` draft so existing validation/save behaviour remains authoritative.

**Tech Stack:** React 19, TypeScript 7, Vite 8, Vitest 4, Tesseract.js, Canvas API.

**Spec:** `docs/superpowers/specs/2026-09-03-local-gear-scanner-design.md`

## Global Constraints
- Local processing only; no network upload of screenshots or OCR text.
- Never auto-save scanned data.
- Existing Algorithm 1.1 scoring and storage behaviour must remain unchanged.
- OCR engine must be lazy-loaded only on scanner use.
- Release version: 1.5.0.

---

### Task 1: Deterministic OCR parser

**Files:**
- Create: `src/scanner/types.ts`
- Create: `src/scanner/parser.ts`
- Test: `src/scanner/parser.test.ts`

**Interfaces:**
- Produces: `parseGearOcrText(text:string, visualLines?:GearOcrVisualLine[]): ParsedGearScan`
- Produces: `scanToGearDraft(scan:ParsedGearScan, now?:string): GearItem`

- [x] Write tests for exact stats, noisy aliases, Arrow sign conversion, auth parsing, slot inference, low-confidence warnings, tooltip-vs-TOTAL-BONUSES selection and blue-auth separation.
- [x] Verify RED before implementation using the local Node TypeScript test harness; npm dependencies were not available in the sandbox.
- [x] Implement the parser and draft conversion.
- [x] Re-run scanner parser verification and confirm it passes.

### Task 2: Browser-local OCR adapter

**Files:**
- Create: `src/scanner/ocr.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: browser `File`, Canvas API, dynamic import of `tesseract.js`.
- Produces: `recogniseGearScreenshot(file:File, onProgress?:(progress:number,status:string)=>void): Promise<{text:string; previewUrl:string; lines:GearOcrVisualLine[]}>`

- [x] Add a contract verification proving `ocr.ts` contains a dynamic `import('tesseract.js')`, requests blocks output, and contains no fetch/XHR/WebSocket upload transport.
- [x] Verify the OCR contract fails before `ocr.ts` exists.
- [x] Implement colour-preserving canvas preparation, grayscale OCR preprocessing, line geometry, colour classification and lazy Tesseract recognition.
- [x] Add `tesseract.js` 6.0.1 runtime dependency and bump package version to 1.5.0.
- [x] Re-run local parser/contract verification.

### Task 3: Scanner confirmation UI and App integration

**Files:**
- Create: `src/components/GearScanner.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Test: `src/scanner/uiContract.test.ts`

**Interfaces:**
- `GearScanner` props: `onClose():void`, `onConfirm(item:GearItem):void`.
- App opens scanner from Gear page; confirmed item becomes an add-mode GearEditor draft.

- [x] Add UI contract verification for Scan screenshot, local privacy copy, confirmation action and scanner-to-editor callback.
- [x] Verify the UI contract fails before the scanner component exists.
- [x] Implement `GearScanner` and integrate it into Gear screen/App state.
- [x] Add responsive scanner styles.
- [x] Re-run UI contract and the full 80-test repository suite using the local Vitest-compatible harness.

### Task 4: Documentation and release verification

**Files:**
- Modify: `README.md`

- [x] Document local scanner workflow, privacy, experimental status and confirmation requirement.
- [ ] Run full `npm test`. **Blocked locally:** `npm install` timed out in the sandbox; GitHub Actions must run genuine Vitest after deployment.
- [ ] Run `npm run build`. **Blocked locally:** dependencies could not be installed in the sandbox; GitHub Actions must run the production build.
- [x] Inspect diff for accidental scoring/storage changes; scoring/storage/core-model diff is empty.
- [x] Package full v1.5.0 repository and changed-files archive.
