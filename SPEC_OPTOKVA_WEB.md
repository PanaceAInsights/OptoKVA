# OptoKVA Web Prototype -- Comprehensive Specification

**Version:** 2026-04-08 (final)
**Purpose:** Build a fully functional web-based prototype of the OptoKVA clinical visual acuity and contrast sensitivity testing system. This prototype validates all clinical logic, adaptive algorithms, rendering, and data export before native iOS implementation. It also serves as a shareable demo for the clinical collaborator (accessible via URL, no Xcode needed).
**Stack:** React (single-file .jsx), Tailwind CSS, recharts for charts, lucide-react for icons. No other dependencies.
**Authoritative clinical source:** SPEC_KVA_PHASE1.md (Nov 2025). Where this document and that spec conflict on clinical parameters, SPEC_KVA_PHASE1.md wins.

---

## 1. PROJECT CONTEXT

### 1.1 What this is
A clinically accurate visual acuity and contrast sensitivity testing instrument for professional cricket players. Comparable in measurement quality to Kowa AS-4 and AS-28 devices but more flexible, faster, data-richer, and portable to any screen at any distance. A key use case is validating the instrument against standard Snellen wall charts (e.g. test at 6m, compare results to the chart on the wall).

### 1.2 Why web first
- Can be built, run, and iterated end-to-end with Claude Code
- Clinical collaborator sees it via URL without Xcode or simulators
- All core logic (math, staircases, contrast, data model, export) is identical in web vs native -- porting to Swift is mechanical
- Touch input works on iPad Safari for initial validation

### 1.3 Clinical population
Professional and state-level cricket players with supranormal vision (6/3 or better unaided). The system must handle logMAR range **-0.60 to 1.00** (approximately 6/1.5 to 6/60). Standard VA charts cannot differentiate within the sub-normal range; this instrument can.

### 1.4 Testing distances
Any operator-entered distance. Key distances:
- 6m (standard clinical, useful for Snellen wall-chart validation)
- 9m, 12m, 15m (extended clinical)
- 18m (cricket pitch distance, bowler to batsman -- primary use case)

---

## 2. CORE MATHEMATICS (NON-NEGOTIABLE)

These formulas are canonical. Do not simplify, approximate, or rearrange.

### 2.1 Definitions

```
LogMAR = log10(MAR)
MAR = 10^LogMAR                         // Minimum Angle of Resolution in arcminutes
DecimalVA = 1 / MAR
Snellen(d) = d / DecimalVA              // e.g. Snellen6m = 6 / DecimalVA
LogMAR from Snellen = log10(denom / num) // e.g. 6/12 -> log10(12/6) = 0.30
```

### 2.2 Optotype sizing pipeline

Given: `logMAR`, `testDistanceMeters` (d), `screenHeightMm`, `screenHeightPixels`

```
Step 1:  MAR = Math.pow(10, logMAR)                            // arcminutes
Step 2:  angleRad = (MAR / 60) * (Math.PI / 180)               // radians
Step 3:  gapMeters = d * Math.tan(angleRad)                    // physical gap in metres
Step 4:  D_meters = 5 * gapMeters                              // outer diameter (gap = D/5)
Step 5:  D_mm = D_meters * 1000                                // to millimetres
Step 6:  mmPerPixel = screenHeightMm / screenHeightPixels       // calibration factor
Step 7:  D_pixels = D_mm / mmPerPixel                           // render size
```

**Critical rule:** The GAP (D/5) subtends 1 MAR. The full diameter D subtends 5 MAR. The gap is what the patient resolves.

### 2.3 Snellen display

```
denominator = d * MAR
Snellen string = `${d}/${denominator.toFixed(1)}`
```

### 2.4 Weber contrast

Dark-on-light (standard): target darker than background.
```
C = (L_background - L_target) / L_background    // as a fraction 0-1
targetGrayValue = Math.round(255 * (1 - C))      // for RGB on white (#FFF) background
```

Examples: 100% -> 0 (black), 25% -> 191, 10% -> 230, 5% -> 242, 2.5% -> 249, 1% -> 252, 0.5% -> 254, 0.1% -> 255 (indistinguishable on 8-bit).

### 2.5 LogCS
```
logCS = -Math.log10(C)
```

### 2.6 Reference table (human verification only)

```
LogMAR    MAR        DecVA    Snellen@6m   Snellen@18m
-0.60     0.2512     3.981    6/1.5        18/4.5
-0.50     0.3162     3.162    6/1.9        18/5.7
-0.40     0.3981     2.512    6/2.4        18/7.2
-0.30     0.5012     1.995    6/3.0        18/9.0
-0.20     0.6310     1.585    6/3.8        18/11.4
-0.10     0.7943     1.259    6/4.8        18/14.3
 0.00     1.0000     1.000    6/6.0        18/18.0
 0.10     1.2589     0.794    6/7.6        18/22.7
 0.20     1.5849     0.631    6/9.5        18/28.5
 0.30     1.9953     0.501    6/12.0       18/35.9
 0.50     3.1623     0.316    6/19.0       18/56.9
 1.00    10.0000     0.100    6/60.0       18/180.0
```

---

## 3. LANDOLT C RENDERER

### 3.1 ISO geometry

Given outer diameter D:
- Outer radius R = D/2
- Stroke thickness = D/5
- Inner radius r = R - D/5 = 3D/10
- Gap = square cutout, side length D/5, edges parallel

### 3.2 Path construction (single filled path, must match Swift implementation)

1. Intersection angles:
   ```
   halfGap = D / 10
   thetaOuter = Math.asin(halfGap / R)
   thetaInner = Math.asin(halfGap / r)
   ```

2. Base orientation: gap faces RIGHT (0 radians).

3. Canvas path sequence (translate to centre, rotate by orientation angle):
   ```
   ctx.beginPath()
   // Outer arc: from +thetaOuter, going the LONG way to -thetaOuter (excluding gap)
   ctx.arc(0, 0, R, thetaOuter, -thetaOuter, false)     // false = CW on screen
   // Line to inner circle bottom edge of gap
   ctx.lineTo(r * Math.cos(-thetaInner), r * Math.sin(-thetaInner))
   // Inner arc: from -thetaInner, going the LONG way to +thetaInner
   ctx.arc(0, 0, r, -thetaInner, thetaInner, true)       // true = CCW on screen
   ctx.closePath()
   ctx.fill()
   ```

4. **Canvas vs SwiftUI arc convention (CRITICAL):**
   - SwiftUI `clockwise: false` = counterclockwise in math = clockwise on screen
   - Canvas `counterclockwise: false` = clockwise on screen (same visual result)
   - SwiftUI `clockwise: true` = clockwise in math = counterclockwise on screen
   - Canvas `counterclockwise: true` = counterclockwise on screen (same visual result)
   - The Swift code: outer arc `clockwise: false`, inner arc `clockwise: true`
   - Canvas equivalent: outer arc `false`, inner arc `true` -- same parameter values, opposite naming

### 3.3 Eight orientations

```javascript
const ORIENTATIONS = {
  right:     { angle: 0,               label: 'Right' },
  upRight:   { angle: -Math.PI / 4,    label: 'Up-Right' },
  up:        { angle: -Math.PI / 2,    label: 'Up' },
  upLeft:    { angle: -3 * Math.PI / 4, label: 'Up-Left' },
  left:      { angle: Math.PI,          label: 'Left' },
  downLeft:  { angle: 3 * Math.PI / 4,  label: 'Down-Left' },
  down:      { angle: Math.PI / 2,      label: 'Down' },
  downRight: { angle: Math.PI / 4,      label: 'Down-Right' },
};
```

### 3.4 Canvas rendering requirements

- Use HTML5 Canvas (not SVG) for sub-pixel precision
- **HiDPI/Retina handling:** Set canvas element width/height to `displaySize * window.devicePixelRatio`, then `ctx.scale(dpr, dpr)`. Set CSS width/height to displaySize. This prevents blurry rendering.
- Minimum renderable diameter: 8px. Below this, display warning "Optotype too small for display."
- Safety guard: if halfGap >= r, do not render.
- Fill inner circle (hole) with backgroundColor explicitly -- do not leave transparent.

### 3.5 Colour channels

Three independent values:
- `ringColor`: the ring fill (black at 100%, computed gray at lower contrasts)
- `backgroundColor`: canvas background (default #FFFFFF)
- `innerFillColor`: the hole (default same as backgroundColor)

---

## 4. VA100 STAIRCASE (Phase 1a: Static VA at 100% Contrast)

### 4.1 Parameters
- Contrast: 100% (C=1.0, black on white)
- Optotype: Landolt C, random orientation per trial (no consecutive repeats)
- Starting level: logMAR 1.0
- LogMAR range: clamp to **-0.60 to 1.00** (do not step outside this range)
- Timeout: none for static phase (unlimited response time), but reaction time is logged
- Inter-trial interval: **500ms** blank screen between trials
- Hard trial limit: **60 trials** maximum (prevents infinite loops)

### 4.2 State machine

#### Phase A: DESCENT
- Present one trial at current logMAR
- Correct: step **-0.50 logMAR**
- Incorrect: enter REVERSAL
- If logMAR would go below -0.60: clamp to -0.60 and enter CONFIRMATION directly

#### Phase B: REVERSAL
- Step UP by current reversal step size
- Reversal steps in sequence: **+0.25, +0.20, +0.15, +0.10, +0.05**
- Two incorrect at same level: consume step, use next smaller reversal, step up again
- First correct: enter CONFIRMATION at this level
- If all 5 reversal steps exhausted: use last level as candidate, enter CONFIRMATION

#### Phase C: CONFIRMATION
- Present **5 trials** at candidate logMAR
- >= 3/5 correct: confirmed. Step **-0.05** and confirm again (try harder level)
- < 3/5 correct: step **+0.05** and confirm again (try easier level)

#### Termination
- Smallest logMAR with >= 3/5 confirmed AND next smaller level fails
- OR: 2 full oscillation cycles within +/- 0.05 without progress
- OR: 60 trial hard limit reached (use best confirmed level, or last candidate)
- Result: **VA100_threshold_logMAR**

### 4.3 Output
```
VA100_logMAR, VA100_MAR, VA100_decimalVA, VA100_snellen,
totalTrials, totalReversals, durationSeconds
```

---

## 5. CONTRAST-VA SAMPLING (Phase 1b: Fast CSF Curve)

### 5.1 Contrast levels
```
[0.25, 0.10, 0.05, 0.025, 0.01, 0.005, 0.001]
```
Displayed as: 25%, 10%, 5%, 2.5%, 1%, 0.5%, 0.1%

### 5.2 Starting logMAR per contrast
```
start_logMAR = VA100_logMAR + delta
```
Deltas: 25%: +0.10, 10%: +0.25, 5%: +0.35, 2.5%: +0.45, 1%: +0.60, 0.5%: +0.70, 0.1%: +0.90

Clamp starting logMAR to the -0.60 to 1.00 range.

### 5.3 Fast staircase per contrast

**Stage 1: Descending single-trial**
- Correct: step **-0.10 logMAR**
- Stop at first incorrect

**Stage 2: Rapid confirmation**
- At last-correct level: present **3 trials**
- >= 2/3 correct: accept threshold
- <= 1/3 correct: step **+0.05**, re-confirm (3 trials), repeat until pass
- Hard limit: **20 trials** per contrast level

### 5.4 Monotonic guardrail

VA(C_i) must be >= VA(C_{i-1}) - 0.05 (VA must worsen or stay same with lower contrast).
If violated:
- Re-confirm at VA(C_i) with 3 new trials
- If fail: step +0.05 and re-confirm
- Repeat until monotonicity satisfied
- Flag guardrailTriggered = true

### 5.5 Reliability tagging
- >= 0.5% contrast: clinically reliable
- 0.25% to < 0.5%: "caution" tag in UI
- 0.1%: ALWAYS "experimental" tag (8-bit display limitation)

### 5.6 Inter-trial interval: 500ms blank screen (same as VA100)

---

## 6. TRIAL DATA MODEL

### 6.1 Trial record

```
trialNumber: number              // sequential within session
timestamp: string                // ISO 8601
phase: 'VA100' | 'CONTRAST_VA'
stage: 'DESCENT' | 'REVERSAL' | 'CONFIRMATION'

// Stimulus
logMAR: number
diameterPixels: number
orientationPresented: string     // right|upRight|up|upLeft|left|downLeft|down|downRight
contrastFraction: number
contrastPercent: number
ringColorHex: string
backgroundColorHex: string

// Response
orientationResponded: string | null
isCorrect: boolean
reactionTimeMs: number
isTimeout: boolean

// Overrides
isManualOverride: boolean        // true if examiner manually set the logMAR for this trial

// Context
eyeCondition: string             // OD|OS|OU|OU_RH_STANCE|OU_LH_STANCE
testDistanceMeters: number
screenHeightMm: number
screenHeightPixels: number
```

### 6.2 Session record

```
sessionId: string                // UUID v4
startTime: string
endTime: string
subjectId: string
eyeCondition: string
testDistanceMeters: number
screenHeightMm: number
screenHeightPixels: number
deviceDescription: string        // navigator.userAgent
operatorNotes: string
```

### 6.3 CSV export

**Trial CSV** -- one row per trial:
```
session_id, subject_id, trial_number, timestamp, phase, stage,
logMAR, MAR, snellen_denom, diameter_px,
orientation_presented, orientation_responded,
is_correct, reaction_time_ms, is_timeout, is_manual_override,
contrast_fraction, contrast_percent, logCS,
ring_color, bg_color,
eye_condition, distance_m,
screen_height_mm, screen_height_px, device
```

**Summary CSV** -- one row per contrast level:
```
session_id, subject_id, eye_condition, distance_m,
contrast_percent, logCS,
VA_logMAR, VA_MAR, VA_decimal, snellen_equiv,
trials_count, confirmation_score,
guardrail_triggered, is_experimental,
mean_rt_ms, median_rt_ms
```

Note: mean/median RT per contrast aggregated from individual trial records.

---

## 7. USER INTERFACE

### 7.1 Screen 1: SESSION SETUP

- Subject ID (text, required)
- Eye condition: dropdown with OD, OS, OU, OU Right-Handed Stance, OU Left-Handed Stance
- Test distance: number input (metres, default 18, range 1-30)
- Screen height: number input (mm -- measure physical display height with a ruler)
- Instruction text: "Measure the physical height of your screen display area in millimetres with a ruler. This calibration is essential for accurate sizing."
- Calibration check: display computed optotype size at logMAR 0.0 with a note: "At your settings, a 6/6 (logMAR 0.0) optotype will be [X]mm / [Y]px on screen."
- Operator notes (optional textarea)
- "Start Test" button (disabled until subject ID, distance, and screen height are filled)
- Access to: **Math verification panel** (shows computed values for logMAR 0.0 at 6m and 18m against reference table) and **Renderer gallery** (all 8 orientations at 3 sizes)

### 7.2 Screen 2: VA100 TEST

**Layout:**
- Display area (~70% of viewport height): white background, Landolt C centred. No borders, shadows, or reference marks anywhere in this area.
- Input area (~30%): compass rose -- 8 directional buttons in a circle/octagon arrangement. Minimum 48px touch targets. Centre button for "Can't see / Pass".
- Examiner strip (thin top bar, toggleable): logMAR, MAR, Snellen, trial count, phase (DESCENT/REVERSAL/CONFIRMATION), reversal count, audio toggle, pause button.

**Flow:**
1. Landolt C appears at computed size and random orientation
2. Timer starts (performance.now())
3. Subject taps direction
4. Brief feedback (subtle green/red flash on the pressed button, 200ms)
5. 500ms blank inter-trial interval
6. Next trial
7. On VA100 completion: display result ("VA100: logMAR [X], Snellen [Y]") with "Continue to Contrast Test" button

**Audio (optional, Web Audio API):**
- Correct: 440Hz->660Hz sweep, 100ms
- Incorrect: 440Hz->330Hz sweep, 100ms

**Examiner overrides:**
- Pause/resume button
- "Set LogMAR" input: examiner can manually type a logMAR value to jump the staircase to. Trials after override are flagged isManualOverride=true in the data.
- "Skip to Contrast" button (ends VA100 with current best candidate)

### 7.3 Screen 3: CONTRAST-VA TEST

Same layout, plus:
- Ring colour changes per contrast level
- Progress indicator: "Contrast: 10% (3 of 7)" or similar
- Reliability badges: amber dot for 0.25-0.5%, red "EXPERIMENTAL" for 0.1%
- On completion: auto-transition to results

### 7.4 Screen 4: RESULTS DASHBOARD

- **Chart** (recharts LineChart):
  - X-axis: contrast % (log scale: 100, 25, 10, 5, 2.5, 1, 0.5, 0.1)
  - Y-axis: logMAR (INVERTED: -0.6 at top, 1.0 at bottom -- better acuity = higher)
  - Data points labelled with Snellen equivalent
  - 0.1% point: dashed/lighter if experimental
  - Horizontal dashed line at logMAR 0.0 labelled "6/6"
- **Summary table**: contrast%, logCS, VA logMAR, Snellen, trials, confirmation, guardrail, RT mean
- **Session info**: subject, eye, distance, date/time, total duration, total trials
- **Export**: "Download Trial CSV", "Download Summary CSV" (trigger browser download)
- **Actions**: "New Test (Same Subject + Settings)", "New Subject"

### 7.5 Keyboard shortcuts

```
Arrow keys:    up, down, left, right
Q:             up-left
E:             up-right
Z:             down-left
C:             down-right
Space:         can't see / pass
P:             pause/resume
Escape:        abort to results with current data
```

Display a small legend in the examiner strip.

---

## 8. COLOUR THEMES

### 8.1 Implemented (default)
- Background: #FFFFFF
- Ring at 100%: #000000
- Ring at contrast C: `rgb(v,v,v)` where `v = Math.round(255 * (1 - C))`
- Inner fill: #FFFFFF

### 8.2 Data model only (do not implement rendering, just store the structure)
```javascript
const THEMES = [
  { name: 'Standard', bg: '#FFFFFF', fg100: '#000000', computeFg: (C) => { const v = Math.round(255*(1-C)); return `rgb(${v},${v},${v})`; }},
  // Future: { name: 'Red on Green', bg: '#00XX00', fg100: '#FF0000', ... }
];
```

---

## 9. ARCHITECTURE

### 9.1 Single .jsx file

The entire application is one React .jsx file. Organise with labelled section comments:

```
// ═══════════════════════════════════════
// SECTION 1: CONSTANTS
// ═══════════════════════════════════════
// (Orientations, contrast levels, delta table, staircase parameters, logMAR range)

// ═══════════════════════════════════════
// SECTION 2: VISION MATH
// ═══════════════════════════════════════
// (Pure functions: diameterPixels, logMARtoMAR, logMARtoSnellen, snellenToLogMAR, contrastToGray)

// ═══════════════════════════════════════
// SECTION 3: VA100 STAIRCASE ENGINE
// ═══════════════════════════════════════
// (Pure functions on plain state objects: create, processResponse, getNextTrial, isComplete, getResult)

// ═══════════════════════════════════════
// SECTION 4: CONTRAST-VA ENGINE
// ═══════════════════════════════════════
// (Same pattern as VA100)

// ═══════════════════════════════════════
// SECTION 5: LANDOLT C CANVAS RENDERER
// ═══════════════════════════════════════
// (React component wrapping a <canvas> element)

// ═══════════════════════════════════════
// SECTION 6: CSV EXPORT
// ═══════════════════════════════════════
// (generateTrialCSV, generateSummaryCSV, triggerDownload)

// ═══════════════════════════════════════
// SECTION 7: UI COMPONENTS
// ═══════════════════════════════════════
// (SetupScreen, TestScreen, ResultsScreen, CompassInput, ExaminerStrip, StaircaseChart)

// ═══════════════════════════════════════
// SECTION 8: MAIN APP
// ═══════════════════════════════════════
// (useReducer state management, screen routing, keyboard listeners)
```

### 9.2 Engine design principle

All engines are **pure functions on plain objects**. No React hooks, no DOM, no side effects. Pattern:
```javascript
function createVA100State() { return { phase: 'DESCENT', logMAR: 1.0, ... }; }
function va100ProcessResponse(state, isCorrect, rtMs) { /* return new state */ }
function va100GetNextTrial(state) { /* return { logMAR, orientation } */ }
function va100IsComplete(state) { /* return bool */ }
function va100GetResult(state) { /* return result object */ }
```

This makes engines testable in isolation and directly portable to Swift.

### 9.3 Orientation randomisation

Pick random from 8 orientations. Reject if same as previous trial. Simple while loop.

### 9.4 Configurable parameters (define as constants, easy to change)

```javascript
const CONFIG = {
  LOGMAR_MIN: -0.60,
  LOGMAR_MAX: 1.00,
  VA100_START_LOGMAR: 1.0,
  VA100_DESCENT_STEP: -0.50,
  VA100_REVERSAL_STEPS: [0.25, 0.20, 0.15, 0.10, 0.05],
  VA100_CONFIRM_TRIALS: 5,
  VA100_CONFIRM_PASS: 3,
  VA100_MAX_TRIALS: 60,
  CONTRAST_LEVELS: [0.25, 0.10, 0.05, 0.025, 0.01, 0.005, 0.001],
  CONTRAST_DELTAS: { 0.25: 0.10, 0.10: 0.25, 0.05: 0.35, 0.025: 0.45, 0.01: 0.60, 0.005: 0.70, 0.001: 0.90 },
  CONTRAST_DESCENT_STEP: -0.10,
  CONTRAST_CONFIRM_TRIALS: 3,
  CONTRAST_CONFIRM_PASS: 2,
  CONTRAST_MAX_TRIALS_PER_LEVEL: 20,
  INTER_TRIAL_MS: 500,
  MIN_RENDER_DIAMETER_PX: 8,
  RESPONSE_TIMEOUT_MS: null,   // null = no timeout for static. Set to 1000 for motion phase later.
};
```

---

## 10. BUILD ORDER

Build each step to completion before starting the next.

### Step 1: Math + Landolt C renderer + test harness
- All visionMath functions
- Canvas Landolt C renderer with HiDPI support
- Test harness page: sliders for logMAR (-0.6 to 1.0), distance (1-30m), screen height (100-500mm)
- Show computed values alongside the rendered optotype
- Renderer gallery: all 8 orientations at 3 sizes in a grid
- Verify at least 3 values against the reference table (Section 2.6)

### Step 2: Setup screen + VA100 staircase
- Setup form with all fields
- Calibration check display
- VA100 engine (pure functions)
- Test screen with compass rose input
- Reaction time measurement via performance.now()
- Inter-trial interval (500ms blank)
- Examiner strip with state display
- VA100 result display on completion

### Step 3: Contrast-VA sweep
- Contrast ladder with Weber gray computation
- Fast staircase engine per contrast level
- Ring colour changes on screen
- Monotonic guardrail
- Experimental/caution tagging
- Progress indicator
- Auto-transition to results on completion

### Step 4: Results + CSV export
- VA-vs-contrast chart (recharts)
- Summary table
- Both CSV exports (trial-level and summary)
- New test / new subject buttons

### Step 5: Polish
- Audio feedback (Web Audio API)
- Keyboard shortcuts
- Examiner override controls (set logMAR, skip, pause)
- isManualOverride flagging in trial data
- Responsive layout (test on iPad Safari viewport)
- Edge cases: min/max diameter warnings, staircase hard limits, CSV escaping

---

## 11. VALIDATION

### 11.1 Math (verify during Step 1)

logMAR 0.0, 6m distance, screen 180mm at 1000px:
- MAR=1.0, gap=1.745mm, D=8.727mm, mmPerPx=0.18, D_px=48.5

logMAR -0.30, 18m, same screen:
- MAR=0.5012, gap=2.622mm, D=13.11mm, D_px=72.8

logMAR 1.0, 6m, same screen:
- MAR=10.0, gap=17.45mm, D=87.27mm, D_px=484.8

### 11.2 Staircase
- All-correct from logMAR 1.0: descent should reach -0.50 in 3 steps, then confirmation
- Random 50%: should converge near logMAR 0.8-0.9

### 11.3 Contrast rendering
- Debug view: Landolt C at each contrast side by side (100% through 0.5%)
- Visually confirm each step is distinguishable down to 0.5%
- 0.1% is at or beyond visible limit on most screens

### 11.4 CSV
- Opens in Excel without manual fixing
- Numbers are numbers, not quoted strings
- Timestamps are ISO 8601
- Commas in string fields are properly escaped/quoted

---

## 12. CONSTRAINTS AND SCOPE EXCLUSIONS

### 12.1 Display limits
- 8-bit colour: minimum distinguishable contrast ~0.4% (1/255). Tag 0.1% as experimental.
- Minimum optotype diameter: 8px. Clamp and warn below this.

### 12.2 Timing limits
- performance.now(): sub-ms precision, adequate for RT
- 60Hz display: up to 16.7ms stimulus onset jitter. Acceptable for prototype.

### 12.3 NOT in this web prototype (deferred to native iOS)
- Multi-device networking (iPad display + iPhone input via MultipeerConnectivity)
- Bluetooth game controller (Razer Kishi via GCController)
- Motion/kinetic VA (z-axis approach, CADisplayLink)
- Cricket ball stimuli (seam, spin, colour)
- Ambient light measurement
- Examiner-only Bluetooth audio
- App Store deployment
- XLS export (CSV only)
