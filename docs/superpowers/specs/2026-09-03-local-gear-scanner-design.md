# Local Gear Screenshot Scanner Design

## Goal
Add an experimental, fully local screenshot scanner to the Gear screen so a user can choose a Storage Hunters gear screenshot, OCR it on-device, review/correct the extracted item, and then use the existing Analyse & add flow.

## Scope
- Gear screenshots only: Head, Back, Wrist items.
- Local browser processing only. No screenshot or OCR text is uploaded anywhere.
- OCR engine is lazy-loaded only after the user selects a screenshot.
- Parse item name, slot, normal numeric stats, authenticated state, authentication effect/value when visible.
- Always show a confirmation/review sheet before the existing GearEditor/add flow.
- Never save OCR output automatically.
- Preserve all Algorithm 1.1 scoring, certificate, vehicle, trophy, storage and legacy Alien behaviour unchanged.

## Architecture
Create a focused `src/scanner/` subsystem. `parser.ts` is deterministic and testable: it normalises noisy OCR text, fuzzy-matches known labels, extracts signed percentages, uses OCR line geometry to prefer the large gear tooltip over small duplicate stat text elsewhere in the screenshot, infers slot hints, detects authentication, and returns field-level confidence/warnings. `ocr.ts` owns browser-only image preprocessing and lazy-loads Tesseract.js when scanning begins. `GearScanner.tsx` owns the file picker, progress, preview, raw OCR text and confirmation UI. `App.tsx` only opens the scanner and converts a confirmed scan into the existing GearEditor draft; the existing validation and `commitItem` flow remains the sole save path.

## Privacy and UX
The scanner sheet must state that processing is local and the image is not uploaded. It accepts common iPhone screenshot/photo formats exposed by the browser (`image/*`). While OCR runs it shows progress and allows cancellation/closing after the operation returns. Parsed fields are editable in the standard GearEditor before save. Low-confidence/missing fields are visibly flagged and do not bypass validation.

## OCR strategy
Use Tesseract.js with English recognition, lazy-loaded via dynamic import. Before recognition, draw the selected image into a canvas and constrain the long edge to approximately 2200 px. Keep the colour canvas for preview/authentication classification and create a separate high-contrast grayscale canvas for OCR. Request Tesseract's `blocks` output so each recognised line has a bounding box. The parser prefers the largest spatial cluster of recognised gear-stat lines, which rejects the game's much smaller TOTAL BONUSES text. Each selected line's original pixels are sampled: green text is treated as a base stat and blue text as the separate authentication roll. This keeps processing local and improves game UI text readability without affecting normal app startup.

## Parsing rules
Recognise these normal stats and aliases:
- Luck
- Energy Drink Time / Energy
- Tip Chance / Tip
- Walkspeed / Walk Speed / Walk
- Vehicle Speed / Vehicle
- Bid Recovery / Recovery
- Bid Zone Width / Zone Width / Zone
- Bid Arrow Speed / Bid Arrow Reduction / Arrow Speed / Arrow
- NPC Offers Bonus / NPC Offer Bonus / NPC Offers / NPC

Game-displayed Bid Arrow Speed is normally negative; parser stores it internally as positive `arrowReduction`. Other stats preserve their sign.

Recognise normal authentication effects from the app's active auth vocabulary plus slot-exclusive passives. In real accessory tooltips the blue stat line is treated as the separate authentication roll; textual `Auth` / `Authenticated` markers remain a fallback for OCR text without colour metadata. The parser must not create a new Alien authentication; legacy Alien text is surfaced as a warning for manual review.

Slot inference is conservative: explicit `Head`, `Back`, `Wrist` text wins; otherwise known item-name suffixes such as Dominus/Valk/Helm suggest Head, Backpack/Vest suggest Back, and Wristband suggests Wrist. If uncertain, default draft slot to Head but add a warning requiring review.

## Confidence
Return overall confidence as High/Medium/Low plus field confidences. High requires a non-empty item name plus at least one recognised stat and no unresolved numeric ambiguity. Medium allows a missing slot or authentication uncertainty. Low covers no item name, no recognised stats, or conflicting parses.

## Release
Bump package version to 1.5.0. Add Tesseract.js as a runtime dependency. Add scanner documentation to README. No schema migration is required because no scanner state is persisted.
