# CLAUDE.md -- OptoKVA Web Prototype

## What You Are Building

A clinical visual acuity and contrast sensitivity testing web application called **OptoKVA**. It is a single React .jsx file that implements ISO-standard Landolt C optotype testing with an adaptive psychophysical staircase, contrast sensitivity profiling, and research-grade data export.

**Read SPEC_OPTOKVA_WEB.md completely before writing any code.** It is the authoritative specification. Every formula, step size, threshold criterion, and data field is defined there. Implement them exactly.

---

## Critical Rules

### Mathematics -- if these are wrong the instrument is clinically useless

1. **The GAP subtends 1 MAR, not the full diameter.** Gap = D/5. Therefore D = 5 * gapMeters. Do NOT use the diameter angle as MAR.
2. MAR = 10^logMAR. LogMAR 0.0 = normal (MAR 1 arcmin). Negative = better. Positive = worse.
3. Sizing pipeline (7 steps): logMAR -> MAR -> angleRad -> gapMeters -> D_meters -> D_mm -> D_pixels. See spec Section 2.2. Do not simplify or rearrange.
4. Weber contrast: `targetGray = Math.round(255 * (1 - C))`. At C=1.0 -> 0 (black). At C=0.005 -> 254.
5. LogMAR range is -0.60 to 1.00. Clamp all staircase steps to this range.
6. Snellen at distance d: denominator = d * MAR, display as `${d}/${denominator.toFixed(1)}`.

### Landolt C rendering -- must match ISO standard

1. **Single filled path** from two arcs + two straight edges. NOT a stroked circle. NOT a circle with an overlay rectangle.
2. Gap is a **square** cutout with parallel edges. Not a wedge or pie slice.
3. Base orientation: gap faces RIGHT. Apply rotation for other orientations.
4. **Canvas arc direction is named opposite to SwiftUI but produces the same visual result when using the same boolean values:**
   - Outer arc: `ctx.arc(0, 0, R, thetaOuter, -thetaOuter, false)` -- CW on screen, the long way around
   - Inner arc: `ctx.arc(0, 0, r, -thetaInner, thetaInner, true)` -- CCW on screen, the long way around
   - Get this wrong and the shape is inside-out. Test visually.
5. Fill inner circle with backgroundColor. Do not leave transparent.
6. **HiDPI/Retina:** Set canvas width/height attributes to `displaySize * devicePixelRatio`. Scale context by DPR. Set CSS dimensions to displaySize. Without this, the optotype is blurry.

### Staircase algorithms -- match the spec precisely

**VA100:**
- Start logMAR 1.0. Descent step: -0.50. Reversal steps: +0.25, +0.20, +0.15, +0.10, +0.05. Confirmation: 5 trials, >= 3/5 pass. Fine steps: +/- 0.05 in confirmation phase. Hard limit: 60 trials.

**Contrast-VA:**
- Start at VA100 + delta (delta table in spec 5.2). Descent step: -0.10. Confirmation: 3 trials, >= 2/3 pass. Step up on fail: +0.05. Monotonic guardrail. Hard limit: 20 trials per contrast.

**Do NOT mix up step sizes between the two staircases.**

### Data integrity

1. Every trial logs: trial number, timestamp, logMAR, diameter_px, orientation presented/responded, correct, RT ms, timeout, contrast, eye condition, distance, screen calibration, manual override flag.
2. RT measured via `performance.now()` at stimulus onset and button press.
3. **Inter-trial interval: 500ms blank screen.** Do not skip.
4. CSV must be valid and open in Excel. Quote fields containing commas. Numbers unquoted.
5. No consecutive orientation repeats.
6. Static phase has no response timeout (unlimited time). Store `CONFIG.RESPONSE_TIMEOUT_MS = null` for static; this becomes 1000ms when motion phase is added later.
7. Per-contrast summary must include mean and median RT (aggregated from individual trial records for that contrast level).
8. Examiner can manually set logMAR (override). All subsequent trials until override ends are flagged `isManualOverride: true` in trial data.

---

## Architecture

### Single .jsx file with 8 labelled sections

```
SECTION 1: CONSTANTS
  - ORIENTATIONS object (8 entries with angle and label)
  - CONFIG object (all numeric parameters: steps, limits, contrasts, deltas)
  - EYE_CONDITIONS array

SECTION 2: VISION MATH
  - diameterPixels(logMAR, distanceM, screenHeightMm, screenHeightPx)
  - logMARtoMAR(logMAR)
  - logMARtoDecimalVA(logMAR)
  - logMARtoSnellen(logMAR, distanceM)
  - snellenToLogMAR(denom, num)
  - contrastToGray(contrast)  // returns integer 0-255
  - clampLogMAR(logMAR)       // clamp to CONFIG range

SECTION 3: VA100 ENGINE
  - createVA100State() -> state object
  - va100ProcessResponse(state, isCorrect, rtMs) -> new state
  - va100GetNextTrial(state) -> { logMAR, orientation }
  - va100IsComplete(state) -> boolean
  - va100GetResult(state) -> result object

SECTION 4: CONTRAST-VA ENGINE
  - createContrastState(va100LogMAR) -> state object
  - contrastProcessResponse(state, isCorrect, rtMs) -> new state
  - contrastGetNextTrial(state) -> { logMAR, contrast, orientation }
  - contrastIsComplete(state) -> boolean
  - contrastGetResults(state) -> array of per-contrast results

SECTION 5: LANDOLT C CANVAS RENDERER
  - LandoltCCanvas component: props = { diameter, orientation, ringColor, bgColor, innerColor }
  - Uses useRef for canvas, useEffect for drawing
  - Handles HiDPI scaling

SECTION 6: CSV EXPORT
  - generateTrialCSV(session, trials) -> string
  - generateSummaryCSV(session, va100Result, contrastResults) -> string
  - downloadCSV(csvString, filename)

SECTION 7: UI COMPONENTS
  - SetupScreen: form, calibration check, start button
  - TestScreen: display area + compass input + examiner strip
  - ResultsScreen: chart + table + export buttons
  - CompassInput: 8 directional buttons + centre pass button
  - ExaminerStrip: state display + controls
  - MathVerifier: debug panel showing computed vs expected values
  - RendererGallery: all 8 orientations at 3 sizes

SECTION 8: MAIN APP
  - useReducer for app state
  - Screen routing via state.screen
  - Keyboard event listener (useEffect)
  - Audio feedback (useRef for AudioContext)
```

### Engine design -- pure functions, no React

All engine functions take a state object and return a new state object. No hooks, no DOM, no side effects. This makes them testable and directly portable to Swift.

### State shape

```javascript
{
  screen: 'SETUP' | 'TESTING_VA100' | 'TESTING_CONTRAST' | 'RESULTS',
  session: { sessionId, subjectId, eyeCondition, distanceM, screenHeightMm, screenHeightPx, startTime, deviceDesc, notes },
  va100State: { /* engine state object */ },
  contrastState: { /* engine state object */ },
  currentTrial: { logMAR, contrast, orientation, onsetTime, awaiting },
  trials: [],
  va100Result: null,
  contrastResults: [],
  audioEnabled: true,
  showExaminer: true
}
```

---

## Build Order (strict -- complete each before starting the next)

### Step 1: Math + Renderer + Test Harness
Build SECTIONS 1, 2, 5. Output: a page with sliders for logMAR/distance/screenHeight that renders a Landolt C at computed size, shows all calculated values, and includes a gallery of all 8 orientations at 3 different sizes. Verify 3+ values against the reference table in spec Section 2.6.

### Step 2: Setup + VA100
Build SECTIONS 3, 7 (SetupScreen, CompassInput, TestScreen partial), 8 (partial). Output: complete setup -> VA100 test -> result display flow. Staircase converges, examiner strip shows state, compass input records responses with RT.

### Step 3: Contrast-VA
Build SECTION 4, extend TestScreen. Output: contrast sweep runs after VA100. Ring colour changes. Guardrail fires. Experimental tagging works. Progress indicator.

### Step 4: Results + Export
Build SECTIONS 6, 7 (ResultsScreen). Output: chart, table, both CSV downloads, new test flow.

### Step 5: Polish
Add: audio, keyboard shortcuts, examiner overrides with isManualOverride flagging, iPad-responsive layout, edge case guards.

---

## Technology

- `import { useState, useReducer, useEffect, useRef, useCallback, useMemo } from "react"`
- Tailwind CSS utility classes for layout
- `import { LineChart, XAxis, YAxis, CartesianGrid, Tooltip, Line, ReferenceLine } from "recharts"` for results chart
- `import { Download, Play, Pause, Settings, Eye, RotateCcw } from "lucide-react"` for icons
- HTML5 Canvas for Landolt C
- Web Audio API (OscillatorNode) for tones
- **No localStorage** (not available in artifact environment)
- **No external API calls**
- **No routing library** -- state-based screen switching

---

## Common Mistakes to Avoid

1. **Arc direction:** Canvas `arc(x, y, r, start, end, counterclockwise)`. The third-to-last param is counterclockwise (true=CCW, false=CW). The outer arc uses `false` (CW on screen). The inner arc uses `true` (CCW on screen). If both arcs go the same direction, the shape is wrong.

2. **LogMAR sign:** SMALLER logMAR = BETTER vision = SMALLER optotype. "Step down" in the staircase means subtract from logMAR (goes more negative). Do not confuse "step down" (harder) with "logMAR increases."

3. **Step size mixing:** VA100 descent = -0.50. VA100 confirmation = +/-0.05. Contrast descent = -0.10. Contrast confirmation up = +0.05. These are four different values.

4. **Contrast at 0.1%:** `Math.round(255 * 0.999)` = 255 = white = invisible on 8-bit display. Test it anyway but tag as experimental. Do not skip it.

5. **Snellen distance:** Snellen denominator depends on the TEST DISTANCE, not always 6. At 18m with logMAR -0.30: "18/9.0" not "6/3.0".

6. **Canvas HiDPI:** Without `devicePixelRatio` scaling, the Landolt C will be blurry on retina displays. This is a visible quality issue that undermines trust in the instrument.

7. **Inter-trial interval:** Must be 500ms of blank white screen. Without it, responses bleed into the next trial and RT is contaminated.

8. **Confirmation vs termination:** VA100 confirmation is >= 3/5 at a level. Passing confirmation at a level means you try the NEXT HARDER level (step -0.05). Failing means you try EASIER (+0.05). Termination is when you've bracketed the threshold: one level passes, the next harder fails.

9. **Monotonic guardrail:** Only applies to contrast-VA phase. If VA at 5% is BETTER than VA at 10%, that's physiologically impossible -- re-test. The tolerance is 0.05 logMAR.

10. **Orientation randomisation:** Do not allow the same orientation on consecutive trials. A simple `while (next === prev) pick again` loop is sufficient.
