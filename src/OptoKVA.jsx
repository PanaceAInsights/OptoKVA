import { useState, useReducer, useEffect, useRef, useCallback, useMemo } from 'react';
import { Play, Pause, Eye, RotateCcw, Volume2, VolumeX, ArrowLeft, Download, AlertTriangle, Info, Linkedin, BookOpen, X } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts';

// ═══════════════════════════════════════════════════════════════
// SECTION 1: CONSTANTS
// ═══════════════════════════════════════════════════════════════

const ORIENTATIONS = {
  right:     { angle: 0,                    label: 'Right' },
  upRight:   { angle: -Math.PI / 4,         label: 'Up-Right' },
  up:        { angle: -Math.PI / 2,         label: 'Up' },
  upLeft:    { angle: -3 * Math.PI / 4,     label: 'Up-Left' },
  left:      { angle: Math.PI,              label: 'Left' },
  downLeft:  { angle: 3 * Math.PI / 4,      label: 'Down-Left' },
  down:      { angle: Math.PI / 2,          label: 'Down' },
  downRight: { angle: Math.PI / 4,          label: 'Down-Right' },
};

const ORIENTATION_KEYS = Object.keys(ORIENTATIONS);

// Compass-rose layout used by TestHarness + RendererGallery so the
// 8 orientations render in their natural spatial positions rather than
// in key-insertion order. A null slot renders as an empty cell.
const ORIENTATION_COMPASS_LAYOUT = [
  ['upLeft',   'up',   'upRight'],
  ['left',     null,   'right'],
  ['downLeft', 'down', 'downRight'],
];

const CONFIG = {
  LOGMAR_MIN: -0.60,
  LOGMAR_MAX: 1.00,
  VA100_START_LOGMAR: 1.0,
  VA100_DESCENT_STEP: -0.50,
  VA100_REVERSAL_STEPS: [0.25, 0.20, 0.15, 0.10, 0.05],
  VA100_CONFIRM_TRIALS: 5,
  VA100_CONFIRM_PASS: 3,
  VA100_CONFIRM_STEP: 0.05,
  VA100_MAX_TRIALS: 60,
  CONTRAST_LEVELS: [0.25, 0.10, 0.05, 0.025, 0.01, 0.005, 0.001],
  CONTRAST_DELTAS: { 0.25: 0.10, 0.10: 0.25, 0.05: 0.35, 0.025: 0.45, 0.01: 0.60, 0.005: 0.70, 0.001: 0.90 },
  CONTRAST_DESCENT_STEP: -0.10,
  CONTRAST_CONFIRM_TRIALS: 3,
  CONTRAST_CONFIRM_PASS: 2,
  CONTRAST_MAX_TRIALS_PER_LEVEL: 20,
  CONTRAST_GUARDRAIL_TOLERANCE: 0.05,
  INTER_TRIAL_MS: 500,
  MIN_RENDER_DIAMETER_PX: 8,
  RESPONSE_TIMEOUT_MS: null, // static phase has no timeout

  // Phase 2 -Kinetic VA (web demo, fidelityTier = DEMO_KINETIC)
  KINETIC_START_DISTANCE_M: 18,     // simulated bowler distance
  KINETIC_END_DISTANCE_M: 9,        // stimulus vanishes at halfway-point
  KINETIC_SPEED_MIN_KMH: 40,
  KINETIC_SPEED_MAX_KMH: 180,
  KINETIC_SPEED_DESCENT_STEP: 20,   // km/h step per correct in ASCENT phase
  KINETIC_SPEED_REVERSAL_STEPS: [10, 5, 3, 2], // km/h reversal ladder
  KINETIC_SPEED_CONFIRM_STEP: 2,
  KINETIC_SPEED_CONFIRM_TRIALS: 3,
  KINETIC_SPEED_CONFIRM_PASS: 2,
  KINETIC_MAX_TRIALS: 30,
  KINETIC_DEFAULT_LOGMAR: 0.5,
  KINETIC_DEFAULT_START_SPEED_KMH: 60,
  KINETIC_CUE_FLASH_COUNT: 3,       // complete ring flashes before stimulus
  KINETIC_CUE_FLASH_ON_MS: 50,
  KINETIC_CUE_FLASH_OFF_MS: 100,
  KINETIC_POST_STIMULUS_RESPONSE_MS: 1500, // input window after stimulus vanishes

  // Phase 3c -Drift detection (DEMO). Variable = lateralDriftPx.
  // Staircase descends to find the MINIMUM detectable drift amount.
  DRIFT_START_PX: 80,
  DRIFT_MIN_PX: 0,
  DRIFT_MAX_PX: 200,
  DRIFT_DESCENT_STEP: -20, // smaller drift = harder
  DRIFT_REVERSAL_STEPS: [10, 6, 4, 2],
  DRIFT_CONFIRM_STEP: 2,
  DRIFT_CONFIRM_TRIALS: 3,
  DRIFT_CONFIRM_PASS: 2,
  DRIFT_MAX_TRIALS: 30,
  DRIFT_DEFAULT_LOGMAR: 0.3,
  DRIFT_DEFAULT_SPEED_KMH: 100,

  // Phase 3d -Spin detection (DEMO). Variable = spinRevsPerSec.
  // Descends from a visible rate to find the MINIMUM detectable rotation.
  SPIN_START_REVS: 20,
  SPIN_MIN_REVS: 1,
  SPIN_MAX_REVS: 40,
  SPIN_DESCENT_STEP: -4,   // slower = harder
  SPIN_REVERSAL_STEPS: [2, 1.5, 1, 0.5],
  SPIN_CONFIRM_STEP: 0.5,
  SPIN_CONFIRM_TRIALS: 3,
  SPIN_CONFIRM_PASS: 2,
  SPIN_MAX_TRIALS: 30,
  SPIN_DEFAULT_LOGMAR: 0.3,
  SPIN_DEFAULT_SPEED_KMH: 100,
};

const EYE_CONDITIONS = [
  { value: 'OD', label: 'OD (Right eye)' },
  { value: 'OS', label: 'OS (Left eye)' },
  { value: 'OU', label: 'OU (Both eyes)' },
  { value: 'OU_RH_STANCE', label: 'OU Right-Handed Stance' },
  { value: 'OU_LH_STANCE', label: 'OU Left-Handed Stance' },
];

// Fidelity tiers -guardrail against web-measured kinetic numbers leaking into clinical claims.
const FIDELITY_TIERS = {
  CLINICAL_STATIC: 'CLINICAL_STATIC', // static VA / contrast / static seam -web-quality is clinical-grade
  DEMO_KINETIC:    'DEMO_KINETIC',    // kinetic phases on web -demonstration only
  DEMO_TRAINING:   'DEMO_TRAINING',   // training mode -intervention not measurement
};

// Cricket-ball colour themes (Phase 3a+).
// ball   = filled disk colour
// bg     = canvas / display-area backdrop (simulates playing-surface)
// seam   = seam-line fill colour
const BALL_THEMES = {
  RED_ON_GREEN:  { label: 'Red ball · day',       ball: '#B11A2B', bg: '#3E6B28', seam: '#F5F1E4' },
  PINK_ON_GREEN: { label: 'Pink ball · day-night', ball: '#F05CA3', bg: '#3E6B28', seam: '#1A1A1A' },
  WHITE_ON_DARK: { label: 'White ball · night',   ball: '#F5F1E4', bg: '#0F172A', seam: '#0F172A' },
};
const BALL_THEME_KEYS = Object.keys(BALL_THEMES);
const DEFAULT_BALL_THEME = 'RED_ON_GREEN';

// Phase 3e -Match Condition Schedules (twilight contrast decay).
// The decay fades the seam-vs-ball contrast over session-elapsed time, simulating
// the visual drop from daylight → dusk → floodlit conditions.
//
// decayStart → factor at trial 0 (usually 1.0 = full contrast)
// decayEnd   → factor after durationSec has elapsed (clamped at that value)
// durationSec → time over which the decay completes (0 disables decay)
//
// Factor is applied as a linear interpolation: seamColor_t = lerp(ballColor, seamColor, factor).
// When factor = 1, the seam is fully visible. When factor = 0, the seam matches the ball.
const MATCH_CONDITION_SCHEDULES = {
  CONSTANT:  { label: 'Constant (no decay)',             decayStart: 1.0, decayEnd: 1.0, durationSec: 0   },
  DUSK:      { label: 'Day → Dusk (180 s)',              decayStart: 1.0, decayEnd: 0.5, durationSec: 180 },
  TWILIGHT:  { label: 'Day → Twilight (300 s)',          decayStart: 1.0, decayEnd: 0.3, durationSec: 300 },
  NIGHTFALL: { label: 'Twilight → Night (600 s, severe)', decayStart: 0.8, decayEnd: 0.15, durationSec: 600 },
};
const MATCH_CONDITION_SCHEDULE_KEYS = Object.keys(MATCH_CONDITION_SCHEDULES);
const DEFAULT_MATCH_CONDITION_SCHEDULE = 'CONSTANT';

// Test batteries available on the setup screen, sorted by phase number.
// Each entry carries a `description` that the InfoTooltip expands on hover/click.
const TEST_BATTERIES = {
  PHASE1_VA_CONTRAST: {
    label: 'Phase 1 · VA100 + Contrast sweep',
    phases: ['VA100', 'CONTRAST'],
    tier: 'clinical',
    description:
      'The scientific reference measurement. Static visual acuity at 100% contrast (VA100) via an adaptive Landolt-C staircase, followed by a 7-level contrast-sensitivity sweep (25%, 10%, 5%, 2.5%, 1%, 0.5%, 0.1%). Produces the VA-vs-contrast curve that discriminates elite vision beyond what a Snellen wall chart can resolve. Clinical-grade, fully publishable.',
  },
  PHASE2_KINETIC_DEMO: {
    label: 'Phase 2 · Kinetic VA (DEMO)',
    phases: ['KINETIC_SPEED'],
    tier: 'demo',
    description:
      'Dynamic visual acuity: a Landolt C grows from a simulated 18m distance to a 9m halfway-point at a configurable ball speed (60–180 km/h), preceded by three 50ms ring-cue flashes. The adaptive engine finds the maximum speed at which the subject can still resolve the gap at a given starting logMAR. Tagged DEMO_KINETIC on the web -browser RAF timing is insufficient for clinical kinetic claims. Re-measure on native iOS before publishing.',
  },
  PHASE3A_SEAM: {
    label: 'Phase 3a · Static cricket-ball seam',
    phases: ['SEAM_STATIC'],
    tier: 'clinical',
    description:
      'Sport-specific static acuity. Replaces the Landolt-C gap with a cricket-ball seam line (width = D/12, subtending 1 MAR at threshold). Same adaptive staircase, same data pipeline -only the stimulus is cricket-ball-shaped. Themed backdrops (red/day, pink/day-night, white/night) simulate real playing conditions. Clinical-grade. Seam response uses axis-equivalence (either end of the line scores correct).',
  },
  PHASE3B_KINETIC_SEAM_DEMO: {
    label: 'Phase 3b · Kinetic cricket-ball seam (DEMO)',
    phases: ['KINETIC_SEAM'],
    tier: 'demo',
    description:
      'Kinetic version of Phase 3a: an approaching cricket ball whose seam line is the limiting detail. Combines the kinetic-VA staircase with the cricket-ball stimulus. Δ-vs-Phase-2 on the results card reveals stimulus-specific visual advantage -whether the subject handles cricket balls better than abstract Landolt Cs at the same logMAR. DEMO_KINETIC fidelity tier.',
  },
  PHASE3C_DRIFT_DEMO: {
    label: 'Phase 3c · Swing / drift detection (DEMO)',
    phases: ['DRIFT'],
    tier: 'demo',
    description:
      'Lateral swing detection. An approaching cricket ball drifts left or right by a configurable amount of pixels during its approach. The 2AFC staircase finds the minimum detectable drift at a given starting logMAR and speed. Clinical analogue: minimum swing amplitude a batsman can perceive in-flight. Response: ← or →. DEMO_KINETIC tier.',
  },
  PHASE3D_SPIN_DEMO: {
    label: 'Phase 3d · Spin direction (DEMO)',
    phases: ['SPIN'],
    tier: 'demo',
    description:
      'Spin-axis detection. An approaching cricket ball\'s seam rotates during approach at a configurable rev/s, clockwise or counter-clockwise. The 2AFC staircase finds the minimum detectable rotation rate. Clinical analogue: can the batsman read spin direction off the bowler\'s hand? Response: ← (CCW) or → (CW). Different visual pathway from seam detection -motion perception rather than spatial resolution. DEMO_KINETIC tier.',
  },
  FULL_STATIC: {
    label: 'Full static · VA100 + Contrast + Seam',
    phases: ['VA100', 'CONTRAST', 'SEAM_STATIC'],
    tier: 'clinical',
    description:
      'Complete static battery: Phase 1 (VA100 + Contrast sweep) followed by Phase 3a (static cricket-ball seam). ~8 minutes per subject. All measurements clinical-grade. Recommended first-session battery for any new subject.',
  },
  FULL_WITH_KINETIC: {
    label: 'Full battery · static + all kinetic DEMO',
    phases: ['VA100', 'CONTRAST', 'SEAM_STATIC', 'KINETIC_SPEED', 'KINETIC_SEAM', 'DRIFT', 'SPIN'],
    tier: 'mixed',
    description:
      'Every phase in sequence. Static phases are clinical-grade; kinetic phases are DEMO_KINETIC. ~15–20 minutes of test time. Produces 7 thresholds plus the contrast curve in a single session. Use for flagship collaborator demos that show the full range of what the instrument can measure.',
  },
};

// ═══════════════════════════════════════════════════════════════
// SECTION 2: VISION MATH
// ═══════════════════════════════════════════════════════════════

function logMARtoMAR(logMAR) {
  return Math.pow(10, logMAR);
}

function logMARtoDecimalVA(logMAR) {
  return 1 / logMARtoMAR(logMAR);
}

function logMARtoSnellen(logMAR, distanceM) {
  const mar = logMARtoMAR(logMAR);
  const denom = distanceM * mar;
  return `${distanceM}/${denom.toFixed(1)}`;
}

function snellenToLogMAR(denom, num) {
  return Math.log10(denom / num);
}

function contrastToGray(contrast) {
  return Math.round(255 * (1 - contrast));
}

function grayToHex(gray) {
  const v = Math.max(0, Math.min(255, gray));
  const h = v.toString(16).padStart(2, '0');
  return `#${h}${h}${h}`;
}

function clampLogMAR(logMAR) {
  return Math.max(CONFIG.LOGMAR_MIN, Math.min(CONFIG.LOGMAR_MAX, logMAR));
}

// The 7-step sizing pipeline (do not simplify or rearrange).
function diameterPixels(logMAR, distanceM, screenHeightMm, screenHeightPx) {
  const mar = Math.pow(10, logMAR);                             // Step 1
  const angleRad = (mar / 60) * (Math.PI / 180);                // Step 2
  const gapMeters = distanceM * Math.tan(angleRad);             // Step 3
  const D_meters = 5 * gapMeters;                               // Step 4 (gap = D/5)
  const D_mm = D_meters * 1000;                                 // Step 5
  const mmPerPixel = screenHeightMm / screenHeightPx;           // Step 6
  const D_pixels = D_mm / mmPerPixel;                           // Step 7
  return { mar, angleRad, gapMeters, gapMm: gapMeters * 1000, D_meters, D_mm, mmPerPixel, D_pixels };
}

function logCS(contrast) {
  return -Math.log10(contrast);
}

// Cricket-ball sizing pipeline.
// For Phase 3a, the seam line is the limiting visual detail (analogous to the Landolt C gap).
// Seam width = D/12 and must subtend 1 MAR at threshold, so D = 12 * (1 MAR in metres at distance d).
function ballDiameterPixels(logMAR, distanceM, screenHeightMm, screenHeightPx) {
  const mar = Math.pow(10, logMAR);
  const angleRad = (mar / 60) * (Math.PI / 180);
  const seamMeters = distanceM * Math.tan(angleRad);
  const D_meters = 12 * seamMeters;
  const D_mm = D_meters * 1000;
  const mmPerPixel = screenHeightMm / screenHeightPx;
  const D_pixels = D_mm / mmPerPixel;
  return { mar, angleRad, seamMeters, seamMm: seamMeters * 1000, D_meters, D_mm, mmPerPixel, D_pixels };
}

// Seam line orientations are axes, not vectors -the line "up-right / down-left" is a single seam.
// Accept either the presented direction or its 180° opposite as a correct response.
const SEAM_OPPOSITES = {
  right: 'left', left: 'right',
  up: 'down',    down: 'up',
  upRight: 'downLeft', downLeft: 'upRight',
  upLeft: 'downRight', downRight: 'upLeft',
};

function seamOrientationMatches(presented, responded) {
  if (!responded || responded === 'pass') return false;
  return responded === presented || responded === SEAM_OPPOSITES[presented];
}

// ------- Phase 3e match-condition helpers -------

// Parse a #RRGGBB / #RGB hex string into {r, g, b} (0-255). Defaults to black on error.
function parseHex(hex) {
  if (typeof hex !== 'string') return { r: 0, g: 0, b: 0 };
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  const h = (n) => clamp(n).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

// Linear interpolation between two hex colours. t = 0 returns `from`, t = 1 returns `to`.
function lerpHex(from, to, t) {
  const a = parseHex(from);
  const b = parseHex(to);
  return rgbToHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  });
}

// Compute the current decay factor (0..1) for a schedule, given session elapsed time in ms.
// factor = 1 → full contrast; factor = 0 → invisible seam.
function computeDecayFactor(scheduleKey, sessionElapsedMs) {
  const sch = MATCH_CONDITION_SCHEDULES[scheduleKey] ?? MATCH_CONDITION_SCHEDULES[DEFAULT_MATCH_CONDITION_SCHEDULE];
  if (!sch || sch.durationSec <= 0) return sch?.decayStart ?? 1.0;
  const progress = Math.max(0, Math.min(1, (sessionElapsedMs / 1000) / sch.durationSec));
  return sch.decayStart + (sch.decayEnd - sch.decayStart) * progress;
}

// Apply a decay factor to (ballColor, seamColor). The ball stays identical; the seam
// fades toward the ball so its contrast against the ball decreases as factor → 0.
// factor = 1 leaves seam unchanged; factor = 0 sets seam = ball (invisible).
function applyDecayToSeam(ballHex, seamHex, factor) {
  return lerpHex(ballHex, seamHex, Math.max(0, Math.min(1, factor)));
}

// Reliability tag per spec 5.5.
function getReliabilityTag(contrast) {
  if (contrast <= 0.001 + 1e-9) return 'experimental';     // 0.1% -always experimental (8-bit limit)
  if (contrast < 0.005) return 'caution';                  // 0.25% to <0.5%
  return 'reliable';                                       // ≥0.5%
}

// ═══════════════════════════════════════════════════════════════
// SECTION 3: VA100 STAIRCASE ENGINE  (pure functions, no React)
// ═══════════════════════════════════════════════════════════════

function createVA100State() {
  return {
    phase: 'DESCENT', // DESCENT | REVERSAL | CONFIRMATION | COMPLETE
    logMAR: CONFIG.VA100_START_LOGMAR,
    reversalIndex: 0,
    consecutiveIncorrectAtLevel: 0,
    confirmationBuffer: [],
    lastConfirmedPassLogMAR: null,
    totalTrials: 0,
    totalReversals: 0,
    complete: false,
    resultLogMAR: null,
  };
}

function va100GetNextTrial(state, previousOrientation = null) {
  let nextKey;
  do {
    nextKey = ORIENTATION_KEYS[Math.floor(Math.random() * ORIENTATION_KEYS.length)];
  } while (nextKey === previousOrientation && ORIENTATION_KEYS.length > 1);
  return { logMAR: state.logMAR, orientation: nextKey };
}

function va100IsComplete(state) {
  return state.complete === true;
}

function va100ProcessResponse(prevState, isCorrect) {
  const state = { ...prevState, confirmationBuffer: [...prevState.confirmationBuffer] };
  state.totalTrials += 1;

  if (state.totalTrials >= CONFIG.VA100_MAX_TRIALS) {
    state.complete = true;
    state.phase = 'COMPLETE';
    state.resultLogMAR = state.lastConfirmedPassLogMAR ?? state.logMAR;
    return state;
  }

  switch (prevState.phase) {
    case 'DESCENT': {
      if (isCorrect) {
        const next = state.logMAR + CONFIG.VA100_DESCENT_STEP;
        if (next < CONFIG.LOGMAR_MIN) {
          state.logMAR = CONFIG.LOGMAR_MIN;
          state.phase = 'CONFIRMATION';
          state.confirmationBuffer = [];
        } else {
          state.logMAR = next;
        }
      } else {
        state.phase = 'REVERSAL';
        state.reversalIndex = 0;
        state.consecutiveIncorrectAtLevel = 0;
        state.totalReversals += 1;
        state.logMAR = clampLogMAR(state.logMAR + CONFIG.VA100_REVERSAL_STEPS[0]);
      }
      break;
    }
    case 'REVERSAL': {
      if (isCorrect) {
        state.phase = 'CONFIRMATION';
        state.confirmationBuffer = [];
        state.consecutiveIncorrectAtLevel = 0;
      } else {
        state.consecutiveIncorrectAtLevel += 1;
        if (state.consecutiveIncorrectAtLevel >= 2) {
          state.reversalIndex += 1;
          state.consecutiveIncorrectAtLevel = 0;
          if (state.reversalIndex >= CONFIG.VA100_REVERSAL_STEPS.length) {
            state.phase = 'CONFIRMATION';
            state.confirmationBuffer = [];
          } else {
            const step = CONFIG.VA100_REVERSAL_STEPS[state.reversalIndex];
            state.totalReversals += 1;
            state.logMAR = clampLogMAR(state.logMAR + step);
          }
        }
      }
      break;
    }
    case 'CONFIRMATION': {
      state.confirmationBuffer.push({ correct: isCorrect });
      if (state.confirmationBuffer.length >= CONFIG.VA100_CONFIRM_TRIALS) {
        const passCount = state.confirmationBuffer.filter((t) => t.correct).length;
        const passed = passCount >= CONFIG.VA100_CONFIRM_PASS;
        if (passed) {
          state.lastConfirmedPassLogMAR = state.logMAR;
          const harder = state.logMAR - CONFIG.VA100_CONFIRM_STEP;
          if (harder < CONFIG.LOGMAR_MIN) {
            state.complete = true;
            state.phase = 'COMPLETE';
            state.resultLogMAR = state.logMAR;
          } else {
            state.logMAR = harder;
            state.confirmationBuffer = [];
          }
        } else {
          if (state.lastConfirmedPassLogMAR !== null) {
            state.complete = true;
            state.phase = 'COMPLETE';
            state.resultLogMAR = state.lastConfirmedPassLogMAR;
          } else {
            const easier = clampLogMAR(state.logMAR + CONFIG.VA100_CONFIRM_STEP);
            if (easier === state.logMAR) {
              state.complete = true;
              state.phase = 'COMPLETE';
              state.resultLogMAR = state.logMAR;
            } else {
              state.logMAR = easier;
              state.confirmationBuffer = [];
            }
          }
        }
      }
      break;
    }
    case 'COMPLETE':
      break;
  }
  return state;
}

function va100GetResult(state) {
  if (!state.complete) return null;
  const logMAR = state.resultLogMAR ?? state.logMAR;
  return {
    logMAR,
    mar: logMARtoMAR(logMAR),
    decimalVA: logMARtoDecimalVA(logMAR),
    totalTrials: state.totalTrials,
    totalReversals: state.totalReversals,
  };
}

function va100ApplyManualOverride(state, newLogMAR) {
  return {
    ...state,
    phase: 'CONFIRMATION',
    logMAR: clampLogMAR(newLogMAR),
    confirmationBuffer: [],
    consecutiveIncorrectAtLevel: 0,
  };
}

function va100ForceComplete(state) {
  return {
    ...state,
    complete: true,
    phase: 'COMPLETE',
    resultLogMAR: state.lastConfirmedPassLogMAR ?? state.logMAR,
  };
}

// ═══════════════════════════════════════════════════════════════
// SECTION 4: CONTRAST-VA STAIRCASE ENGINE
// ═══════════════════════════════════════════════════════════════

function createContrastState(va100LogMAR) {
  const levels = CONFIG.CONTRAST_LEVELS.map((contrast) => {
    const delta = CONFIG.CONTRAST_DELTAS[contrast] ?? 0.5;
    const startLogMAR = clampLogMAR(va100LogMAR + delta);
    return {
      contrast,
      startLogMAR,
      stage: 'DESCENT',              // DESCENT | CONFIRM | COMPLETE
      logMAR: startLogMAR,
      lastCorrectLogMAR: null,
      confirmBuffer: [],
      trialsCount: 0,
      correctCount: 0,
      resultLogMAR: null,
      confirmationScore: null,
      guardrailTriggered: false,
      guardrailUsed: false,          // prevents repeat guardrail loops
      complete: false,
    };
  });
  return {
    va100LogMAR,
    levels,
    currentContrastIndex: 0,
    totalTrials: 0,
    complete: false,
  };
}

function contrastCurrentLevel(state) {
  return state.levels[state.currentContrastIndex] ?? null;
}

function contrastGetNextTrial(state, previousOrientation = null) {
  const lvl = contrastCurrentLevel(state);
  if (!lvl || lvl.complete) return null;
  let nextKey;
  do {
    nextKey = ORIENTATION_KEYS[Math.floor(Math.random() * ORIENTATION_KEYS.length)];
  } while (nextKey === previousOrientation && ORIENTATION_KEYS.length > 1);
  return {
    logMAR: lvl.logMAR,
    contrast: lvl.contrast,
    orientation: nextKey,
  };
}

function contrastIsComplete(state) {
  return state.complete === true;
}

// After a level completes, apply monotonic guardrail, then advance.
function contrastAdvanceLevel(prevState) {
  const state = { ...prevState, levels: [...prevState.levels] };
  const idx = state.currentContrastIndex;
  const cur = state.levels[idx];

  // Monotonic guardrail: VA(C_i) must be ≥ VA(C_{i-1}) - tolerance.
  // In logMAR terms: cur.resultLogMAR should be ≥ prev.resultLogMAR - tolerance.
  // If cur.resultLogMAR is much smaller (better) than prev.resultLogMAR, violation.
  if (idx > 0 && cur.resultLogMAR !== null) {
    const prev = state.levels[idx - 1];
    if (prev.complete && prev.resultLogMAR !== null) {
      const diff = cur.resultLogMAR - prev.resultLogMAR;
      if (diff < -CONFIG.CONTRAST_GUARDRAIL_TOLERANCE && !cur.guardrailUsed) {
        // Re-verify at current logMAR with a fresh confirm block.
        state.levels[idx] = {
          ...cur,
          stage: 'CONFIRM',
          confirmBuffer: [],
          complete: false,
          guardrailTriggered: true,
          guardrailUsed: true,
          resultLogMAR: null,
          confirmationScore: null,
        };
        return state; // stay at same level, re-run confirm
      }
    }
  }

  // Advance to next level or finish.
  if (idx + 1 >= state.levels.length) {
    state.complete = true;
  } else {
    state.currentContrastIndex = idx + 1;
  }
  return state;
}

function contrastProcessResponse(prevState, isCorrect) {
  const state = { ...prevState, levels: [...prevState.levels] };
  state.totalTrials += 1;

  const idx = state.currentContrastIndex;
  const prev = state.levels[idx];
  if (!prev || prev.complete) return state;

  const lvl = { ...prev, confirmBuffer: [...prev.confirmBuffer] };
  lvl.trialsCount += 1;
  if (isCorrect) lvl.correctCount += 1;

  // Hard trial limit per contrast level
  if (lvl.trialsCount >= CONFIG.CONTRAST_MAX_TRIALS_PER_LEVEL) {
    lvl.resultLogMAR = lvl.resultLogMAR ?? lvl.lastCorrectLogMAR ?? lvl.logMAR;
    lvl.confirmationScore = lvl.confirmationScore ?? 'hard-limit';
    lvl.stage = 'COMPLETE';
    lvl.complete = true;
    state.levels[idx] = lvl;
    return contrastAdvanceLevel(state);
  }

  switch (lvl.stage) {
    case 'DESCENT': {
      if (isCorrect) {
        lvl.lastCorrectLogMAR = lvl.logMAR;
        const next = lvl.logMAR + CONFIG.CONTRAST_DESCENT_STEP; // -0.10
        if (next < CONFIG.LOGMAR_MIN) {
          lvl.logMAR = CONFIG.LOGMAR_MIN;
          lvl.stage = 'CONFIRM';
          lvl.confirmBuffer = [];
        } else {
          lvl.logMAR = next;
        }
      } else {
        if (lvl.lastCorrectLogMAR !== null) {
          lvl.logMAR = lvl.lastCorrectLogMAR;
          lvl.stage = 'CONFIRM';
          lvl.confirmBuffer = [];
        } else {
          // First trial incorrect at start level -step easier and retry DESCENT.
          const easier = clampLogMAR(lvl.logMAR + 0.05);
          if (easier === lvl.logMAR) {
            // already at cap
            lvl.resultLogMAR = lvl.logMAR;
            lvl.confirmationScore = '0-floor';
            lvl.stage = 'COMPLETE';
            lvl.complete = true;
            state.levels[idx] = lvl;
            return contrastAdvanceLevel(state);
          }
          lvl.logMAR = easier;
        }
      }
      break;
    }
    case 'CONFIRM': {
      lvl.confirmBuffer.push({ correct: isCorrect });
      if (lvl.confirmBuffer.length >= CONFIG.CONTRAST_CONFIRM_TRIALS) {
        const passCount = lvl.confirmBuffer.filter((t) => t.correct).length;
        const passed = passCount >= CONFIG.CONTRAST_CONFIRM_PASS;
        if (passed) {
          lvl.resultLogMAR = lvl.logMAR;
          lvl.confirmationScore = `${passCount}/${CONFIG.CONTRAST_CONFIRM_TRIALS}`;
          lvl.stage = 'COMPLETE';
          lvl.complete = true;
          state.levels[idx] = lvl;
          return contrastAdvanceLevel(state);
        } else {
          const easier = clampLogMAR(lvl.logMAR + 0.05);
          if (easier === lvl.logMAR) {
            // capped out -accept current
            lvl.resultLogMAR = lvl.logMAR;
            lvl.confirmationScore = `${passCount}/${CONFIG.CONTRAST_CONFIRM_TRIALS}`;
            lvl.stage = 'COMPLETE';
            lvl.complete = true;
            state.levels[idx] = lvl;
            return contrastAdvanceLevel(state);
          }
          lvl.logMAR = easier;
          lvl.confirmBuffer = [];
        }
      }
      break;
    }
    case 'COMPLETE':
      break;
  }

  state.levels[idx] = lvl;
  return state;
}

function contrastGetResults(state) {
  return state.levels.map((lvl) => {
    const resultLogMAR = lvl.resultLogMAR ?? lvl.logMAR;
    return {
      contrast: lvl.contrast,
      contrastPercent: lvl.contrast * 100,
      logCS: logCS(lvl.contrast),
      logMAR: resultLogMAR,
      mar: logMARtoMAR(resultLogMAR),
      decimalVA: logMARtoDecimalVA(resultLogMAR),
      trialsCount: lvl.trialsCount,
      confirmationScore: lvl.confirmationScore,
      guardrailTriggered: lvl.guardrailTriggered,
      reliabilityTag: getReliabilityTag(lvl.contrast),
      isExperimental: getReliabilityTag(lvl.contrast) === 'experimental',
      complete: lvl.complete,
    };
  });
}

function contrastApplyManualOverride(state, newLogMAR) {
  const idx = state.currentContrastIndex;
  if (idx >= state.levels.length) return state;
  const levels = [...state.levels];
  levels[idx] = {
    ...levels[idx],
    stage: 'CONFIRM',
    logMAR: clampLogMAR(newLogMAR),
    confirmBuffer: [],
  };
  return { ...state, levels };
}

function contrastForceComplete(state) {
  const levels = state.levels.map((lvl) =>
    lvl.complete
      ? lvl
      : {
          ...lvl,
          complete: true,
          stage: 'COMPLETE',
          resultLogMAR: lvl.resultLogMAR ?? lvl.lastCorrectLogMAR ?? lvl.logMAR,
          confirmationScore: lvl.confirmationScore ?? 'aborted',
        }
  );
  return { ...state, levels, complete: true };
}

// ═══════════════════════════════════════════════════════════════
// SECTION 4.5: KINETIC VA STAIRCASE ENGINE  (pure functions, DEMO tier)
// ═══════════════════════════════════════════════════════════════
//
// Phase 2 on the web is a demo: RAF timing has jitter, so measurements
// are tagged fidelityTier=DEMO_KINETIC and never feed clinical claims.
//
// Mode 1 (implemented): SPEED_THRESHOLD at a given starting logMAR.
//   - Find the highest simulated-ball speed at which the subject can still
//     identify the gap direction during approach.
//   - State machine mirrors VA100: ASCENT → REVERSAL → CONFIRMATION → COMPLETE.
//   - Descent = increasing speed (harder). Confirm step = +2 km/h.

function clampKineticSpeed(v) {
  return Math.max(CONFIG.KINETIC_SPEED_MIN_KMH, Math.min(CONFIG.KINETIC_SPEED_MAX_KMH, v));
}

function createKineticSpeedState(
  fixedLogMAR = CONFIG.KINETIC_DEFAULT_LOGMAR,
  initialSpeedKmh = CONFIG.KINETIC_DEFAULT_START_SPEED_KMH,
) {
  return {
    mode: 'KINETIC_SPEED',
    fixedLogMAR,
    phase: 'DESCENT',
    speedKmh: clampKineticSpeed(initialSpeedKmh),
    reversalIndex: 0,
    consecutiveIncorrectAtLevel: 0,
    confirmationBuffer: [],
    lastConfirmedPassSpeedKmh: null,
    totalTrials: 0,
    totalReversals: 0,
    complete: false,
    resultSpeedKmh: null,
  };
}

function kineticSpeedGetNextTrial(state, previousOrientation = null) {
  let orientation;
  do {
    orientation = ORIENTATION_KEYS[Math.floor(Math.random() * ORIENTATION_KEYS.length)];
  } while (orientation === previousOrientation && ORIENTATION_KEYS.length > 1);
  return {
    logMAR: state.fixedLogMAR,
    speedKmh: state.speedKmh,
    orientation,
    contrast: 1.0,
  };
}

function kineticSpeedIsComplete(state) {
  return state.complete === true;
}

function kineticSpeedProcessResponse(prev, isCorrect) {
  const state = { ...prev, confirmationBuffer: [...prev.confirmationBuffer] };
  state.totalTrials += 1;

  if (state.totalTrials >= CONFIG.KINETIC_MAX_TRIALS) {
    state.complete = true;
    state.phase = 'COMPLETE';
    state.resultSpeedKmh = state.lastConfirmedPassSpeedKmh ?? state.speedKmh;
    return state;
  }

  switch (prev.phase) {
    case 'DESCENT': {
      if (isCorrect) {
        const next = state.speedKmh + CONFIG.KINETIC_SPEED_DESCENT_STEP;
        if (next > CONFIG.KINETIC_SPEED_MAX_KMH) {
          state.speedKmh = CONFIG.KINETIC_SPEED_MAX_KMH;
          state.phase = 'CONFIRMATION';
          state.confirmationBuffer = [];
        } else {
          state.speedKmh = next;
        }
      } else {
        state.phase = 'REVERSAL';
        state.reversalIndex = 0;
        state.consecutiveIncorrectAtLevel = 0;
        state.totalReversals += 1;
        state.speedKmh = clampKineticSpeed(
          state.speedKmh - CONFIG.KINETIC_SPEED_REVERSAL_STEPS[0]
        );
      }
      break;
    }
    case 'REVERSAL': {
      if (isCorrect) {
        state.phase = 'CONFIRMATION';
        state.confirmationBuffer = [];
        state.consecutiveIncorrectAtLevel = 0;
      } else {
        state.consecutiveIncorrectAtLevel += 1;
        if (state.consecutiveIncorrectAtLevel >= 2) {
          state.reversalIndex += 1;
          state.consecutiveIncorrectAtLevel = 0;
          if (state.reversalIndex >= CONFIG.KINETIC_SPEED_REVERSAL_STEPS.length) {
            state.phase = 'CONFIRMATION';
            state.confirmationBuffer = [];
          } else {
            const step = CONFIG.KINETIC_SPEED_REVERSAL_STEPS[state.reversalIndex];
            state.totalReversals += 1;
            state.speedKmh = clampKineticSpeed(state.speedKmh - step);
          }
        }
      }
      break;
    }
    case 'CONFIRMATION': {
      state.confirmationBuffer.push({ correct: isCorrect });
      if (state.confirmationBuffer.length >= CONFIG.KINETIC_SPEED_CONFIRM_TRIALS) {
        const passCount = state.confirmationBuffer.filter((t) => t.correct).length;
        const passed = passCount >= CONFIG.KINETIC_SPEED_CONFIRM_PASS;
        if (passed) {
          state.lastConfirmedPassSpeedKmh = state.speedKmh;
          const harder = state.speedKmh + CONFIG.KINETIC_SPEED_CONFIRM_STEP;
          if (harder > CONFIG.KINETIC_SPEED_MAX_KMH) {
            state.complete = true;
            state.phase = 'COMPLETE';
            state.resultSpeedKmh = state.speedKmh;
          } else {
            state.speedKmh = harder;
            state.confirmationBuffer = [];
          }
        } else {
          if (state.lastConfirmedPassSpeedKmh !== null) {
            state.complete = true;
            state.phase = 'COMPLETE';
            state.resultSpeedKmh = state.lastConfirmedPassSpeedKmh;
          } else {
            const easier = clampKineticSpeed(state.speedKmh - CONFIG.KINETIC_SPEED_CONFIRM_STEP);
            if (easier === state.speedKmh) {
              state.complete = true;
              state.phase = 'COMPLETE';
              state.resultSpeedKmh = state.speedKmh;
            } else {
              state.speedKmh = easier;
              state.confirmationBuffer = [];
            }
          }
        }
      }
      break;
    }
    case 'COMPLETE':
      break;
  }
  return state;
}

function kineticSpeedGetResult(state) {
  if (!state.complete) return null;
  const speed = state.resultSpeedKmh ?? state.speedKmh;
  return {
    mode: 'KINETIC_SPEED',
    thresholdSpeedKmh: speed,
    fixedLogMAR: state.fixedLogMAR,
    totalTrials: state.totalTrials,
    totalReversals: state.totalReversals,
  };
}

function kineticSpeedApplyManualOverride(state, newSpeedKmh) {
  return {
    ...state,
    phase: 'CONFIRMATION',
    speedKmh: clampKineticSpeed(newSpeedKmh),
    confirmationBuffer: [],
    consecutiveIncorrectAtLevel: 0,
  };
}

function kineticSpeedForceComplete(state) {
  return {
    ...state,
    complete: true,
    phase: 'COMPLETE',
    resultSpeedKmh: state.lastConfirmedPassSpeedKmh ?? state.speedKmh,
  };
}

// ------- Generic descending staircase factory -------
//
// Phase 3c (drift) and Phase 3d (spin) both track a single scalar that
// DESCENDS (gets harder) on correct responses. The state machine is the
// same as kineticSpeedProcessResponse but the variable name and direction
// of "harder" differ, so we parameterise it.
//
// Config:
//   variable        -e.g. 'driftPx' or 'revsPerSec'
//   descentStep     -signed; negative means harder value decreases
//   reversalSteps   -magnitudes (sign is opposite of descentStep)
//   confirmStep     -magnitude for confirmation-phase steps
//   minValue/maxValue -clamps
//   maxTrials       -hard limit
function makeDescendingStaircase(config) {
  const harderDir = Math.sign(config.descentStep); // -1 means descending (values get smaller)
  const clamp = (v) => Math.max(config.minValue, Math.min(config.maxValue, v));

  const create = (startValue) => ({
    [config.variable]: clamp(startValue ?? config.startValue),
    phase: 'DESCENT',
    reversalIndex: 0,
    consecutiveIncorrectAtLevel: 0,
    confirmationBuffer: [],
    lastConfirmedPassValue: null,
    totalTrials: 0,
    totalReversals: 0,
    complete: false,
    resultValue: null,
    configName: config.name,
  });

  const process = (prev, isCorrect) => {
    const state = { ...prev, confirmationBuffer: [...prev.confirmationBuffer] };
    state.totalTrials += 1;
    const cur = state[config.variable];

    if (state.totalTrials >= config.maxTrials) {
      state.complete = true;
      state.phase = 'COMPLETE';
      state.resultValue = state.lastConfirmedPassValue ?? cur;
      return state;
    }

    switch (prev.phase) {
      case 'DESCENT': {
        if (isCorrect) {
          const next = cur + config.descentStep;
          const atLimit = harderDir < 0 ? next < config.minValue : next > config.maxValue;
          if (atLimit) {
            state[config.variable] = harderDir < 0 ? config.minValue : config.maxValue;
            state.phase = 'CONFIRMATION';
            state.confirmationBuffer = [];
          } else {
            state[config.variable] = next;
          }
        } else {
          state.phase = 'REVERSAL';
          state.reversalIndex = 0;
          state.consecutiveIncorrectAtLevel = 0;
          state.totalReversals += 1;
          state[config.variable] = clamp(cur - harderDir * config.reversalSteps[0]);
        }
        break;
      }
      case 'REVERSAL': {
        if (isCorrect) {
          state.phase = 'CONFIRMATION';
          state.confirmationBuffer = [];
          state.consecutiveIncorrectAtLevel = 0;
        } else {
          state.consecutiveIncorrectAtLevel += 1;
          if (state.consecutiveIncorrectAtLevel >= 2) {
            state.reversalIndex += 1;
            state.consecutiveIncorrectAtLevel = 0;
            if (state.reversalIndex >= config.reversalSteps.length) {
              state.phase = 'CONFIRMATION';
              state.confirmationBuffer = [];
            } else {
              const step = config.reversalSteps[state.reversalIndex];
              state.totalReversals += 1;
              state[config.variable] = clamp(cur - harderDir * step);
            }
          }
        }
        break;
      }
      case 'CONFIRMATION': {
        state.confirmationBuffer.push({ correct: isCorrect });
        if (state.confirmationBuffer.length >= config.confirmTrials) {
          const passCount = state.confirmationBuffer.filter((t) => t.correct).length;
          const passed = passCount >= config.confirmPass;
          if (passed) {
            state.lastConfirmedPassValue = cur;
            const harder = cur + harderDir * config.confirmStep;
            const atLimit = harderDir < 0 ? harder < config.minValue : harder > config.maxValue;
            if (atLimit) {
              state.complete = true;
              state.phase = 'COMPLETE';
              state.resultValue = cur;
            } else {
              state[config.variable] = harder;
              state.confirmationBuffer = [];
            }
          } else {
            if (state.lastConfirmedPassValue !== null) {
              state.complete = true;
              state.phase = 'COMPLETE';
              state.resultValue = state.lastConfirmedPassValue;
            } else {
              const easier = clamp(cur - harderDir * config.confirmStep);
              if (easier === cur) {
                state.complete = true;
                state.phase = 'COMPLETE';
                state.resultValue = cur;
              } else {
                state[config.variable] = easier;
                state.confirmationBuffer = [];
              }
            }
          }
        }
        break;
      }
      case 'COMPLETE':
        break;
    }
    return state;
  };

  const applyOverride = (state, newValue) => ({
    ...state,
    phase: 'CONFIRMATION',
    [config.variable]: clamp(newValue),
    confirmationBuffer: [],
    consecutiveIncorrectAtLevel: 0,
  });

  const forceComplete = (state) => ({
    ...state,
    complete: true,
    phase: 'COMPLETE',
    resultValue: state.lastConfirmedPassValue ?? state[config.variable],
  });

  const getResult = (state) => {
    if (!state.complete) return null;
    return {
      [config.variable]: state.resultValue ?? state[config.variable],
      totalTrials: state.totalTrials,
      totalReversals: state.totalReversals,
    };
  };

  return { create, process, applyOverride, forceComplete, getResult, clamp };
}

// Drift (Phase 3c) staircase -descends to find the minimum detectable drift (px).
const driftStaircase = makeDescendingStaircase({
  name: 'DRIFT',
  variable: 'driftPx',
  descentStep: CONFIG.DRIFT_DESCENT_STEP, // -20 (smaller drift = harder)
  reversalSteps: CONFIG.DRIFT_REVERSAL_STEPS,
  confirmStep: CONFIG.DRIFT_CONFIRM_STEP,
  confirmTrials: CONFIG.DRIFT_CONFIRM_TRIALS,
  confirmPass: CONFIG.DRIFT_CONFIRM_PASS,
  minValue: CONFIG.DRIFT_MIN_PX,
  maxValue: CONFIG.DRIFT_MAX_PX,
  startValue: CONFIG.DRIFT_START_PX,
  maxTrials: CONFIG.DRIFT_MAX_TRIALS,
});

// Spin (Phase 3d) staircase -descends to find the minimum detectable rotation (rev/s).
const spinStaircase = makeDescendingStaircase({
  name: 'SPIN',
  variable: 'revsPerSec',
  descentStep: CONFIG.SPIN_DESCENT_STEP, // -4 (slower = harder)
  reversalSteps: CONFIG.SPIN_REVERSAL_STEPS,
  confirmStep: CONFIG.SPIN_CONFIRM_STEP,
  confirmTrials: CONFIG.SPIN_CONFIRM_TRIALS,
  confirmPass: CONFIG.SPIN_CONFIRM_PASS,
  minValue: CONFIG.SPIN_MIN_REVS,
  maxValue: CONFIG.SPIN_MAX_REVS,
  startValue: CONFIG.SPIN_START_REVS,
  maxTrials: CONFIG.SPIN_MAX_TRIALS,
});

// Travel kinematics helpers used by both the engine and the renderer.
function kineticTravelTimeMs(speedKmh) {
  const speedMs = speedKmh / 3.6;
  const dist = CONFIG.KINETIC_START_DISTANCE_M - CONFIG.KINETIC_END_DISTANCE_M;
  return (dist / speedMs) * 1000;
}

// Per-frame size factor relative to the size at END distance (max size).
// At t = 0 → currentDistance = start → factor = end/start (smallest).
// At t = travelTime → currentDistance = end → factor = 1.0 (largest).
function kineticSizeFactorAt(elapsedMs, speedKmh) {
  const speedMs = speedKmh / 3.6;
  const traveled = speedMs * (elapsedMs / 1000);
  const currentD = CONFIG.KINETIC_START_DISTANCE_M - traveled;
  const clamped = Math.max(CONFIG.KINETIC_END_DISTANCE_M, currentD);
  return CONFIG.KINETIC_END_DISTANCE_M / clamped;
}

function computeFrameStats(timestamps) {
  if (timestamps.length < 2) {
    return { frameCount: timestamps.length, avgFrameDeltaMs: 0, maxFrameDeltaMs: 0 };
  }
  const deltas = [];
  for (let i = 1; i < timestamps.length; i++) {
    deltas.push(timestamps[i] - timestamps[i - 1]);
  }
  const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const max = Math.max(...deltas);
  return { frameCount: timestamps.length, avgFrameDeltaMs: avg, maxFrameDeltaMs: max };
}

// ═══════════════════════════════════════════════════════════════
// SECTION 5: LANDOLT C CANVAS RENDERER
// ═══════════════════════════════════════════════════════════════

function LandoltCCanvas({
  diameter,
  orientation,
  ringColor = '#000000',
  backgroundColor = '#FFFFFF',
  innerColor = '#FFFFFF',
  className = '',
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const displaySize = Math.max(CONFIG.MIN_RENDER_DIAMETER_PX, Math.ceil(diameter));

    canvas.width = displaySize * dpr;
    canvas.height = displaySize * dpr;
    canvas.style.width = `${displaySize}px`;
    canvas.style.height = `${displaySize}px`;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, displaySize, displaySize);

    const D = diameter;
    const R = D / 2;
    const r = R - D / 5; // = 3D/10
    const halfGap = D / 10;

    if (D < CONFIG.MIN_RENDER_DIAMETER_PX || halfGap >= r) {
      ctx.fillStyle = '#ff0000';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', displaySize / 2, displaySize / 2);
      return;
    }

    const thetaOuter = Math.asin(halfGap / R);
    const thetaInner = Math.asin(halfGap / r);

    ctx.save();
    ctx.translate(displaySize / 2, displaySize / 2);
    const angle = ORIENTATIONS[orientation]?.angle ?? 0;
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.arc(0, 0, R, thetaOuter, -thetaOuter, false);
    ctx.lineTo(r * Math.cos(-thetaInner), r * Math.sin(-thetaInner));
    ctx.arc(0, 0, r, -thetaInner, thetaInner, true);
    ctx.closePath();
    ctx.fillStyle = ringColor;
    ctx.fill();

    // Explicit inner fill (hole) -never transparent
    ctx.beginPath();
    ctx.arc(0, 0, r - 0.5, 0, Math.PI * 2);
    ctx.fillStyle = innerColor;
    ctx.fill();

    ctx.restore();
  }, [diameter, orientation, ringColor, backgroundColor, innerColor]);

  return <canvas ref={canvasRef} className={className} />;
}

// ------- Cricket Ball Canvas (Phase 3a) -------

function BallCanvas({
  diameter,
  seamOrientation,
  ballColor = '#B11A2B',
  seamColor = '#F5F1E4',
  backgroundColor = null, // null = transparent (display area supplies bg)
  className = '',
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const D = Math.max(CONFIG.MIN_RENDER_DIAMETER_PX, Math.ceil(diameter));
    const padding = Math.max(4, Math.round(D * 0.04));
    const displaySize = D + padding * 2;

    canvas.width = displaySize * dpr;
    canvas.height = displaySize * dpr;
    canvas.style.width = `${displaySize}px`;
    canvas.style.height = `${displaySize}px`;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    if (backgroundColor) {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, displaySize, displaySize);
    } else {
      ctx.clearRect(0, 0, displaySize, displaySize);
    }

    if (diameter < CONFIG.MIN_RENDER_DIAMETER_PX) {
      ctx.fillStyle = '#ff0000';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', displaySize / 2, displaySize / 2);
      return;
    }

    const cx = displaySize / 2;
    const cy = displaySize / 2;
    const R = D / 2;
    const seamHalfWidth = D / 24; // seam width = D/12

    ctx.save();
    ctx.translate(cx, cy);

    // Draw the ball (filled disk)
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fillStyle = ballColor;
    ctx.fill();

    // Clip to the ball, then draw the seam rectangle rotated to the presented orientation.
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.clip();
    const angle = ORIENTATIONS[seamOrientation]?.angle ?? 0;
    ctx.rotate(angle);
    ctx.fillStyle = seamColor;
    ctx.fillRect(-R, -seamHalfWidth, D, seamHalfWidth * 2);
    ctx.restore();

    ctx.restore();
  }, [diameter, seamOrientation, ballColor, seamColor, backgroundColor]);

  return <canvas ref={canvasRef} className={className} />;
}

// ------- Kinetic Canvas (Phase 2 + 3b DEMO) -------
//
// RAF animation of an approaching stimulus. Three cue flashes precede
// each trial, then the stimulus grows from a small size (simulated 18 m)
// to maxDiameterPx (simulated 9 m) over kineticTravelTimeMs(speedKmh),
// then the stimulus vanishes.
//
// `stimulusKind` selects the rendered stimulus:
//   'landolt' → Landolt C with a gap (Phase 2)
//   'ball'    → cricket ball with a clipped seam line (Phase 3b)
//
// Cue flashes:
//   landolt → complete ring (no gap)
//   ball    → plain coloured disk (no seam) -keeps the seam appearance
//             as the clear "stimulus is live" signal.
//
// Emits onStimulusOnset(perfNow) once, onStimulusEnd(perfNow, frameStats)
// once, and records per-frame timestamps for jitter analysis.

function KineticCanvas({
  maxDiameterPx,
  speedKmh,
  orientation,
  stimulusKind = 'landolt', // 'landolt' | 'ball'
  ringColor = '#000000',
  backgroundColor = '#FFFFFF',
  ballColor,
  seamColor,
  lateralDriftPx = 0,   // Phase 3c: signed lateral offset at animation end (px)
  spinRevsPerSec = 0,   // Phase 3d: signed rotational rate applied to seam (signed)
  onStimulusOnset,
  onStimulusEnd,
  className = '',
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const D_at_end = maxDiameterPx;
    const padding = 32 + Math.abs(lateralDriftPx);
    const maxRender = Math.max(CONFIG.MIN_RENDER_DIAMETER_PX, Math.ceil(D_at_end * 1.1));
    const displaySize = maxRender + padding * 2;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = displaySize * dpr;
    canvas.height = displaySize * dpr;
    canvas.style.width = `${displaySize}px`;
    canvas.style.height = `${displaySize}px`;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    const travelMs = kineticTravelTimeMs(speedKmh);
    const cueOn = CONFIG.KINETIC_CUE_FLASH_ON_MS;
    const cueOff = CONFIG.KINETIC_CUE_FLASH_OFF_MS;
    const cueCount = CONFIG.KINETIC_CUE_FLASH_COUNT;
    const cueTotalMs = cueCount * (cueOn + cueOff);

    const drawBackground = () => {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, displaySize, displaySize);
    };

    // `cx` / `cy` are the stimulus center, shifted by the progressive drift during the stimulus
    // phase. `seamRotationRad` is an additional rotation applied to the seam line for spin trials.

    const drawFullRing = (diameter, cx, cy) => {
      const D = Math.max(CONFIG.MIN_RENDER_DIAMETER_PX, diameter);
      const R = D / 2;
      const innerR = R - D / 5;
      if (innerR <= 0) return;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.arc(0, 0, innerR, 0, Math.PI * 2, true);
      ctx.fillStyle = ringColor;
      ctx.fill('evenodd');
      ctx.restore();
    };

    const drawLandolt = (diameter, cx, cy) => {
      const D = Math.max(CONFIG.MIN_RENDER_DIAMETER_PX, diameter);
      const R = D / 2;
      const r = R - D / 5;
      const halfGap = D / 10;
      if (halfGap >= r) return;
      const thetaOuter = Math.asin(halfGap / R);
      const thetaInner = Math.asin(halfGap / r);
      ctx.save();
      ctx.translate(cx, cy);
      const angle = ORIENTATIONS[orientation]?.angle ?? 0;
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.arc(0, 0, R, thetaOuter, -thetaOuter, false);
      ctx.lineTo(r * Math.cos(-thetaInner), r * Math.sin(-thetaInner));
      ctx.arc(0, 0, r, -thetaInner, thetaInner, true);
      ctx.closePath();
      ctx.fillStyle = ringColor;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, r - 0.5, 0, Math.PI * 2);
      ctx.fillStyle = backgroundColor;
      ctx.fill();
      ctx.restore();
    };

    const drawBallStimulus = (diameter, cx, cy, seamRotationRad) => {
      const D = Math.max(CONFIG.MIN_RENDER_DIAMETER_PX, diameter);
      const R = D / 2;
      const seamHalfWidth = D / 24;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fillStyle = ballColor ?? '#B11A2B';
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.clip();
      const angle = (ORIENTATIONS[orientation]?.angle ?? 0) + (seamRotationRad ?? 0);
      ctx.rotate(angle);
      ctx.fillStyle = seamColor ?? '#F5F1E4';
      ctx.fillRect(-R, -seamHalfWidth, D, seamHalfWidth * 2);
      ctx.restore();
      ctx.restore();
    };

    const drawBallCue = (diameter, cx, cy) => {
      const D = Math.max(CONFIG.MIN_RENDER_DIAMETER_PX, diameter);
      const R = D / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fillStyle = ballColor ?? '#B11A2B';
      ctx.fill();
      ctx.restore();
    };

    const drawCue = (diameter, cx, cy) =>
      stimulusKind === 'ball' ? drawBallCue(diameter, cx, cy) : drawFullRing(diameter, cx, cy);
    const drawStimulus = (diameter, cx, cy, seamRotationRad) =>
      stimulusKind === 'ball'
        ? drawBallStimulus(diameter, cx, cy, seamRotationRad)
        : drawLandolt(diameter, cx, cy);

    let cancelled = false;
    const startTime = performance.now();
    let onsetFired = false;
    let endFired = false;
    const frameTimestamps = [];

    const centerX = displaySize / 2;
    const centerY = displaySize / 2;

    const tick = (now) => {
      if (cancelled) return;
      const elapsed = now - startTime;

      drawBackground();

      if (elapsed < cueTotalMs) {
        const slot = elapsed / (cueOn + cueOff);
        const idx = Math.floor(slot);
        const inOn = (elapsed - idx * (cueOn + cueOff)) < cueOn;
        if (idx < cueCount && inOn) {
          drawCue(D_at_end, centerX, centerY);
        }
        requestAnimationFrame(tick);
        return;
      }

      if (!onsetFired) {
        onsetFired = true;
        onStimulusOnset?.(now);
      }

      const stimElapsed = elapsed - cueTotalMs;
      if (stimElapsed >= travelMs) {
        if (!endFired) {
          endFired = true;
          drawBackground();
          const stats = computeFrameStats(frameTimestamps);
          onStimulusEnd?.(now, stats);
        }
        return;
      }

      frameTimestamps.push(now);
      const factor = kineticSizeFactorAt(stimElapsed, speedKmh);
      const D_t = D_at_end * factor;

      // Progressive drift: 0 at stimulus onset, full lateralDriftPx at stimulus end.
      const driftProgress = stimElapsed / travelMs;
      const cx = centerX + (lateralDriftPx ?? 0) * driftProgress;
      const cy = centerY;

      // Seam rotation: angular offset proportional to elapsed time.
      const seamRotationRad = 2 * Math.PI * (spinRevsPerSec ?? 0) * (stimElapsed / 1000);

      drawStimulus(D_t, cx, cy, seamRotationRad);

      requestAnimationFrame(tick);
    };

    const rafId = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (!endFired) {
        const stats = computeFrameStats(frameTimestamps);
        onStimulusEnd?.(performance.now(), stats);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxDiameterPx, speedKmh, orientation, stimulusKind, ringColor, backgroundColor, ballColor, seamColor, lateralDriftPx, spinRevsPerSec]);

  return <canvas ref={canvasRef} className={className} />;
}

// ═══════════════════════════════════════════════════════════════
// SECTION 6: CSV EXPORT
// ═══════════════════════════════════════════════════════════════

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(values) {
  return values.map(csvEscape).join(',');
}

function formatNumberOrEmpty(n, digits = 4) {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  if (typeof n !== 'number') return n;
  return Number.isFinite(n) ? n.toFixed(digits).replace(/\.?0+$/, '') : '';
}

function generateTrialCSV(session, trials) {
  const header = [
    'session_id', 'subject_id', 'trial_number', 'timestamp', 'phase', 'stage',
    'logMAR', 'MAR', 'snellen_denom', 'diameter_px',
    'orientation_presented', 'orientation_responded',
    'is_correct', 'reaction_time_ms', 'is_timeout', 'is_manual_override',
    'contrast_fraction', 'contrast_percent', 'logCS',
    'ring_color', 'bg_color',
    'eye_condition', 'distance_m', 'screen_height_mm', 'screen_height_px',
    'device', 'fidelity_tier',
    'stimulus_kind', 'ball_theme', 'ball_color', 'seam_color',
    'kinetic_speed_kmh', 'kinetic_start_m', 'kinetic_end_m', 'kinetic_travel_ms',
    'responded_during_stimulus', 'frame_count', 'avg_frame_delta_ms', 'max_frame_delta_ms',
    'match_condition_schedule', 'decay_factor', 'phase_elapsed_ms',
  ];
  const lines = [csvRow(header)];
  trials.forEach((t) => {
    const mar = logMARtoMAR(t.logMAR);
    const snellenDenom = session.distanceM * mar;
    lines.push(csvRow([
      session.sessionId,
      session.subjectId,
      t.trialNumber,
      t.timestamp,
      t.phase,
      t.stage,
      t.logMAR,
      mar.toFixed(4),
      snellenDenom.toFixed(2),
      t.diameterPixels.toFixed(2),
      t.orientationPresented,
      t.orientationResponded ?? '',
      t.isCorrect ? 'true' : 'false',
      Math.round(t.reactionTimeMs),
      t.isTimeout ? 'true' : 'false',
      t.isManualOverride ? 'true' : 'false',
      t.contrastFraction,
      t.contrastPercent.toFixed(3),
      logCS(t.contrastFraction).toFixed(4),
      t.ringColorHex,
      t.backgroundColorHex,
      t.eyeCondition,
      session.distanceM,
      session.screenHeightMm,
      session.screenHeightPx,
      session.deviceDesc,
      t.fidelityTier,
      t.stimulusKind ?? 'landolt',
      t.ballTheme ?? '',
      t.ballColorHex ?? '',
      t.seamColorHex ?? '',
      t.kineticSpeedKmh ?? '',
      t.kineticStartDistanceM ?? '',
      t.kineticEndDistanceM ?? '',
      t.kineticTravelTimeMs != null ? t.kineticTravelTimeMs.toFixed(1) : '',
      t.respondedDuringStimulus == null ? '' : (t.respondedDuringStimulus ? 'true' : 'false'),
      t.frameCount ?? '',
      t.avgFrameDeltaMs != null ? t.avgFrameDeltaMs.toFixed(2) : '',
      t.maxFrameDeltaMs != null ? t.maxFrameDeltaMs.toFixed(2) : '',
      t.matchConditionSchedule ?? '',
      t.decayFactor != null ? t.decayFactor.toFixed(4) : '',
      t.phaseElapsedMs != null ? t.phaseElapsedMs.toFixed(0) : '',
    ]));
  });
  return lines.join('\n');
}

function generateSummaryCSV(session, va100Result, contrastResults, allTrials, seamResult, kineticResult, kineticSeamResult, driftResult, spinResult) {
  const header = [
    'session_id', 'subject_id', 'eye_condition', 'distance_m',
    'phase_label',
    'contrast_percent', 'logCS',
    'VA_logMAR', 'VA_MAR', 'VA_decimal', 'snellen_equiv',
    'trials_count', 'confirmation_score',
    'guardrail_triggered', 'is_experimental',
    'mean_rt_ms', 'median_rt_ms',
    'fidelity_tier',
    'stimulus_kind', 'ball_theme',
    'extra_metric_name', 'extra_metric_value',
  ];
  const lines = [csvRow(header)];

  const rtStatsFor = (predicate) => {
    const rts = allTrials.filter(predicate).map((t) => t.reactionTimeMs).sort((a, b) => a - b);
    if (rts.length === 0) return { mean: '', median: '' };
    const mean = rts.reduce((a, b) => a + b, 0) / rts.length;
    const median = rts.length % 2 === 1
      ? rts[(rts.length - 1) / 2]
      : (rts[rts.length / 2 - 1] + rts[rts.length / 2]) / 2;
    return { mean: mean.toFixed(1), median: median.toFixed(1) };
  };

  // VA100 row @ 100% contrast
  if (va100Result) {
    const rts = rtStatsFor((t) => t.phase === 'VA100');
    lines.push(csvRow([
      session.sessionId, session.subjectId, session.eyeCondition, session.distanceM,
      'VA100',
      100, logCS(1.0).toFixed(4),
      va100Result.logMAR, va100Result.mar.toFixed(4), va100Result.decimalVA.toFixed(4),
      logMARtoSnellen(va100Result.logMAR, session.distanceM),
      va100Result.totalTrials, 'VA100_converged',
      'false', 'false',
      rts.mean, rts.median,
      FIDELITY_TIERS.CLINICAL_STATIC,
      'landolt', '',
      '', '',
    ]));
  }

  // Contrast rows
  (contrastResults || []).forEach((r) => {
    const rts = rtStatsFor((t) => t.phase === 'CONTRAST_VA' && Math.abs(t.contrastFraction - r.contrast) < 1e-9);
    lines.push(csvRow([
      session.sessionId, session.subjectId, session.eyeCondition, session.distanceM,
      `CONTRAST_${r.contrastPercent.toFixed(r.contrast < 0.01 ? 2 : 1)}pct`,
      r.contrastPercent.toFixed(3),
      r.logCS.toFixed(4),
      r.logMAR, r.mar.toFixed(4), r.decimalVA.toFixed(4),
      logMARtoSnellen(r.logMAR, session.distanceM),
      r.trialsCount, r.confirmationScore ?? '',
      r.guardrailTriggered ? 'true' : 'false',
      r.isExperimental ? 'true' : 'false',
      rts.mean, rts.median,
      FIDELITY_TIERS.CLINICAL_STATIC,
      'landolt', '',
      '', '',
    ]));
  });

  // Seam row (Phase 3a)
  if (seamResult) {
    const rts = rtStatsFor((t) => t.phase === 'SEAM_STATIC');
    lines.push(csvRow([
      session.sessionId, session.subjectId, session.eyeCondition, session.distanceM,
      'SEAM_STATIC',
      100, logCS(1.0).toFixed(4),
      seamResult.logMAR, seamResult.mar.toFixed(4), seamResult.decimalVA.toFixed(4),
      logMARtoSnellen(seamResult.logMAR, session.distanceM),
      seamResult.totalTrials, 'SEAM_converged',
      'false', 'false',
      rts.mean, rts.median,
      FIDELITY_TIERS.CLINICAL_STATIC,
      'ball', session.ballTheme ?? '',
      '', '',
    ]));
  }

  // Kinetic row (Phase 2 DEMO)
  if (kineticResult) {
    const rts = rtStatsFor((t) => t.phase === 'KINETIC_SPEED');
    lines.push(csvRow([
      session.sessionId, session.subjectId, session.eyeCondition, session.distanceM,
      'KINETIC_SPEED',
      100, logCS(1.0).toFixed(4),
      kineticResult.fixedLogMAR,
      logMARtoMAR(kineticResult.fixedLogMAR).toFixed(4),
      logMARtoDecimalVA(kineticResult.fixedLogMAR).toFixed(4),
      logMARtoSnellen(kineticResult.fixedLogMAR, session.distanceM),
      kineticResult.totalTrials, 'KINETIC_converged',
      'false', 'false',
      rts.mean, rts.median,
      FIDELITY_TIERS.DEMO_KINETIC,
      'kinetic_landolt', '',
      'threshold_speed_kmh', kineticResult.thresholdSpeedKmh.toFixed(1),
    ]));
  }

  // Kinetic Seam row (Phase 3b DEMO)
  if (kineticSeamResult) {
    const rts = rtStatsFor((t) => t.phase === 'KINETIC_SEAM');
    lines.push(csvRow([
      session.sessionId, session.subjectId, session.eyeCondition, session.distanceM,
      'KINETIC_SEAM',
      100, logCS(1.0).toFixed(4),
      kineticSeamResult.fixedLogMAR,
      logMARtoMAR(kineticSeamResult.fixedLogMAR).toFixed(4),
      logMARtoDecimalVA(kineticSeamResult.fixedLogMAR).toFixed(4),
      logMARtoSnellen(kineticSeamResult.fixedLogMAR, session.distanceM),
      kineticSeamResult.totalTrials, 'KINETIC_SEAM_converged',
      'false', 'false',
      rts.mean, rts.median,
      FIDELITY_TIERS.DEMO_KINETIC,
      'kinetic_ball', session.ballTheme ?? '',
      'threshold_speed_kmh', kineticSeamResult.thresholdSpeedKmh.toFixed(1),
    ]));
  }

  // Drift row (Phase 3c DEMO)
  if (driftResult) {
    const rts = rtStatsFor((t) => t.phase === 'DRIFT');
    lines.push(csvRow([
      session.sessionId, session.subjectId, session.eyeCondition, session.distanceM,
      'DRIFT',
      100, logCS(1.0).toFixed(4),
      driftResult.fixedLogMAR,
      logMARtoMAR(driftResult.fixedLogMAR).toFixed(4),
      logMARtoDecimalVA(driftResult.fixedLogMAR).toFixed(4),
      logMARtoSnellen(driftResult.fixedLogMAR, session.distanceM),
      driftResult.totalTrials, 'DRIFT_converged',
      'false', 'false',
      rts.mean, rts.median,
      FIDELITY_TIERS.DEMO_KINETIC,
      'kinetic_ball', session.ballTheme ?? '',
      'min_drift_px', driftResult.thresholdDriftPx.toFixed(1),
    ]));
  }

  // Spin row (Phase 3d DEMO)
  if (spinResult) {
    const rts = rtStatsFor((t) => t.phase === 'SPIN');
    lines.push(csvRow([
      session.sessionId, session.subjectId, session.eyeCondition, session.distanceM,
      'SPIN',
      100, logCS(1.0).toFixed(4),
      spinResult.fixedLogMAR,
      logMARtoMAR(spinResult.fixedLogMAR).toFixed(4),
      logMARtoDecimalVA(spinResult.fixedLogMAR).toFixed(4),
      logMARtoSnellen(spinResult.fixedLogMAR, session.distanceM),
      spinResult.totalTrials, 'SPIN_converged',
      'false', 'false',
      rts.mean, rts.median,
      FIDELITY_TIERS.DEMO_KINETIC,
      'kinetic_ball', session.ballTheme ?? '',
      'min_revs_per_sec', spinResult.thresholdRevsPerSec.toFixed(2),
    ]));
  }

  return lines.join('\n');
}

function downloadCSV(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ═══════════════════════════════════════════════════════════════
// SECTION 7: UI COMPONENTS
// ═══════════════════════════════════════════════════════════════

// ------- InfoTooltip -hover (desktop) or click (mobile) reveal -------

function InfoTooltip({ title, children, className = '', align = 'left' }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  // Dismiss on outside click
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (!wrapperRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <span ref={wrapperRef} className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        aria-label="More information"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {open && (
        <span
          role="tooltip"
          className={`absolute z-50 top-7 ${align === 'right' ? 'right-0' : 'left-0'} w-80 max-w-[90vw] p-3 bg-slate-900 text-slate-100 text-xs leading-snug rounded-lg shadow-xl border border-slate-700`}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          {title && <div className="font-semibold mb-1 text-slate-50">{title}</div>}
          <div className="text-slate-200">{children}</div>
        </span>
      )}
    </span>
  );
}

// ------- Footer with credit line -------

function AppFooter() {
  return (
    <footer className="mt-10 pt-6 pb-8 border-t border-slate-200 text-center text-xs text-slate-500">
      <div>
        OptoKVA · clinical visual acuity & contrast sensitivity instrument
      </div>
    </footer>
  );
}

// ------- Reference table (Spec 2.6) for MathVerifier -------

const REFERENCE_TABLE = [
  { logMAR: -0.60, MAR: 0.2512, snellen6: '6/1.5',  snellen18: '18/4.5'  },
  { logMAR: -0.50, MAR: 0.3162, snellen6: '6/1.9',  snellen18: '18/5.7'  },
  { logMAR: -0.40, MAR: 0.3981, snellen6: '6/2.4',  snellen18: '18/7.2'  },
  { logMAR: -0.30, MAR: 0.5012, snellen6: '6/3.0',  snellen18: '18/9.0'  },
  { logMAR: -0.20, MAR: 0.6310, snellen6: '6/3.8',  snellen18: '18/11.4' },
  { logMAR: -0.10, MAR: 0.7943, snellen6: '6/4.8',  snellen18: '18/14.3' },
  { logMAR:  0.00, MAR: 1.0000, snellen6: '6/6.0',  snellen18: '18/18.0' },
  { logMAR:  0.10, MAR: 1.2589, snellen6: '6/7.6',  snellen18: '18/22.7' },
  { logMAR:  0.20, MAR: 1.5849, snellen6: '6/9.5',  snellen18: '18/28.5' },
  { logMAR:  0.30, MAR: 1.9953, snellen6: '6/12.0', snellen18: '18/35.9' },
  { logMAR:  0.50, MAR: 3.1623, snellen6: '6/19.0', snellen18: '18/56.9' },
  { logMAR:  1.00, MAR: 10.0000, snellen6: '6/60.0', snellen18: '18/180.0' },
];

function MathVerifier() {
  return (
    <div className="bg-white rounded-lg border border-slate-300 p-4">
      <h3 className="font-semibold text-slate-800 mb-2">Math Verification -Reference Table (Spec 2.6)</h3>
      <table className="text-xs w-full">
        <thead>
          <tr className="text-slate-500 border-b border-slate-200">
            <th className="text-left py-1">logMAR</th>
            <th className="text-right">MAR (spec)</th>
            <th className="text-right">MAR (computed)</th>
            <th className="text-right">Snellen@6m (spec)</th>
            <th className="text-right">Snellen@6m (computed)</th>
            <th className="text-right">Snellen@18m (spec)</th>
            <th className="text-right">Snellen@18m (computed)</th>
            <th className="text-center">Match</th>
          </tr>
        </thead>
        <tbody>
          {REFERENCE_TABLE.map((row) => {
            const computedMAR = logMARtoMAR(row.logMAR);
            const computedS6 = logMARtoSnellen(row.logMAR, 6);
            const computedS18 = logMARtoSnellen(row.logMAR, 18);
            const marMatch = Math.abs(computedMAR - row.MAR) < 0.001;
            const s6Match = computedS6 === row.snellen6;
            const s18Match = computedS18 === row.snellen18;
            const allOK = marMatch && s6Match && s18Match;
            return (
              <tr key={row.logMAR} className="border-b border-slate-100">
                <td className="py-1">{row.logMAR.toFixed(2)}</td>
                <td className="text-right text-slate-500">{row.MAR.toFixed(4)}</td>
                <td className="text-right font-mono">{computedMAR.toFixed(4)}</td>
                <td className="text-right text-slate-500">{row.snellen6}</td>
                <td className="text-right font-mono">{computedS6}</td>
                <td className="text-right text-slate-500">{row.snellen18}</td>
                <td className="text-right font-mono">{computedS18}</td>
                <td className="text-center">{allOK ? '✓' : '✗'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RendererGallery() {
  const sizes = [40, 90, 180];
  return (
    <div className="bg-white rounded-lg border border-slate-300 p-4">
      <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
        Landolt C Renderer Gallery
        <InfoTooltip title="Visual rendering sanity check">
          Every one of the 8 Landolt-C orientations drawn at 3 different diameters. Use this to verify that the
          gap faces the correct direction and the inner hole is filled (never transparent). Orientations are laid
          out in a compass rose so the gap direction matches its spatial label.
        </InfoTooltip>
      </h3>
      {sizes.map((size) => (
        <div key={size} className="mb-4">
          <div className="text-xs text-slate-500 mb-2">Diameter = {size}px</div>
          <div className="grid grid-cols-3 gap-2 w-fit">
            {ORIENTATION_COMPASS_LAYOUT.flat().map((key, i) => {
              if (!key) {
                return (
                  <div
                    key={`empty-${i}`}
                    className="flex items-center justify-center text-slate-300 text-[9px]"
                    style={{ minWidth: size + 12, minHeight: size + 24 }}
                  >
                    ·
                  </div>
                );
              }
              return (
                <div key={key} className="flex flex-col items-center">
                  <div className="border border-slate-200 p-1 bg-white">
                    <LandoltCCanvas diameter={size} orientation={key} />
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">{ORIENTATIONS[key].label}</div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ------- Contrast gallery (Section 4 visual sanity) -------

function ContrastGallery() {
  return (
    <div className="bg-white rounded-lg border border-slate-300 p-4">
      <h3 className="font-semibold text-slate-800 mb-3">Contrast Ladder (80px Landolt C at each contrast)</h3>
      <div className="flex gap-4 flex-wrap items-end">
        {[1.0, ...CONFIG.CONTRAST_LEVELS].map((c) => {
          const gray = contrastToGray(c);
          const hex = grayToHex(gray);
          const tag = getReliabilityTag(c);
          return (
            <div key={c} className="flex flex-col items-center">
              <div className="border border-slate-200 bg-white p-1">
                <LandoltCCanvas diameter={80} orientation="right" ringColor={hex} />
              </div>
              <div className="text-[10px] text-slate-600 mt-1">{(c * 100).toFixed(c < 0.01 ? 2 : 1)}%</div>
              <div className="text-[9px] text-slate-400 font-mono">gray {gray}</div>
              <div className={`text-[9px] mt-0.5 ${
                tag === 'experimental' ? 'text-rose-600' : tag === 'caution' ? 'text-amber-600' : 'text-emerald-600'
              }`}>{tag}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ------- About Screen -------
//
// Long-form explainer covering the clinical purpose, the methodology,
// the technical implementation, and the credit line. Opened from the
// Setup screen via the "About" button, closed via the back arrow.

function AboutScreen({ onBack }) {
  const Section = ({ title, children }) => (
    <section className="bg-white rounded-lg border border-slate-300 p-6 mb-5">
      <h2 className="text-lg font-semibold text-slate-800 mb-3">{title}</h2>
      <div className="text-sm text-slate-700 leading-relaxed space-y-3">{children}</div>
    </section>
  );

  return (
    <div className="min-h-screen bg-slate-50 px-3 py-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Setup
          </button>
          <h1 className="text-3xl font-bold text-slate-800">About OptoKVA</h1>
        </div>

        <Section title="What this is">
          <p>
            <strong>OptoKVA</strong> is a clinical visual acuity and contrast sensitivity testing instrument,
            designed for research on the visual abilities of elite athletes -specifically professional cricket
            players whose vision is typically better than any standard eye chart can measure. It extends
            classical static VA testing with contrast-sensitivity profiling and sport-specific kinetic tasks
            (approaching cricket balls with readable seams, lateral drift, and spin).
          </p>
          <p>
            The instrument combines the precision of a clinical wall chart with the ecological validity of a
            sport-specific task, and exposes every trial as research-grade data so findings can be published
            and biometric-integrated with corneal topography, axial length, and match statistics.
          </p>
        </Section>

        <Section title="Why a new instrument?">
          <p>
            A standard Snellen chart stops being useful at 6/6 (logMAR 0.00) -and a huge fraction of elite
            cricketers see <strong>6/3 or better</strong>. On a printed chart those players all read the bottom
            row; their real differences are invisible.
          </p>
          <p>
            OptoKVA uses an <strong>adaptive staircase</strong> -it measures the subject by actively making
            the optotype smaller until they fail, rather than stopping at a preprinted floor. A 0.05 logMAR
            resolution (finer than any printed chart) is reached in 10–15 trials. Supranormal vision down to
            logMAR −0.60 (≈ 6/1.5) is measurable.
          </p>
          <p>
            A second dimension -<strong>contrast sensitivity</strong> -exposes performance differences that
            are invisible on a full-contrast chart. Two players with identical 6/3 VA can diverge wildly at 10%
            contrast. The functional difference matters on-field, especially at dusk or under floodlights.
          </p>
          <p>
            A third dimension -<strong>sport-specific stimuli</strong> -replaces the abstract Landolt C with
            a rendered cricket ball whose seam line is the limiting detail. The correlation between abstract
            and sport-specific thresholds is itself a research question.
          </p>
        </Section>

        <Section title="Core clinical concepts">
          <p>
            <strong>MAR</strong> (Minimum Angle of Resolution, in arcminutes). The smallest angle at which the
            subject can tell a gap is a gap. Normal vision resolves 1 arcminute (6/6). Elite vision resolves
            0.5 arcminutes (6/3) -half the angle, twice the detail.
          </p>
          <p>
            <strong>logMAR = log₁₀(MAR)</strong>. Same measurement on a logarithmic scale. logMAR 0.00 = 6/6,
            logMAR −0.30 = 6/3. Every 0.10 step is a constant perceptual difference, which is what makes the
            staircase algorithm valid.
          </p>
          <p>
            <strong>Snellen notation</strong> (6/X or 20/X). The denominator is the distance at which a
            normal-vision observer would need to stand to barely resolve what this subject resolves at the
            numerator's distance.
          </p>
          <p>
            <strong>Weber contrast</strong>:
            <code className="ml-1 bg-slate-100 px-1 rounded font-mono">C = (L_background − L_target) / L_background</code>.
            Expressed as a fraction (0 to 1) or percent. Phase 1b sweeps through 7 contrast levels from 25% down to 0.1%.
          </p>
          <p>
            <strong>Landolt C</strong>. A broken ring with a gap of exactly D/5, in one of 8 directions. Chosen
            over letters because letters are pattern-matchable from familiarity -the Landolt C gap is pure
            spatial resolution. 12.5% chance level from 8 options heavily penalises guessing.
          </p>
        </Section>

        <Section title="Methodology -the staircase">
          <p>
            <strong>VA100 staircase</strong> (Phase 1a):
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2 text-slate-700">
            <li>Start at logMAR 1.0 (6/60, very easy).</li>
            <li><strong>DESCENT</strong>: step −0.50 logMAR per correct response (aggressive descent).</li>
            <li><strong>REVERSAL</strong>: on first incorrect, step back up through a ladder of +0.25, +0.20, +0.15, +0.10, +0.05.</li>
            <li><strong>CONFIRMATION</strong>: 5 trials at the same logMAR; ≥3/5 correct = confirmed pass; step −0.05 and confirm again until the next harder level fails.</li>
            <li>Hard trial limit: 60. Clamped to [−0.60, 1.00] logMAR.</li>
            <li>Termination: smallest logMAR with ≥3/5 confirmed pass AND next-harder level fails.</li>
          </ul>
          <p>
            <strong>Contrast-VA sweep</strong> (Phase 1b): a faster descending-then-confirm staircase at each of
            7 contrast levels. Seeded from VA100 result + a contrast-specific delta. Monotonic guardrail: VA
            cannot get <em>better</em> at lower contrast -if it does, re-verify the current level once before
            accepting.
          </p>
          <p>
            <strong>Kinetic / drift / spin staircases</strong> (Phase 2, 3b, 3c, 3d): same VA100 state machine,
            parameterised on speed (km/h), drift amount (px), or rotation rate (rev/s) instead of logMAR. The
            engine factory <code className="bg-slate-100 px-1 rounded font-mono">makeDescendingStaircase</code>{' '}
            produces all three from a single config.
          </p>
        </Section>

        <Section title="Fidelity tiers -the research safety net">
          <p>
            Every trial and every summary CSV row carries a <strong>fidelity_tier</strong> flag. This is the
            single most important guardrail for research validity.
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2 text-slate-700">
            <li>
              <span className="font-mono px-1 bg-emerald-100 text-emerald-800 rounded">CLINICAL_STATIC</span>
              -Phase 1a, 1b, 3a. Static measurements on a calibrated display are clinical-grade. Publishable.
            </li>
            <li>
              <span className="font-mono px-1 bg-rose-100 text-rose-800 rounded">DEMO_KINETIC</span> -Phase 2,
              3b, 3c, 3d on the web. Browser <code>requestAnimationFrame</code> cannot guarantee the
              sub-millisecond timing precision needed for clinical kinetic claims. For design iteration,
              collaborator demos, and concept validation only. Native iOS (with <code>CADisplayLink</code>,
              120 Hz displays, and no GC jitter) re-measures these for publication.
            </li>
            <li>
              <span className="font-mono px-1 bg-slate-200 text-slate-800 rounded">DEMO_TRAINING</span> -
              reserved for the future Phase 4 training mode, which is an intervention rather than a measurement.
            </li>
          </ul>
          <p>
            Downstream analytics pipelines filter to <code>fidelity_tier = CLINICAL_STATIC</code> for publishable
            models. DEMO tags propagate through the UI, the results cards, and every CSV row -so a kinetic
            number measured on the web cannot accidentally contaminate a clinical claim.
          </p>
        </Section>

        <Section title="Technical architecture">
          <p>
            OptoKVA is deliberately minimal: a single-file React prototype with pure-function psychophysical
            engines. The architecture is optimised for <strong>auditability</strong> (read every line of the
            staircase logic in ~200 lines of JS) and <strong>portability</strong> (the pure-function design
            translates mechanically to Swift/Kotlin for native ports).
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2 text-slate-700">
            <li><strong>Engine layer</strong> -pure functions on plain state objects. No React, no DOM, no side effects. Seeded random orientation picker → reproducible sessions.</li>
            <li><strong>Renderer layer</strong> -HTML5 Canvas with HiDPI (<code>devicePixelRatio</code>) scaling. Separate components for Landolt C, cricket ball, and kinetic (RAF-driven) rendering.</li>
            <li><strong>Adapter pattern</strong> -every phase is wrapped in an engine adapter exposing <code>createInitialState</code>, <code>getNextTrial</code>, <code>processResponse</code>, <code>renderStimulus</code>, etc. Adding a new phase means adding one adapter; nothing else needs to change.</li>
            <li><strong>State management</strong> -<code>useReducer</code> with an explicit phase cursor that walks through <code>session.battery.phases</code>. Zero routing library, zero global state.</li>
            <li><strong>Data export</strong> -every trial timestamped with ISO-8601, sub-millisecond RT via <code>performance.now()</code>. Trial CSV has ~42 columns; summary CSV has ~22 columns plus a forward-compatible <code>extra_metric_name</code>/<code>extra_metric_value</code> slot for non-logMAR metrics (speed, drift, rev/s).</li>
            <li><strong>No external API calls</strong> -the app is entirely client-side until the Phase 5 backend ingest is built. Data stays in the browser until CSV is downloaded.</li>
          </ul>
          <p>
            Dependencies: React 18, Tailwind CSS, recharts (for the VA-vs-contrast chart), lucide-react (icons),
            Vite (dev server). Total external surface area is intentionally small so the prototype is easy to
            audit and to port.
          </p>
        </Section>

        <Section title="Phase map">
          <ul className="list-disc list-inside space-y-1 ml-2 text-slate-700">
            <li><strong>Phase 1a</strong> VA100 -static visual acuity at 100% contrast.</li>
            <li><strong>Phase 1b</strong> Contrast-VA -7-level contrast sensitivity sweep.</li>
            <li><strong>Phase 2</strong> Kinetic VA -approaching Landolt C at configurable speed.</li>
            <li><strong>Phase 3a</strong> Static seam -cricket ball with a seam line as the limiting detail.</li>
            <li><strong>Phase 3b</strong> Kinetic seam -approaching cricket ball with a resolvable seam.</li>
            <li><strong>Phase 3c</strong> Drift / swing -lateral movement detection during approach.</li>
            <li><strong>Phase 3d</strong> Spin -rotational axis detection during approach.</li>
            <li><strong>Phase 3e</strong> Match conditions -themed backdrops + twilight contrast decay schedule.</li>
            <li><strong>Phase 4</strong> Training mode (not yet implemented) -gamified longitudinal training rather than measurement.</li>
            <li><strong>Phase 5</strong> Analytics / ML (not yet implemented) -backend ingest, feature store, XGBoost predictors, normative database.</li>
          </ul>
        </Section>

        <Section title="Credit & licensing">
          <p>
            OptoKVA was conceived by{' '}
            <strong>Dr. Daya Sharma</strong>, consultant ophthalmologist and cataract, corneal, and refractive
            surgeon at Eye & Laser Surgeons, as part of the Cricket NSW visual performance programme.
            Dr. Sharma identified the clinical need for a psychophysical instrument that could differentiate
            supranormal visual performance in elite cricketers beyond the ceiling of standard Snellen charts,
            and defined the clinical protocol including the adaptive staircase methodology, contrast sensitivity
            profiling, and sport-specific seam-detection tasks.
          </p>
          <p>
            The instrument was developed and implemented by{' '}
            <a
              href="https://www.linkedin.com/in/yagizalpaksoy/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-900 underline font-semibold"
            >
              Dr. Yagiz Aksoy, MD PhD
            </a>
            , clinician-researcher, who designed the software architecture, built the adaptive engines, the
            rendering pipeline, the data export system, and the web prototype.
          </p>
          <p>
            The web prototype serves as the reference implementation and a shareable collaborator demo. Native
            iOS and Android ports will follow the same engine design and produce the same CSV schema so
            cross-platform data is directly comparable.
          </p>
        </Section>

        <AppFooter />
      </div>
    </div>
  );
}

function TestHarness({ onBack }) {
  const [logMAR, setLogMAR] = useState(0.0);
  const [distanceM, setDistanceM] = useState(6);
  const [screenHeightMm, setScreenHeightMm] = useState(180);
  const [screenHeightPx, setScreenHeightPx] = useState(1000);
  const [orientation, setOrientation] = useState('right');
  const [contrast, setContrast] = useState(1.0);

  const pipeline = useMemo(
    () => diameterPixels(logMAR, distanceM, screenHeightMm, screenHeightPx),
    [logMAR, distanceM, screenHeightMm, screenHeightPx]
  );
  const ringColor = useMemo(() => grayToHex(contrastToGray(contrast)), [contrast]);

  return (
    <div className="min-h-screen bg-slate-50 px-3 py-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <h1 className="text-2xl font-bold text-slate-800">Step 1 · Math & Renderer Test Harness</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-lg border border-slate-300 p-5">
            <h2 className="font-semibold text-slate-800 mb-4">Parameters</h2>

            <label className="block mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span>logMAR</span><span className="font-mono">{logMAR.toFixed(2)}</span>
              </div>
              <input type="range" min={CONFIG.LOGMAR_MIN} max={CONFIG.LOGMAR_MAX} step={0.05}
                     value={logMAR} onChange={(e) => setLogMAR(parseFloat(e.target.value))} className="w-full" />
            </label>

            <label className="block mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span>Test distance (m)</span><span className="font-mono">{distanceM}</span>
              </div>
              <input type="range" min={1} max={30} step={0.5}
                     value={distanceM} onChange={(e) => setDistanceM(parseFloat(e.target.value))} className="w-full" />
            </label>

            <label className="block mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span>Screen height (mm)</span><span className="font-mono">{screenHeightMm}</span>
              </div>
              <input type="range" min={100} max={500} step={1}
                     value={screenHeightMm} onChange={(e) => setScreenHeightMm(parseFloat(e.target.value))} className="w-full" />
            </label>

            <label className="block mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span>Screen height (px)</span><span className="font-mono">{screenHeightPx}</span>
              </div>
              <input type="range" min={400} max={3000} step={10}
                     value={screenHeightPx} onChange={(e) => setScreenHeightPx(parseFloat(e.target.value))} className="w-full" />
            </label>

            <label className="block mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span>Contrast</span><span className="font-mono">{(contrast * 100).toFixed(contrast < 0.01 ? 2 : 1)}%</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {[1.0, ...CONFIG.CONTRAST_LEVELS].map((c) => (
                  <button key={c}
                          onClick={() => setContrast(c)}
                          className={`text-xs px-2 py-1 rounded border ${
                            contrast === c ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}>
                    {(c * 100).toFixed(c < 0.01 ? 2 : 1)}%
                  </button>
                ))}
              </div>
            </label>

            <div className="mb-2">
              <div className="text-sm mb-1">Orientation (compass rose)</div>
              <div className="grid grid-cols-3 gap-1 w-44">
                {ORIENTATION_COMPASS_LAYOUT.flat().map((key, i) => {
                  if (!key) {
                    return <div key={`empty-${i}`} className="aspect-square" />;
                  }
                  return (
                    <button
                      key={key}
                      onClick={() => setOrientation(key)}
                      title={ORIENTATIONS[key].label}
                      className={`aspect-square text-lg rounded border ${
                        orientation === key
                          ? 'bg-slate-800 text-white border-slate-800'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {COMPASS_GLYPHS[key]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-300 p-5">
            <h2 className="font-semibold text-slate-800 mb-4">Computed values (7-step pipeline)</h2>
            <table className="text-sm w-full mb-4">
              <tbody>
                <tr><td className="text-slate-500 py-1">MAR (arcmin)</td><td className="text-right font-mono">{pipeline.mar.toFixed(4)}</td></tr>
                <tr><td className="text-slate-500 py-1">Angle (rad)</td><td className="text-right font-mono">{pipeline.angleRad.toExponential(3)}</td></tr>
                <tr><td className="text-slate-500 py-1">Gap (mm)</td><td className="text-right font-mono">{pipeline.gapMm.toFixed(3)}</td></tr>
                <tr><td className="text-slate-500 py-1">Diameter (mm)</td><td className="text-right font-mono">{pipeline.D_mm.toFixed(3)}</td></tr>
                <tr><td className="text-slate-500 py-1">mm / pixel</td><td className="text-right font-mono">{pipeline.mmPerPixel.toFixed(4)}</td></tr>
                <tr><td className="text-slate-500 py-1">Diameter (px)</td><td className="text-right font-mono font-bold">{pipeline.D_pixels.toFixed(2)}</td></tr>
                <tr><td className="text-slate-500 py-1">Decimal VA</td><td className="text-right font-mono">{logMARtoDecimalVA(logMAR).toFixed(3)}</td></tr>
                <tr><td className="text-slate-500 py-1">Snellen @ {distanceM}m</td><td className="text-right font-mono">{logMARtoSnellen(logMAR, distanceM)}</td></tr>
                <tr><td className="text-slate-500 py-1">Gray (ring)</td><td className="text-right font-mono">{contrastToGray(contrast)} / {ringColor}</td></tr>
                <tr><td className="text-slate-500 py-1">Reliability</td><td className="text-right font-mono">{getReliabilityTag(contrast)}</td></tr>
              </tbody>
            </table>

            <div className="flex justify-center items-center bg-white border border-slate-200 p-4 min-h-[250px]">
              {pipeline.D_pixels >= CONFIG.MIN_RENDER_DIAMETER_PX ? (
                <LandoltCCanvas diameter={pipeline.D_pixels} orientation={orientation} ringColor={ringColor} />
              ) : (
                <div className="text-sm text-red-600">
                  Optotype too small for display ({pipeline.D_pixels.toFixed(1)}px &lt; {CONFIG.MIN_RENDER_DIAMETER_PX}px).
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <MathVerifier />
          <ContrastGallery />
          <RendererGallery />
        </div>

        <AppFooter />
      </div>
    </div>
  );
}

// ------- Setup Screen -------

function SetupScreen({ initialSession, onStart, onOpenHarness, onOpenAbout }) {
  const [subjectId, setSubjectId] = useState(initialSession?.subjectId ?? '');
  const [eyeCondition, setEyeCondition] = useState(initialSession?.eyeCondition ?? 'OU');
  const [distanceM, setDistanceM] = useState(initialSession?.distanceM ?? 18);
  const [screenHeightMm, setScreenHeightMm] = useState(initialSession?.screenHeightMm ?? 180);
  const [screenHeightPx, setScreenHeightPx] = useState(() => {
    if (initialSession?.screenHeightPx) return initialSession.screenHeightPx;
    if (typeof window !== 'undefined' && window.screen?.height > 0) return window.screen.height;
    return 1080;
  });
  const [notes, setNotes] = useState(initialSession?.notes ?? '');
  const [battery, setBattery] = useState(initialSession?.battery ?? 'PHASE1_VA_CONTRAST');
  const [ballTheme, setBallTheme] = useState(initialSession?.ballTheme ?? DEFAULT_BALL_THEME);
  const [kineticLogMAR, setKineticLogMAR] = useState(initialSession?.kineticLogMAR ?? CONFIG.KINETIC_DEFAULT_LOGMAR);
  const [kineticStartSpeed, setKineticStartSpeed] = useState(initialSession?.kineticStartSpeed ?? CONFIG.KINETIC_DEFAULT_START_SPEED_KMH);
  const [plainBackground, setPlainBackground] = useState(initialSession?.plainBackground ?? false);
  const [matchConditionSchedule, setMatchConditionSchedule] = useState(
    initialSession?.matchConditionSchedule ?? DEFAULT_MATCH_CONDITION_SCHEDULE
  );

  const pipelineAt0 = useMemo(
    () => diameterPixels(0.0, distanceM, screenHeightMm, screenHeightPx),
    [distanceM, screenHeightMm, screenHeightPx]
  );
  const ballPipelineAt0 = useMemo(
    () => ballDiameterPixels(0.0, distanceM, screenHeightMm, screenHeightPx),
    [distanceM, screenHeightMm, screenHeightPx]
  );

  const canStart = subjectId.trim().length > 0 && distanceM > 0 && screenHeightMm > 0 && screenHeightPx > 0;
  const batteryPhases = TEST_BATTERIES[battery]?.phases ?? [];
  const showsSeamControls =
    batteryPhases.includes('SEAM_STATIC') ||
    batteryPhases.includes('KINETIC_SEAM') ||
    batteryPhases.includes('DRIFT') ||
    batteryPhases.includes('SPIN');
  const showsKineticControls =
    batteryPhases.includes('KINETIC_SPEED') ||
    batteryPhases.includes('KINETIC_SEAM') ||
    batteryPhases.includes('DRIFT') ||
    batteryPhases.includes('SPIN');

  const startLabel = batteryPhases.includes('VA100')
    ? 'Start VA100 Test'
    : batteryPhases[0] === 'SEAM_STATIC'
      ? 'Start Seam Test'
      : batteryPhases[0] === 'KINETIC_SPEED'
        ? 'Start Kinetic DEMO'
        : batteryPhases[0] === 'KINETIC_SEAM'
          ? 'Start Kinetic Seam DEMO'
          : batteryPhases[0] === 'DRIFT'
            ? 'Start Drift DEMO'
            : batteryPhases[0] === 'SPIN'
              ? 'Start Spin DEMO'
              : 'Start Test';

  const handleStart = () => {
    if (!canStart) return;
    onStart({
      sessionId: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      subjectId: subjectId.trim(),
      eyeCondition,
      distanceM: parseFloat(distanceM),
      screenHeightMm: parseFloat(screenHeightMm),
      screenHeightPx: parseFloat(screenHeightPx),
      startTime: new Date().toISOString(),
      deviceDesc: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      notes,
      battery,
      ballTheme,
      plainBackground,
      matchConditionSchedule,
      kineticLogMAR: parseFloat(kineticLogMAR),
      kineticStartSpeed: parseFloat(kineticStartSpeed),
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 px-3 py-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Eye className="w-7 h-7 text-slate-700" />
          <h1 className="text-3xl font-bold text-slate-800 flex-1">OptoKVA · Session Setup</h1>
          <button
            onClick={onOpenAbout}
            className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 underline"
            title="Clinical, methodology and technical background"
          >
            <BookOpen className="w-4 h-4" /> About
          </button>
        </div>

        <div className="bg-white rounded-lg border border-slate-300 p-6 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <div className="text-sm text-slate-700 mb-1">Subject ID <span className="text-red-500">*</span></div>
              <input type="text" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}
                     placeholder="e.g. CR-001"
                     className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
            </label>

            <label className="block">
              <div className="text-sm text-slate-700 mb-1">Eye condition</div>
              <select value={eyeCondition} onChange={(e) => setEyeCondition(e.target.value)}
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm bg-white">
                {EYE_CONDITIONS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
              </select>
            </label>

            <label className="block">
              <div className="text-sm text-slate-700 mb-1">Test distance (m) <span className="text-red-500">*</span></div>
              <input type="number" value={distanceM} min={1} max={30} step={0.1}
                     onChange={(e) => setDistanceM(e.target.value === '' ? '' : parseFloat(e.target.value))}
                     className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
            </label>

            <label className="block">
              <div className="text-sm text-slate-700 mb-1">Screen height (mm) <span className="text-red-500">*</span></div>
              <input type="number" value={screenHeightMm} min={50} max={1000} step={1}
                     onChange={(e) => setScreenHeightMm(e.target.value === '' ? '' : parseFloat(e.target.value))}
                     className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
            </label>

            <label className="block">
              <div className="text-sm text-slate-700 mb-1">Screen height (px) <span className="text-red-500">*</span></div>
              <input type="number" value={screenHeightPx} min={200} max={6000} step={1}
                     onChange={(e) => setScreenHeightPx(e.target.value === '' ? '' : parseFloat(e.target.value))}
                     className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
            </label>
          </div>

          <div className="mt-4 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded p-3">
            <strong>Calibration:</strong> Measure the physical height of your screen display area in millimetres with a ruler.
            Screen height in pixels is the vertical resolution of your display. Accurate sizing depends on this calibration.
          </div>

          <label className="block mt-4">
            <div className="text-sm text-slate-700 mb-1">Operator notes</div>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
          </label>
        </div>

        <div className="bg-white rounded-lg border border-slate-300 p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-semibold text-slate-800">Test Battery</h2>
            <InfoTooltip title="Choose which phases to run">
              Each battery runs one or more test phases in sequence. Start with <strong>Phase 1</strong> for the
              scientific reference measurement, or pick <strong>Full static</strong> for a complete ~8-minute
              session. <strong>DEMO</strong>-tagged phases are demonstration-only on the web -RAF timing is
              insufficient for clinical kinetic claims.
            </InfoTooltip>
          </div>
          <div className="space-y-2">
            {Object.entries(TEST_BATTERIES).map(([key, b]) => {
              const isDemo = b.tier === 'demo';
              const isMixed = b.tier === 'mixed';
              return (
                <label key={key} className="flex items-start gap-2 text-sm py-1">
                  <input
                    type="radio"
                    name="battery"
                    value={key}
                    checked={battery === key}
                    onChange={() => setBattery(key)}
                    className="mt-1"
                  />
                  <span className="flex-1">
                    <span className={isDemo ? 'text-slate-700' : 'text-slate-900 font-medium'}>{b.label}</span>
                    {isDemo && <span className="ml-2 px-1.5 py-0.5 bg-rose-100 text-rose-700 text-[10px] rounded font-semibold">DEMO</span>}
                    {isMixed && <span className="ml-2 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded font-semibold">MIXED</span>}
                    {!isDemo && !isMixed && <span className="ml-2 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] rounded font-semibold">CLINICAL</span>}
                    <span className="ml-2 text-xs text-slate-400">({b.phases.join(' → ')})</span>
                  </span>
                  <InfoTooltip title={b.label} align="right">
                    {b.description}
                  </InfoTooltip>
                </label>
              );
            })}
          </div>

          {showsKineticControls && (
            <div className="mt-4 pt-4 border-t border-slate-200">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold text-slate-700">Kinetic VA (Phase 2)</h3>
                <span className="px-2 py-0.5 bg-rose-600 text-white text-[10px] rounded font-semibold">DEMO</span>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                Web-timing fidelity is insufficient for clinical claims. All kinetic trials are tagged
                <strong> DEMO_KINETIC</strong> in both the UI and the CSV exports, and frame-jitter metadata is recorded
                per trial so you can see how good your display's RAF timing actually is.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <div className="text-xs text-slate-700 mb-1">Starting logMAR (detail level at 18 m)</div>
                  <input
                    type="number"
                    min={CONFIG.LOGMAR_MIN}
                    max={CONFIG.LOGMAR_MAX}
                    step={0.05}
                    value={kineticLogMAR}
                    onChange={(e) => setKineticLogMAR(e.target.value)}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <div className="text-xs text-slate-700 mb-1">Starting speed (km/h)</div>
                  <input
                    type="number"
                    min={CONFIG.KINETIC_SPEED_MIN_KMH}
                    max={CONFIG.KINETIC_SPEED_MAX_KMH}
                    step={5}
                    value={kineticStartSpeed}
                    onChange={(e) => setKineticStartSpeed(e.target.value)}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                Simulated approach: {CONFIG.KINETIC_START_DISTANCE_M}m → {CONFIG.KINETIC_END_DISTANCE_M}m ·
                travel time at {kineticStartSpeed || 0} km/h ≈{' '}
                <span className="font-mono">{kineticStartSpeed > 0 ? kineticTravelTimeMs(parseFloat(kineticStartSpeed)).toFixed(0) : '-'} ms</span>
                {' · '}3 × {CONFIG.KINETIC_CUE_FLASH_ON_MS}ms ring cues before each trial
              </div>
            </div>
          )}

          {showsSeamControls && (
            <div className="mt-4 pt-4 border-t border-slate-200">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm font-semibold text-slate-700">Match Conditions (Phase 3e)</h3>
                <span className="text-[10px] text-slate-400">applies to Phase 3a/3b/3c/3d ball stimuli</span>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                Preset combinations of ball colour and backdrop that mirror real playing conditions.
                The ball-to-background contrast is clinically meaningful -a pink ball at twilight is functionally
                different from the same ball against a plain backdrop.
              </p>

              <label className="flex items-center gap-2 mb-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={plainBackground}
                  onChange={(e) => setPlainBackground(e.target.checked)}
                />
                <span>
                  Use <strong>plain white background</strong> (isolate the detail task from the ground colour)
                </span>
              </label>

              <div className={`flex gap-3 flex-wrap ${plainBackground ? 'opacity-50' : ''}`}>
                {BALL_THEME_KEYS.map((key) => {
                  const theme = BALL_THEMES[key];
                  const selected = ballTheme === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setBallTheme(key)}
                      disabled={plainBackground}
                      className={`flex items-center gap-2 px-3 py-2 rounded border text-sm ${
                        selected ? 'border-slate-800 ring-2 ring-slate-300' : 'border-slate-300 hover:bg-slate-50'
                      } ${plainBackground ? 'cursor-not-allowed' : ''}`}
                      style={{
                        backgroundColor: plainBackground ? '#FFFFFF' : theme.bg,
                        color: plainBackground ? '#334155' : theme.seam,
                      }}
                    >
                      <span
                        className="inline-block rounded-full border"
                        style={{ width: 22, height: 22, backgroundColor: theme.ball, borderColor: plainBackground ? '#334155' : theme.seam }}
                      />
                      <span>{theme.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 pt-3 border-t border-dashed border-slate-200">
                <div className="text-sm font-semibold text-slate-700 mb-1">Twilight decay (3e)</div>
                <p className="text-xs text-slate-500 mb-2">
                  Optional: gradually fade the seam's contrast against the ball over session time,
                  simulating how a real match's visual conditions deteriorate from full daylight through dusk to
                  floodlit night. The staircase still runs normally; the <strong>decay factor is recorded per trial</strong>
                  so you can see at what session time performance broke down.
                </p>
                <div className="flex gap-2 flex-wrap">
                  {MATCH_CONDITION_SCHEDULE_KEYS.map((key) => {
                    const sch = MATCH_CONDITION_SCHEDULES[key];
                    const selected = matchConditionSchedule === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setMatchConditionSchedule(key)}
                        className={`text-xs px-3 py-2 rounded border ${
                          selected ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {sch.label}
                      </button>
                    );
                  })}
                </div>
                {matchConditionSchedule !== 'CONSTANT' && (
                  <p className="text-[11px] text-slate-500 mt-2 font-mono">
                    decayStart={MATCH_CONDITION_SCHEDULES[matchConditionSchedule].decayStart} →
                    decayEnd={MATCH_CONDITION_SCHEDULES[matchConditionSchedule].decayEnd} over
                    {' '}{MATCH_CONDITION_SCHEDULES[matchConditionSchedule].durationSec}s
                  </p>
                )}
              </div>

              <p className="text-xs text-slate-500 mt-3">
                <strong>Seam response rule:</strong> a seam is an axis, not a vector -the correctness rule accepts
                either the presented direction or its 180° opposite on the 8-direction compass.
                {(batteryPhases.includes('DRIFT') || batteryPhases.includes('SPIN')) && (
                  <>
                    {' '}<strong>Drift / Spin input:</strong> only the <kbd>←</kbd> and <kbd>→</kbd> compass buttons
                    count. In Spin, <kbd>←</kbd> = CCW rotation and <kbd>→</kbd> = CW.
                  </>
                )}
              </p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border border-slate-300 p-5 mb-4">
          <h2 className="font-semibold text-slate-800 mb-3">Calibration Check</h2>
          <p className="text-sm text-slate-600 mb-2">
            At your settings, a <strong>6/6 (logMAR 0.0)</strong> Landolt C will render as approximately{' '}
            <span className="font-mono">{pipelineAt0.D_mm.toFixed(2)} mm</span>{' '}/{' '}
            <span className="font-mono">{pipelineAt0.D_pixels.toFixed(1)} px</span>{' '}
            (gap ≈ <span className="font-mono">{pipelineAt0.gapMm.toFixed(2)} mm</span>).
          </p>
          {showsSeamControls && (
            <p className="text-sm text-slate-600 mb-2">
              A <strong>6/6 cricket ball</strong> (seam = D/12) will render at{' '}
              <span className="font-mono">{ballPipelineAt0.D_mm.toFixed(2)} mm</span>{' '}/{' '}
              <span className="font-mono">{ballPipelineAt0.D_pixels.toFixed(1)} px</span>{' '}
              (seam ≈ <span className="font-mono">{ballPipelineAt0.seamMm.toFixed(2)} mm</span>).
            </p>
          )}
          <div className="flex items-center gap-4 mt-2 bg-slate-50 border border-slate-200 rounded p-3">
            <div className="text-xs text-slate-500">Preview (logMAR 0.0):</div>
            {pipelineAt0.D_pixels >= CONFIG.MIN_RENDER_DIAMETER_PX ? (
              <LandoltCCanvas diameter={pipelineAt0.D_pixels} orientation="right" />
            ) : (
              <div className="text-xs text-red-600">Too small to render.</div>
            )}
            {showsSeamControls && ballPipelineAt0.D_pixels >= CONFIG.MIN_RENDER_DIAMETER_PX && (
              <div style={{ backgroundColor: BALL_THEMES[ballTheme].bg, padding: 4, borderRadius: 4 }}>
                <BallCanvas
                  diameter={ballPipelineAt0.D_pixels}
                  seamOrientation="right"
                  ballColor={BALL_THEMES[ballTheme].ball}
                  seamColor={BALL_THEMES[ballTheme].seam}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <button onClick={onOpenHarness} className="text-sm text-slate-600 underline hover:text-slate-900">
            Math verification & renderer gallery →
          </button>
          <button onClick={handleStart} disabled={!canStart}
                  className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-white ${
                    canStart ? 'bg-slate-800 hover:bg-slate-900' : 'bg-slate-400 cursor-not-allowed'
                  }`}>
            <Play className="w-4 h-4" /> {startLabel}
          </button>
        </div>

        <AppFooter />
      </div>
    </div>
  );
}

// ------- Compass Input -------

const COMPASS_LAYOUT = [
  ['upLeft', 'up', 'upRight'],
  ['left',   'pass', 'right'],
  ['downLeft', 'down', 'downRight'],
];

const COMPASS_GLYPHS = {
  up: '↑', upRight: '↗', right: '→', downRight: '↘',
  down: '↓', downLeft: '↙', left: '←', upLeft: '↖', pass: '·',
};

function CompassInput({ onResponse, feedbackKey, feedbackCorrect, disabled }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full max-w-xs sm:max-w-md mx-auto">
      {COMPASS_LAYOUT.flat().map((key) => {
        const isFeedback = feedbackKey === key;
        const fbClass = isFeedback
          ? feedbackCorrect ? 'bg-emerald-200 border-emerald-500' : 'bg-rose-200 border-rose-500'
          : 'bg-white hover:bg-slate-100 border-slate-300';
        const passStyle = key === 'pass' ? 'text-slate-400 italic text-sm' : 'text-3xl';
        return (
          <button key={key} disabled={disabled} onClick={() => onResponse(key)}
                  className={`aspect-square rounded-lg border-2 flex items-center justify-center font-bold transition-colors ${fbClass} ${passStyle} ${
                    disabled ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  style={{ minHeight: 64, minWidth: 64 }}
                  aria-label={key}>
            {key === 'pass' ? "can't see" : COMPASS_GLYPHS[key]}
          </button>
        );
      })}
    </div>
  );
}

// ------- Examiner Strip -------

function ExaminerStrip({
  meta, trialNumber, maxTrials, session, audioEnabled, onToggleAudio,
  paused, onTogglePause, onOverride, onSkip, showPanel, onToggleShow, guardrailFlag,
}) {
  const [overrideInput, setOverrideInput] = useState('');
  const mar = logMARtoMAR(meta.logMAR);
  const snellen = logMARtoSnellen(meta.logMAR, session.distanceM);
  const reliability = meta.reliabilityTag;

  return (
    <div className="bg-slate-900 text-slate-100 text-xs border-b border-slate-700 overflow-x-auto">
      <div className="px-4 py-2 flex items-center gap-3 flex-nowrap min-w-max">
        <button onClick={onToggleShow} className="px-2 py-1 bg-slate-700 rounded hover:bg-slate-600">
          {showPanel ? 'Hide' : 'Examiner'}
        </button>
        {showPanel && (
          <>
            <span className="px-2 py-0.5 bg-sky-800 rounded font-semibold">{meta.phaseName}</span>
            <span className="font-mono">logMAR <strong>{meta.logMAR.toFixed(2)}</strong></span>
            <span className="font-mono">MAR <strong>{mar.toFixed(3)}</strong></span>
            <span className="font-mono">{snellen}</span>
            <span className="px-2 py-0.5 bg-slate-700 rounded">{meta.stage}</span>
            <span>{meta.progressText}</span>
            {meta.contrast < 1.0 && (
              <span className="font-mono">C {(meta.contrast * 100).toFixed(meta.contrast < 0.01 ? 2 : 1)}%</span>
            )}
            {reliability === 'experimental' && (
              <span className="px-2 py-0.5 bg-rose-700 rounded font-semibold">EXPERIMENTAL</span>
            )}
            {reliability === 'caution' && (
              <span className="px-2 py-0.5 bg-amber-600 rounded">caution</span>
            )}
            {guardrailFlag && (
              <span className="px-2 py-0.5 bg-amber-700 rounded" title="Monotonic guardrail triggered">
                <AlertTriangle className="w-3 h-3 inline-block -mt-0.5" /> guardrail
              </span>
            )}
            <div className="flex-1" />
            <button onClick={onToggleAudio} className="p-1 hover:bg-slate-700 rounded" title="Audio">
              {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button onClick={onTogglePause} className="p-1 hover:bg-slate-700 rounded" title="Pause">
              {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>
            <form onSubmit={(e) => {
                e.preventDefault();
                const v = parseFloat(overrideInput);
                if (!Number.isNaN(v)) { onOverride(v); setOverrideInput(''); }
              }}
              className="flex items-center gap-1">
              <input type="number" step={0.05} value={overrideInput}
                     onChange={(e) => setOverrideInput(e.target.value)} placeholder="logMAR"
                     className="w-20 px-1 py-0.5 text-slate-800 rounded" />
              <button type="submit" className="px-2 py-0.5 bg-amber-600 rounded hover:bg-amber-500">Set</button>
            </form>
            <button onClick={onSkip} className="px-2 py-0.5 bg-rose-700 rounded hover:bg-rose-600">End Phase</button>
          </>
        )}
      </div>
    </div>
  );
}

// ------- Engine adapters (generic TestScreen driver) -------
//
// An adapter wraps a pure engine with the hooks TestScreen needs:
//   createInitialState(args)       → initial engine state
//   getNextTrial(state, prevOrient) → stimulus descriptor for the next trial
//   processResponse(state, correct) → new engine state after a response
//   checkResponse(trial, key)       → correctness rule for this stimulus kind
//   isComplete(state)               → boolean
//   applyOverride(state, logMAR)    → state after examiner manual-sets logMAR
//   forceComplete(state)            → state after examiner abort
//   getDisplayMeta(state)           → { phaseName, stage, progressText, logMAR, contrast, reliabilityTag, guardrailFlag }
//   computePipeline(logMAR, session)→ { D_pixels, ...} for the chosen stimulus family
//   renderStimulus(trial, pipeline) → React element for the display area
//   displayBackgroundColor(trial)   → CSS colour for the display area backdrop
//   csvPhase                        → trial record `phase` field
//   stimulusKind                    → 'landolt' | 'ball'

const landoltCheckResponse = (trial, key) =>
  key !== 'pass' && key === trial.orientation;

const renderLandolt = (trial, pipeline /* session, callbacks unused */) => (
  <LandoltCCanvas
    diameter={Math.max(CONFIG.MIN_RENDER_DIAMETER_PX, pipeline.D_pixels)}
    orientation={trial.orientation}
    ringColor={trial.ringColor}
  />
);

const computeLandoltPipeline = (logMAR, session) =>
  diameterPixels(logMAR, session.distanceM, session.screenHeightMm, session.screenHeightPx);

const va100EngineAdapter = {
  phaseName: 'VA100',
  csvPhase: 'VA100',
  stimulusKind: 'landolt',
  createInitialState: () => createVA100State(),
  getNextTrial: (state, prev) => {
    const n = va100GetNextTrial(state, prev);
    return {
      logMAR: n.logMAR,
      contrast: 1.0,
      orientation: n.orientation,
      ringColor: '#000000',
      backgroundColor: '#FFFFFF',
    };
  },
  processResponse: (state, correct) => va100ProcessResponse(state, correct),
  checkResponse: landoltCheckResponse,
  isComplete: (state) => state.complete,
  applyOverride: (state, logMAR) => va100ApplyManualOverride(state, logMAR),
  forceComplete: (state) => va100ForceComplete(state),
  getDisplayMeta: (state) => ({
    phaseName: 'VA100',
    stage: state.phase,
    progressText: `Trial ${state.totalTrials + 1}/${CONFIG.VA100_MAX_TRIALS}`,
    logMAR: state.logMAR,
    contrast: 1.0,
    reliabilityTag: 'reliable',
    guardrailFlag: false,
  }),
  computePipeline: computeLandoltPipeline,
  renderStimulus: renderLandolt,
  displayBackgroundColor: () => '#FFFFFF',
  maxTrialsHint: CONFIG.VA100_MAX_TRIALS,
};

const contrastEngineAdapter = {
  phaseName: 'CONTRAST',
  csvPhase: 'CONTRAST_VA',
  stimulusKind: 'landolt',
  createInitialState: ({ va100LogMAR }) => createContrastState(va100LogMAR),
  getNextTrial: (state, prev) => {
    const n = contrastGetNextTrial(state, prev);
    if (!n) return null;
    return {
      logMAR: n.logMAR,
      contrast: n.contrast,
      orientation: n.orientation,
      ringColor: grayToHex(contrastToGray(n.contrast)),
      backgroundColor: '#FFFFFF',
    };
  },
  processResponse: (state, correct) => contrastProcessResponse(state, correct),
  checkResponse: landoltCheckResponse,
  isComplete: (state) => state.complete,
  applyOverride: (state, logMAR) => contrastApplyManualOverride(state, logMAR),
  forceComplete: (state) => contrastForceComplete(state),
  getDisplayMeta: (state) => {
    const lvl = contrastCurrentLevel(state);
    if (!lvl) {
      return {
        phaseName: 'CONTRAST', stage: 'DONE',
        progressText: 'done', logMAR: 0, contrast: 1.0, reliabilityTag: 'reliable', guardrailFlag: false,
      };
    }
    return {
      phaseName: 'CONTRAST',
      stage: lvl.stage,
      progressText: `Contrast ${(lvl.contrast * 100).toFixed(lvl.contrast < 0.01 ? 2 : 1)}% (${state.currentContrastIndex + 1} of ${CONFIG.CONTRAST_LEVELS.length})`,
      logMAR: lvl.logMAR,
      contrast: lvl.contrast,
      reliabilityTag: getReliabilityTag(lvl.contrast),
      guardrailFlag: lvl.guardrailTriggered,
    };
  },
  computePipeline: computeLandoltPipeline,
  renderStimulus: renderLandolt,
  displayBackgroundColor: () => '#FFFFFF',
  maxTrialsHint: CONFIG.CONTRAST_MAX_TRIALS_PER_LEVEL * CONFIG.CONTRAST_LEVELS.length,
};

// ------- Phase 2: Kinetic VA (DEMO tier) -------
//
// The renderer is a KineticCanvas driving its own RAF loop. TestScreen
// defers the RT clock start until `onStimulusOnset` fires (after the
// cue-flash period), and records frame-jitter stats from `onStimulusEnd`.

const kineticSpeedEngineAdapter = {
  phaseName: 'KINETIC_SPEED',
  csvPhase: 'KINETIC_SPEED',
  stimulusKind: 'kinetic_landolt',
  fidelityTier: FIDELITY_TIERS.DEMO_KINETIC,
  awaitsOnsetCallback: true, // TestScreen won't enable input until onset fires
  createInitialState: ({ fixedLogMAR, initialSpeedKmh } = {}) =>
    createKineticSpeedState(fixedLogMAR, initialSpeedKmh),
  getNextTrial: (state, prev) => {
    const n = kineticSpeedGetNextTrial(state, prev);
    return {
      logMAR: n.logMAR,
      contrast: 1.0,
      orientation: n.orientation,
      ringColor: '#000000',
      backgroundColor: '#FFFFFF',
      speedKmh: n.speedKmh,
      travelTimeMs: kineticTravelTimeMs(n.speedKmh),
    };
  },
  processResponse: (state, correct) => kineticSpeedProcessResponse(state, correct),
  checkResponse: landoltCheckResponse,
  isComplete: (state) => state.complete,
  applyOverride: (state, value) => kineticSpeedApplyManualOverride(state, value),
  forceComplete: (state) => kineticSpeedForceComplete(state),
  getDisplayMeta: (state) => ({
    phaseName: `KINETIC · ${state.speedKmh.toFixed(0)} km/h`,
    stage: state.phase,
    progressText: `Trial ${state.totalTrials + 1}/${CONFIG.KINETIC_MAX_TRIALS} · start logMAR ${state.fixedLogMAR.toFixed(2)} · ${state.speedKmh.toFixed(0)} km/h`,
    logMAR: state.fixedLogMAR,
    contrast: 1.0,
    reliabilityTag: 'demo_kinetic',
    guardrailFlag: false,
    speedKmh: state.speedKmh,
  }),
  computePipeline: computeLandoltPipeline,
  renderStimulus: (trial, pipeline, _session, callbacks) => (
    <KineticCanvas
      maxDiameterPx={pipeline.D_pixels}
      speedKmh={trial.speedKmh}
      orientation={trial.orientation}
      stimulusKind="landolt"
      ringColor={trial.ringColor}
      backgroundColor={trial.backgroundColor}
      onStimulusOnset={callbacks?.onStimulusOnset}
      onStimulusEnd={callbacks?.onStimulusEnd}
    />
  ),
  displayBackgroundColor: () => '#FFFFFF',
  maxTrialsHint: CONFIG.KINETIC_MAX_TRIALS,
  overrideLabel: 'km/h',
};

// Apply a plain-background override on top of a base theme.
// The ball and seam colours stay the same; only the backdrop is neutralised.
function resolveTheme(themeKey, { plainBackground } = {}) {
  const base = BALL_THEMES[themeKey] ?? BALL_THEMES[DEFAULT_BALL_THEME];
  return plainBackground ? { ...base, bg: '#FFFFFF' } : base;
}

// Helper used by ball adapters' getNextTrial: given a theme and a running decay clock,
// return the seam colour to actually render this trial. Phase-local clock so each phase
// starts fresh when mounted (the adapter's createInitialState records the start time).
function applyPhaseDecay(theme, scheduleKey, phaseStartMs) {
  const elapsedMs = phaseStartMs ? (performance.now() - phaseStartMs) : 0;
  const factor = computeDecayFactor(scheduleKey, elapsedMs);
  const seamColor = applyDecayToSeam(theme.ball, theme.seam, factor);
  return { seamColor, decayFactor: factor, elapsedMs };
}

// ------- Phase 3b: Kinetic Cricket-Ball Seam Detection (DEMO) -------
//
// Same VA100-style speed-threshold staircase as Phase 2, but the stimulus
// is an approaching cricket ball whose seam line is the limiting detail.
// Sizing uses ballDiameterPixels (seam = D/12) so the seam width subtends
// 1 MAR at the fixed logMAR. Theme-aware (red/pink/white ball presets).
// Response rule uses seam axis-equivalence (180° opposites count as correct).

function makeKineticSeamEngineAdapter(themeKey = DEFAULT_BALL_THEME, options = {}) {
  const theme = resolveTheme(themeKey, options);
  const scheduleKey = options.matchConditionSchedule ?? DEFAULT_MATCH_CONDITION_SCHEDULE;
  let phaseStartMs = null;
  return {
    phaseName: 'KINETIC_SEAM',
    csvPhase: 'KINETIC_SEAM',
    stimulusKind: 'kinetic_ball',
    fidelityTier: FIDELITY_TIERS.DEMO_KINETIC,
    awaitsOnsetCallback: true,
    ballTheme: themeKey,
    createInitialState: ({ fixedLogMAR, initialSpeedKmh } = {}) => {
      phaseStartMs = performance.now();
      return createKineticSpeedState(fixedLogMAR, initialSpeedKmh);
    },
    getNextTrial: (state, prev) => {
      const n = kineticSpeedGetNextTrial(state, prev);
      const { seamColor, decayFactor, elapsedMs } = applyPhaseDecay(theme, scheduleKey, phaseStartMs);
      return {
        logMAR: n.logMAR,
        contrast: 1.0,
        orientation: n.orientation,
        ringColor: seamColor,
        backgroundColor: theme.bg,
        ballColor: theme.ball,
        seamColor,
        ballTheme: themeKey,
        speedKmh: n.speedKmh,
        travelTimeMs: kineticTravelTimeMs(n.speedKmh),
        decayFactor,
        matchConditionSchedule: scheduleKey,
        phaseElapsedMs: elapsedMs,
      };
    },
    processResponse: (state, correct) => kineticSpeedProcessResponse(state, correct),
    checkResponse: (trial, key) => {
      if (key === 'pass') return false;
      return seamOrientationMatches(trial.orientation, key);
    },
    isComplete: (state) => state.complete,
    applyOverride: (state, value) => kineticSpeedApplyManualOverride(state, value),
    forceComplete: (state) => kineticSpeedForceComplete(state),
    getDisplayMeta: (state) => ({
      phaseName: `KINETIC SEAM · ${theme.label} · ${state.speedKmh.toFixed(0)} km/h`,
      stage: state.phase,
      progressText: `Trial ${state.totalTrials + 1}/${CONFIG.KINETIC_MAX_TRIALS} · start logMAR ${state.fixedLogMAR.toFixed(2)} · ${state.speedKmh.toFixed(0)} km/h`,
      logMAR: state.fixedLogMAR,
      contrast: 1.0,
      reliabilityTag: 'demo_kinetic',
      guardrailFlag: false,
      speedKmh: state.speedKmh,
    }),
    computePipeline: (logMAR, session) =>
      ballDiameterPixels(logMAR, session.distanceM, session.screenHeightMm, session.screenHeightPx),
    renderStimulus: (trial, pipeline, _session, callbacks) => (
      <KineticCanvas
        maxDiameterPx={pipeline.D_pixels}
        speedKmh={trial.speedKmh}
        orientation={trial.orientation}
        stimulusKind="ball"
        ringColor={trial.ringColor}
        backgroundColor={trial.backgroundColor}
        ballColor={trial.ballColor}
        seamColor={trial.seamColor}
        onStimulusOnset={callbacks?.onStimulusOnset}
        onStimulusEnd={callbacks?.onStimulusEnd}
      />
    ),
    displayBackgroundColor: (trial) => trial?.backgroundColor ?? theme.bg,
    maxTrialsHint: CONFIG.KINETIC_MAX_TRIALS,
    overrideLabel: 'km/h',
    compassHint: 'The seam is a line -press either end of the axis (e.g. ↗ and ↙ are both correct for the same seam).',
    theme,
  };
}

// ------- Phase 3c: Swing / Drift Detection (DEMO) -------
//
// Approaching ball with a random seam orientation AND a random lateral drift
// (LEFT or RIGHT). The staircase varies the DRIFT AMOUNT and finds the
// minimum detectable drift at a given starting logMAR + fixed speed. Subject reports
// the drift direction via the compass ← / → buttons.

function makeDriftEngineAdapter(themeKey = DEFAULT_BALL_THEME, options = {}) {
  const theme = resolveTheme(themeKey, options);
  const scheduleKey = options.matchConditionSchedule ?? DEFAULT_MATCH_CONDITION_SCHEDULE;
  let phaseStartMs = null;
  const pickDriftSign = (prev) => {
    // Random L/R without letting the same direction repeat more than twice.
    const s = Math.random() < 0.5 ? -1 : 1;
    return prev?.lastDriftSign === s && Math.random() < 0.4 ? -s : s;
  };

  return {
    phaseName: 'DRIFT',
    csvPhase: 'DRIFT',
    stimulusKind: 'kinetic_ball',
    fidelityTier: FIDELITY_TIERS.DEMO_KINETIC,
    awaitsOnsetCallback: true,
    ballTheme: themeKey,

    createInitialState: ({ fixedLogMAR, fixedSpeedKmh, startDriftPx } = {}) => {
      phaseStartMs = performance.now();
      return {
        ...driftStaircase.create(startDriftPx),
        fixedLogMAR: fixedLogMAR ?? CONFIG.DRIFT_DEFAULT_LOGMAR,
        fixedSpeedKmh: fixedSpeedKmh ?? CONFIG.DRIFT_DEFAULT_SPEED_KMH,
        lastDriftSign: null,
        expectedDriftKey: null,
      };
    },

    getNextTrial: (state, prev) => {
      let orientation;
      do {
        orientation = ORIENTATION_KEYS[Math.floor(Math.random() * ORIENTATION_KEYS.length)];
      } while (orientation === prev && ORIENTATION_KEYS.length > 1);
      const sign = pickDriftSign(state);
      state.lastDriftSign = sign;
      state.expectedDriftKey = sign < 0 ? 'left' : 'right';
      const signedDriftPx = state.driftPx * sign;
      const { seamColor, decayFactor, elapsedMs } = applyPhaseDecay(theme, scheduleKey, phaseStartMs);
      return {
        logMAR: state.fixedLogMAR,
        contrast: 1.0,
        orientation,
        ringColor: seamColor,
        backgroundColor: theme.bg,
        ballColor: theme.ball,
        seamColor,
        ballTheme: themeKey,
        speedKmh: state.fixedSpeedKmh,
        travelTimeMs: kineticTravelTimeMs(state.fixedSpeedKmh),
        lateralDriftPx: signedDriftPx,
        expectedDriftKey: state.expectedDriftKey,
        decayFactor,
        matchConditionSchedule: scheduleKey,
        phaseElapsedMs: elapsedMs,
      };
    },

    processResponse: (state, correct) => {
      const next = driftStaircase.process(state, correct);
      return { ...next, fixedLogMAR: state.fixedLogMAR, fixedSpeedKmh: state.fixedSpeedKmh };
    },

    checkResponse: (trial, key) => {
      if (key === 'pass') return false;
      if (key !== 'left' && key !== 'right') return false;
      return key === trial.expectedDriftKey;
    },

    isComplete: (state) => state.complete,
    applyOverride: (state, value) => {
      const next = driftStaircase.applyOverride(state, value);
      return { ...next, fixedLogMAR: state.fixedLogMAR, fixedSpeedKmh: state.fixedSpeedKmh };
    },
    forceComplete: (state) => {
      const next = driftStaircase.forceComplete(state);
      return { ...next, fixedLogMAR: state.fixedLogMAR, fixedSpeedKmh: state.fixedSpeedKmh };
    },
    getResult: (state) => {
      const base = driftStaircase.getResult(state);
      if (!base) return null;
      return {
        mode: 'DRIFT',
        thresholdDriftPx: base.driftPx,
        fixedLogMAR: state.fixedLogMAR,
        fixedSpeedKmh: state.fixedSpeedKmh,
        totalTrials: base.totalTrials,
        totalReversals: base.totalReversals,
      };
    },
    getDisplayMeta: (state) => ({
      phaseName: `DRIFT · ${theme.label} · ${state.driftPx.toFixed(0)} px`,
      stage: state.phase,
      progressText: `Trial ${state.totalTrials + 1}/${CONFIG.DRIFT_MAX_TRIALS} · drift ${state.driftPx.toFixed(0)} px · ${state.fixedSpeedKmh.toFixed(0)} km/h`,
      logMAR: state.fixedLogMAR,
      contrast: 1.0,
      reliabilityTag: 'demo_kinetic',
      guardrailFlag: false,
      speedKmh: state.fixedSpeedKmh,
    }),

    computePipeline: (logMAR, session) =>
      ballDiameterPixels(logMAR, session.distanceM, session.screenHeightMm, session.screenHeightPx),

    renderStimulus: (trial, pipeline, _session, callbacks) => (
      <KineticCanvas
        maxDiameterPx={pipeline.D_pixels}
        speedKmh={trial.speedKmh}
        orientation={trial.orientation}
        stimulusKind="ball"
        ringColor={trial.ringColor}
        backgroundColor={trial.backgroundColor}
        ballColor={trial.ballColor}
        seamColor={trial.seamColor}
        lateralDriftPx={trial.lateralDriftPx}
        onStimulusOnset={callbacks?.onStimulusOnset}
        onStimulusEnd={callbacks?.onStimulusEnd}
      />
    ),

    displayBackgroundColor: (trial) => trial?.backgroundColor ?? theme.bg,
    maxTrialsHint: CONFIG.DRIFT_MAX_TRIALS,
    overrideLabel: 'px',
    compassHint: 'The ball drifts left or right during approach -press ← or →. Other directions count as incorrect.',
    theme,
  };
}

// ------- Phase 3d: Spin Detection (DEMO) -------
//
// Approaching ball with a seam that ROTATES during approach. Direction of
// rotation is randomly CW or CCW. Staircase varies the rotation rate and
// finds the minimum detectable rev/s. Subject reports the rotation direction
// via compass ← (CCW) / → (CW). Document the mapping on screen.

function makeSpinEngineAdapter(themeKey = DEFAULT_BALL_THEME, options = {}) {
  const theme = resolveTheme(themeKey, options);
  const scheduleKey = options.matchConditionSchedule ?? DEFAULT_MATCH_CONDITION_SCHEDULE;
  let phaseStartMs = null;
  const pickSpinSign = (prev) => {
    const s = Math.random() < 0.5 ? -1 : 1;
    return prev?.lastSpinSign === s && Math.random() < 0.4 ? -s : s;
  };

  return {
    phaseName: 'SPIN',
    csvPhase: 'SPIN',
    stimulusKind: 'kinetic_ball',
    fidelityTier: FIDELITY_TIERS.DEMO_KINETIC,
    awaitsOnsetCallback: true,
    ballTheme: themeKey,

    createInitialState: ({ fixedLogMAR, fixedSpeedKmh, startRevsPerSec } = {}) => {
      phaseStartMs = performance.now();
      return {
        ...spinStaircase.create(startRevsPerSec),
        fixedLogMAR: fixedLogMAR ?? CONFIG.SPIN_DEFAULT_LOGMAR,
        fixedSpeedKmh: fixedSpeedKmh ?? CONFIG.SPIN_DEFAULT_SPEED_KMH,
        lastSpinSign: null,
        expectedSpinKey: null,
      };
    },

    getNextTrial: (state, prev) => {
      let orientation;
      do {
        orientation = ORIENTATION_KEYS[Math.floor(Math.random() * ORIENTATION_KEYS.length)];
      } while (orientation === prev && ORIENTATION_KEYS.length > 1);
      const sign = pickSpinSign(state);
      state.lastSpinSign = sign;
      // CCW rotation = positive angle in screen space = user presses ← ('left')
      // CW  rotation = negative angle = user presses → ('right')
      state.expectedSpinKey = sign > 0 ? 'left' : 'right';
      const signedRevs = state.revsPerSec * sign;
      const { seamColor, decayFactor, elapsedMs } = applyPhaseDecay(theme, scheduleKey, phaseStartMs);
      return {
        logMAR: state.fixedLogMAR,
        contrast: 1.0,
        orientation,
        ringColor: seamColor,
        backgroundColor: theme.bg,
        ballColor: theme.ball,
        seamColor,
        ballTheme: themeKey,
        speedKmh: state.fixedSpeedKmh,
        travelTimeMs: kineticTravelTimeMs(state.fixedSpeedKmh),
        spinRevsPerSec: signedRevs,
        expectedSpinKey: state.expectedSpinKey,
        decayFactor,
        matchConditionSchedule: scheduleKey,
        phaseElapsedMs: elapsedMs,
      };
    },

    processResponse: (state, correct) => {
      const next = spinStaircase.process(state, correct);
      return { ...next, fixedLogMAR: state.fixedLogMAR, fixedSpeedKmh: state.fixedSpeedKmh };
    },

    checkResponse: (trial, key) => {
      if (key === 'pass') return false;
      if (key !== 'left' && key !== 'right') return false;
      return key === trial.expectedSpinKey;
    },

    isComplete: (state) => state.complete,
    applyOverride: (state, value) => {
      const next = spinStaircase.applyOverride(state, value);
      return { ...next, fixedLogMAR: state.fixedLogMAR, fixedSpeedKmh: state.fixedSpeedKmh };
    },
    forceComplete: (state) => {
      const next = spinStaircase.forceComplete(state);
      return { ...next, fixedLogMAR: state.fixedLogMAR, fixedSpeedKmh: state.fixedSpeedKmh };
    },
    getResult: (state) => {
      const base = spinStaircase.getResult(state);
      if (!base) return null;
      return {
        mode: 'SPIN',
        thresholdRevsPerSec: base.revsPerSec,
        fixedLogMAR: state.fixedLogMAR,
        fixedSpeedKmh: state.fixedSpeedKmh,
        totalTrials: base.totalTrials,
        totalReversals: base.totalReversals,
      };
    },
    getDisplayMeta: (state) => ({
      phaseName: `SPIN · ${theme.label} · ${state.revsPerSec.toFixed(1)} rev/s`,
      stage: state.phase,
      progressText: `Trial ${state.totalTrials + 1}/${CONFIG.SPIN_MAX_TRIALS} · ${state.revsPerSec.toFixed(1)} rev/s · ${state.fixedSpeedKmh.toFixed(0)} km/h`,
      logMAR: state.fixedLogMAR,
      contrast: 1.0,
      reliabilityTag: 'demo_kinetic',
      guardrailFlag: false,
      speedKmh: state.fixedSpeedKmh,
    }),

    computePipeline: (logMAR, session) =>
      ballDiameterPixels(logMAR, session.distanceM, session.screenHeightMm, session.screenHeightPx),

    renderStimulus: (trial, pipeline, _session, callbacks) => (
      <KineticCanvas
        maxDiameterPx={pipeline.D_pixels}
        speedKmh={trial.speedKmh}
        orientation={trial.orientation}
        stimulusKind="ball"
        ringColor={trial.ringColor}
        backgroundColor={trial.backgroundColor}
        ballColor={trial.ballColor}
        seamColor={trial.seamColor}
        spinRevsPerSec={trial.spinRevsPerSec}
        onStimulusOnset={callbacks?.onStimulusOnset}
        onStimulusEnd={callbacks?.onStimulusEnd}
      />
    ),

    displayBackgroundColor: (trial) => trial?.backgroundColor ?? theme.bg,
    maxTrialsHint: CONFIG.SPIN_MAX_TRIALS,
    overrideLabel: 'rev/s',
    compassHint: 'Press ← if the seam spins counter-clockwise, → if it spins clockwise. Other directions count as incorrect.',
    theme,
  };
}

// ------- Phase 3a: Static Cricket-Ball Seam Detection -------
// Uses the VA100 staircase engine unchanged -only the stimulus and the correctness rule change.
// Parameterised by a ball theme (red/pink/white × day/day-night/night).

function makeSeamStaticEngineAdapter(themeKey = DEFAULT_BALL_THEME, options = {}) {
  const theme = resolveTheme(themeKey, options);
  const scheduleKey = options.matchConditionSchedule ?? DEFAULT_MATCH_CONDITION_SCHEDULE;
  let phaseStartMs = null;
  return {
    phaseName: 'SEAM100',
    csvPhase: 'SEAM_STATIC',
    stimulusKind: 'ball',
    ballTheme: themeKey,
    createInitialState: () => {
      phaseStartMs = performance.now();
      return createVA100State();
    },
    getNextTrial: (state, prev) => {
      const n = va100GetNextTrial(state, prev);
      const { seamColor, decayFactor, elapsedMs } = applyPhaseDecay(theme, scheduleKey, phaseStartMs);
      return {
        logMAR: n.logMAR,
        contrast: 1.0,
        orientation: n.orientation,
        ringColor: seamColor,
        backgroundColor: theme.bg,
        ballColor: theme.ball,
        seamColor,
        ballTheme: themeKey,
        decayFactor,
        matchConditionSchedule: scheduleKey,
        phaseElapsedMs: elapsedMs,
      };
    },
    processResponse: (state, correct) => va100ProcessResponse(state, correct),
    checkResponse: (trial, key) => {
      if (key === 'pass') return false;
      return seamOrientationMatches(trial.orientation, key);
    },
    isComplete: (state) => state.complete,
    applyOverride: (state, logMAR) => va100ApplyManualOverride(state, logMAR),
    forceComplete: (state) => va100ForceComplete(state),
    getDisplayMeta: (state) => ({
      phaseName: `SEAM · ${theme.label}`,
      stage: state.phase,
      progressText: `Trial ${state.totalTrials + 1}/${CONFIG.VA100_MAX_TRIALS}`,
      logMAR: state.logMAR,
      contrast: 1.0,
      reliabilityTag: 'reliable',
      guardrailFlag: false,
    }),
    computePipeline: (logMAR, session) =>
      ballDiameterPixels(logMAR, session.distanceM, session.screenHeightMm, session.screenHeightPx),
    renderStimulus: (trial, pipeline /* session, callbacks unused */) => (
      <BallCanvas
        diameter={Math.max(CONFIG.MIN_RENDER_DIAMETER_PX, pipeline.D_pixels)}
        seamOrientation={trial.orientation}
        ballColor={trial.ballColor}
        seamColor={trial.seamColor}
      />
    ),
    displayBackgroundColor: (trial) => trial?.backgroundColor ?? theme.bg,
    maxTrialsHint: CONFIG.VA100_MAX_TRIALS,
    compassHint: 'The seam is a line -press either end of the axis (e.g. ↗ and ↙ are both correct for the same seam).',
    theme,
  };
}

// ------- Generic Test Screen (drives either engine) -------

function TestScreen({ engineAdapter, initialStateArgs, session, fidelityTier, onComplete }) {
  const [state, setState] = useState(() => engineAdapter.createInitialState(initialStateArgs || {}));
  const [currentTrial, setCurrentTrial] = useState(null);
  const [awaiting, setAwaiting] = useState(false);
  const [paused, setPaused] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [showExaminer, setShowExaminer] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [trials, setTrials] = useState([]);
  const [blank, setBlank] = useState(false);
  const [manualOverrideActive, setManualOverrideActive] = useState(false);

  const stimulusOnsetRef = useRef(null);
  const audioCtxRef = useRef(null);
  const blankTimerRef = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const trialsRef = useRef(trials);
  trialsRef.current = trials;
  const currentTrialRef = useRef(currentTrial);
  currentTrialRef.current = currentTrial;
  const finalizedRef = useRef(false);
  const frameStatsRef = useRef(null); // latest KineticCanvas frame jitter stats
  const effectiveTier = engineAdapter.fidelityTier ?? fidelityTier ?? FIDELITY_TIERS.CLINICAL_STATIC;

  const diameterFor = useCallback((logMAR) =>
    engineAdapter.computePipeline(logMAR, session),
    [engineAdapter, session]
  );

  const pipeline = useMemo(
    () => diameterFor(currentTrial?.logMAR ?? engineAdapter.getDisplayMeta(state).logMAR),
    [currentTrial, state, engineAdapter, diameterFor]
  );

  function playTone(correct) {
    if (!audioEnabled) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      gain.gain.value = 0.05;
      osc.type = 'sine';
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.linearRampToValueAtTime(correct ? 660 : 330, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } catch { /* ignore */ }
  }

  function finalize(finalState) {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    setAwaiting(false);
    setCurrentTrial(null);
    onComplete(finalState, trialsRef.current);
  }

  function startNextTrial(curState, prevOrientation) {
    if (engineAdapter.isComplete(curState)) {
      finalize(curState);
      return;
    }
    const next = engineAdapter.getNextTrial(curState, prevOrientation);
    if (!next) {
      finalize(curState);
      return;
    }
    setCurrentTrial(next);
    setBlank(false);
    frameStatsRef.current = null;
    if (engineAdapter.awaitsOnsetCallback) {
      // Input stays disabled until the kinetic canvas reports onStimulusOnset.
      setAwaiting(false);
      stimulusOnsetRef.current = null;
    } else {
      setAwaiting(true);
      stimulusOnsetRef.current = performance.now();
    }
  }

  // Callbacks passed to the adapter's renderStimulus.
  const handleStimulusOnset = useCallback((perfNow) => {
    stimulusOnsetRef.current = perfNow;
    setAwaiting(true);
  }, []);

  const handleStimulusEnd = useCallback((_perfNow, frameStats) => {
    frameStatsRef.current = frameStats;
  }, []);

  useEffect(() => {
    finalizedRef.current = false;
    startNextTrial(state, null);
    return () => {
      if (blankTimerRef.current) clearTimeout(blankTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleResponse = useCallback((responseKey) => {
    if (!awaiting || paused || !currentTrialRef.current) return;
    const trial = currentTrialRef.current;
    const rtMs = performance.now() - stimulusOnsetRef.current;
    let isCorrect, orientationResponded;
    if (responseKey === 'pass') {
      isCorrect = false; orientationResponded = null;
    } else {
      orientationResponded = responseKey;
      isCorrect = engineAdapter.checkResponse(trial, responseKey);
    }

    setFeedback({ key: responseKey, correct: isCorrect });
    playTone(isCorrect);
    setAwaiting(false);

    const pipelineHere = diameterFor(trial.logMAR);
    const meta = engineAdapter.getDisplayMeta(stateRef.current);

    const frameStats = frameStatsRef.current;
    const travelTimeMs = trial.travelTimeMs ?? null;
    const respondedDuringStimulus = travelTimeMs != null ? rtMs < travelTimeMs : null;
    const trialRecord = {
      trialNumber: trialsRef.current.length + 1,
      timestamp: new Date().toISOString(),
      phase: engineAdapter.csvPhase,
      stage: meta.stage,
      logMAR: trial.logMAR,
      diameterPixels: pipelineHere.D_pixels,
      orientationPresented: trial.orientation,
      orientationResponded,
      isCorrect,
      reactionTimeMs: rtMs,
      isTimeout: false,
      isManualOverride: manualOverrideActive,
      contrastFraction: trial.contrast,
      contrastPercent: trial.contrast * 100,
      ringColorHex: trial.ringColor,
      backgroundColorHex: trial.backgroundColor ?? '#FFFFFF',
      eyeCondition: session.eyeCondition,
      testDistanceMeters: session.distanceM,
      screenHeightMm: session.screenHeightMm,
      screenHeightPixels: session.screenHeightPx,
      device: session.deviceDesc,
      fidelityTier: effectiveTier,
      stimulusKind: engineAdapter.stimulusKind,
      ballTheme: trial.ballTheme ?? '',
      ballColorHex: trial.ballColor ?? '',
      seamColorHex: trial.seamColor ?? '',
      // Kinetic-specific (null for static phases)
      kineticSpeedKmh: trial.speedKmh ?? null,
      kineticStartDistanceM: trial.speedKmh != null ? CONFIG.KINETIC_START_DISTANCE_M : null,
      kineticEndDistanceM: trial.speedKmh != null ? CONFIG.KINETIC_END_DISTANCE_M : null,
      kineticTravelTimeMs: travelTimeMs,
      respondedDuringStimulus,
      frameCount: frameStats?.frameCount ?? null,
      avgFrameDeltaMs: frameStats?.avgFrameDeltaMs ?? null,
      maxFrameDeltaMs: frameStats?.maxFrameDeltaMs ?? null,
      // Phase 3e match-condition decay (null for non-ball phases)
      matchConditionSchedule: trial.matchConditionSchedule ?? null,
      decayFactor: trial.decayFactor ?? null,
      phaseElapsedMs: trial.phaseElapsedMs ?? null,
    };

    const newState = engineAdapter.processResponse(stateRef.current, isCorrect);
    stateRef.current = newState;
    setState(newState);
    setTrials((prev) => {
      const next = [...prev, trialRecord];
      trialsRef.current = next;
      return next;
    });

    const prevOrientation = trial.orientation;
    setTimeout(() => {
      setFeedback(null);
      setBlank(true);
      blankTimerRef.current = setTimeout(() => {
        if (engineAdapter.isComplete(newState)) {
          finalize(newState);
        } else {
          startNextTrial(newState, prevOrientation);
        }
      }, CONFIG.INTER_TRIAL_MS);
    }, 200);
  }, [awaiting, paused, session, manualOverrideActive, engineAdapter, fidelityTier, diameterFor]);

  useEffect(() => {
    const onKey = (e) => {
      if (!awaiting || paused) return;
      let key = null;
      switch (e.key) {
        case 'ArrowUp':    key = 'up'; break;
        case 'ArrowDown':  key = 'down'; break;
        case 'ArrowLeft':  key = 'left'; break;
        case 'ArrowRight': key = 'right'; break;
        case 'q': case 'Q': key = 'upLeft'; break;
        case 'e': case 'E': key = 'upRight'; break;
        case 'z': case 'Z': key = 'downLeft'; break;
        case 'c': case 'C': key = 'downRight'; break;
        case ' ':           key = 'pass'; e.preventDefault(); break;
        case 'p': case 'P': setPaused((p) => !p); return;
        default: return;
      }
      if (key) handleResponse(key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [awaiting, paused, handleResponse]);

  const onOverride = (newLogMAR) => {
    const newState = engineAdapter.applyOverride(stateRef.current, newLogMAR);
    stateRef.current = newState;
    setState(newState);
    setManualOverrideActive(true);
    if (blankTimerRef.current) clearTimeout(blankTimerRef.current);
    setFeedback(null);
    startNextTrial(newState, currentTrialRef.current?.orientation ?? null);
  };

  const onSkip = () => {
    const forced = engineAdapter.forceComplete(stateRef.current);
    setState(forced);
    stateRef.current = forced;
    finalize(forced);
  };

  const meta = engineAdapter.getDisplayMeta(state);
  const trialForDisplay = currentTrial ?? { logMAR: meta.logMAR, orientation: 'right', ringColor: '#000000' };
  const displayPipeline = diameterFor(trialForDisplay.logMAR);
  const canRender = displayPipeline.D_pixels >= CONFIG.MIN_RENDER_DIAMETER_PX;
  const displayBg = engineAdapter.displayBackgroundColor(currentTrial) ?? '#FFFFFF';

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <ExaminerStrip
        meta={meta}
        trialNumber={trials.length + 1}
        maxTrials={engineAdapter.maxTrialsHint}
        session={session}
        audioEnabled={audioEnabled}
        onToggleAudio={() => setAudioEnabled((a) => !a)}
        paused={paused}
        onTogglePause={() => setPaused((p) => !p)}
        onOverride={onOverride}
        onSkip={onSkip}
        showPanel={showExaminer}
        onToggleShow={() => setShowExaminer((s) => !s)}
        guardrailFlag={meta.guardrailFlag}
      />

      <div
        className="flex-1 flex items-center justify-center relative transition-colors"
        style={{ minHeight: '60vh', backgroundColor: displayBg }}
      >
        {paused ? (
          <div className="text-slate-500 text-lg">PAUSED -press P to resume</div>
        ) : blank || !currentTrial ? null : canRender ? (
          engineAdapter.renderStimulus(trialForDisplay, displayPipeline, session, {
            onStimulusOnset: handleStimulusOnset,
            onStimulusEnd: handleStimulusEnd,
          })
        ) : (
          <div className="text-red-600 text-sm">
            Stimulus too small for display ({displayPipeline.D_pixels.toFixed(1)}px)
          </div>
        )}
      </div>

      <div className="bg-slate-50 border-t border-slate-200 p-4">
        <CompassInput
          onResponse={handleResponse}
          feedbackKey={feedback?.key}
          feedbackCorrect={feedback?.correct}
          disabled={!awaiting || paused}
        />
        {engineAdapter.compassHint && (
          <div className="text-center text-xs text-slate-600 mt-2 italic">
            {engineAdapter.compassHint}
          </div>
        )}
        <div className="text-center text-[10px] text-slate-400 mt-1">
          Keys: ↑ ↓ ← → | Q E Z C (diagonals) | Space = can't see | P = pause
        </div>
      </div>
    </div>
  );
}

// ------- Results Screen (full: VA100 + Contrast-VA) -------

function ResultsScreen({
  session, va100State, va100Trials, contrastState, contrastTrials,
  seamState, seamTrials, kineticState, kineticTrials,
  kineticSeamState, kineticSeamTrials,
  driftState, driftTrials, spinState, spinTrials,
  onNewTest, onNewSubject, onBackToSetup,
}) {
  const va100Result = va100State ? va100GetResult(va100State) : null;
  const contrastResults = contrastState ? contrastGetResults(contrastState) : [];
  const seamResult = seamState ? va100GetResult(seamState) : null;
  const seamTheme = session?.ballTheme ? BALL_THEMES[session.ballTheme] : null;
  const kineticResult = kineticState ? kineticSpeedGetResult(kineticState) : null;
  const kineticSeamResult = kineticSeamState ? kineticSpeedGetResult(kineticSeamState) : null;
  const driftResult = driftState
    ? (() => {
        const base = driftStaircase.getResult(driftState);
        if (!base) return null;
        return {
          mode: 'DRIFT',
          thresholdDriftPx: base.driftPx,
          fixedLogMAR: driftState.fixedLogMAR,
          fixedSpeedKmh: driftState.fixedSpeedKmh,
          totalTrials: base.totalTrials,
          totalReversals: base.totalReversals,
        };
      })()
    : null;
  const spinResult = spinState
    ? (() => {
        const base = spinStaircase.getResult(spinState);
        if (!base) return null;
        return {
          mode: 'SPIN',
          thresholdRevsPerSec: base.revsPerSec,
          fixedLogMAR: spinState.fixedLogMAR,
          fixedSpeedKmh: spinState.fixedSpeedKmh,
          totalTrials: base.totalTrials,
          totalReversals: base.totalReversals,
        };
      })()
    : null;
  const allTrials = [
    ...(va100Trials || []),
    ...(contrastTrials || []),
    ...(seamTrials || []),
    ...(kineticTrials || []),
    ...(kineticSeamTrials || []),
    ...(driftTrials || []),
    ...(spinTrials || []),
  ];

  // Phase 3e decay summary helper -pulls the schedule name and first/last decay factor
  // out of whatever ball-phase trials exist. Returns null when no decay was active.
  const decaySummaryFor = (trials) => {
    if (!trials || trials.length === 0) return null;
    const withDecay = trials.filter((t) => t.matchConditionSchedule && t.matchConditionSchedule !== 'CONSTANT');
    if (withDecay.length === 0) return null;
    const first = withDecay[0];
    const last = withDecay[withDecay.length - 1];
    return {
      schedule: first.matchConditionSchedule,
      startFactor: first.decayFactor,
      endFactor: last.decayFactor,
      endElapsedMs: last.phaseElapsedMs,
      trialCount: withDecay.length,
    };
  };

  const jitterFor = (trials) => {
    const ks = (trials || []).filter((t) => t.frameCount != null);
    if (!ks.length) return null;
    const avgs = ks.map((t) => t.avgFrameDeltaMs);
    const maxes = ks.map((t) => t.maxFrameDeltaMs);
    const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
    return {
      trialCount: ks.length,
      avgOfAvgs: mean(avgs),
      worstMax: Math.max(...maxes),
    };
  };
  const kineticJitter = useMemo(() => jitterFor(kineticTrials), [kineticTrials]);
  const kineticSeamJitter = useMemo(() => jitterFor(kineticSeamTrials), [kineticSeamTrials]);

  // Compose chart data
  const chartData = useMemo(() => {
    const rows = [];
    if (va100Result) {
      rows.push({
        contrastLabel: '100%',
        contrastPercent: 100,
        logMAR: va100Result.logMAR,
        snellen: logMARtoSnellen(va100Result.logMAR, session.distanceM),
        experimental: false,
      });
    }
    contrastResults.forEach((r) => {
      rows.push({
        contrastLabel: `${r.contrastPercent.toFixed(r.contrast < 0.01 ? 2 : 1)}%`,
        contrastPercent: r.contrastPercent,
        logMAR: r.logMAR,
        snellen: logMARtoSnellen(r.logMAR, session.distanceM),
        experimental: r.isExperimental,
        guardrail: r.guardrailTriggered,
      });
    });
    return rows;
  }, [va100Result, contrastResults, session.distanceM]);

  const handleDownloadTrialCSV = () => {
    const csv = generateTrialCSV(session, allTrials);
    downloadCSV(csv, `optokva_trials_${session.subjectId}_${session.sessionId.slice(0, 8)}.csv`);
  };
  const handleDownloadSummaryCSV = () => {
    const csv = generateSummaryCSV(
      session, va100Result, contrastResults, allTrials,
      seamResult, kineticResult, kineticSeamResult, driftResult, spinResult
    );
    downloadCSV(csv, `optokva_summary_${session.subjectId}_${session.sessionId.slice(0, 8)}.csv`);
  };

  const renderDecayFooter = (trialsForPhase) => {
    const d = decaySummaryFor(trialsForPhase);
    if (!d) return null;
    const sch = MATCH_CONDITION_SCHEDULES[d.schedule];
    return (
      <div className="mt-3 text-xs bg-amber-50 border border-amber-200 rounded p-2 text-amber-900">
        <strong>Phase 3e match condition:</strong>{' '}
        <span className="font-mono">{sch?.label ?? d.schedule}</span>
        {' · '}
        decay factor went from{' '}
        <span className="font-mono">{d.startFactor?.toFixed(2)}</span> to{' '}
        <span className="font-mono">{d.endFactor?.toFixed(2)}</span>{' '}
        over <span className="font-mono">{(d.endElapsedMs / 1000).toFixed(1)} s</span>
        {' · '}
        {d.trialCount} trials under decay. Lower factor = seam fades further into the ball (harder to resolve).
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 px-3 py-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Results</h1>
            <p className="text-xs sm:text-sm text-slate-500">
              Subject <strong>{session.subjectId}</strong> · {session.eyeCondition} · {session.distanceM}m ·{' '}
              {new Date(session.startTime).toLocaleString()}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleDownloadTrialCSV}
                    className="flex items-center gap-2 px-3 py-2 text-xs sm:text-sm rounded bg-white border border-slate-300 hover:bg-slate-100">
              <Download className="w-4 h-4" /> Trial CSV
            </button>
            <button onClick={handleDownloadSummaryCSV}
                    className="flex items-center gap-2 px-3 py-2 text-xs sm:text-sm rounded bg-white border border-slate-300 hover:bg-slate-100">
              <Download className="w-4 h-4" /> Summary CSV
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-300 p-6 mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div>
              <div className="text-xs text-slate-500">VA100 logMAR</div>
              <div className="text-3xl font-mono font-bold text-slate-800">
                {va100Result ? va100Result.logMAR.toFixed(2) : '-'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">VA100 Snellen</div>
              <div className="text-3xl font-mono font-bold text-slate-800">
                {va100Result ? logMARtoSnellen(va100Result.logMAR, session.distanceM) : '-'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Seam logMAR</div>
              <div className="text-3xl font-mono font-bold text-slate-800">
                {seamResult ? seamResult.logMAR.toFixed(2) : '-'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Trials total</div>
              <div className="text-3xl font-mono font-bold text-slate-800">
                {allTrials.length}
              </div>
            </div>
          </div>
        </div>

        {/* Chart (only if Phase 1 data exists) */}
        {(va100Result || contrastResults.length > 0) && (
        <div className="bg-white rounded-lg border border-slate-300 p-5 mb-6">
          <h2 className="font-semibold text-slate-800 mb-2">VA vs Contrast</h2>
          <p className="text-xs text-slate-500 mb-3">
            Higher on the chart = better vision (lower logMAR). The dashed line marks 6/6 (logMAR 0.00).
            Contrast decreases from left to right. Experimental points (0.1%) are at or beyond 8-bit display limits.
          </p>
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 10, right: 24, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="contrastLabel" tick={{ fontSize: 12 }} />
                <YAxis
                  dataKey="logMAR"
                  domain={[CONFIG.LOGMAR_MAX, CONFIG.LOGMAR_MIN]}
                  tick={{ fontSize: 12 }}
                  label={{ value: 'logMAR (↑ better)', angle: -90, position: 'insideLeft', offset: 10, fontSize: 11 }}
                />
                <Tooltip
                  formatter={(value, name, ctx) => {
                    if (name === 'logMAR') {
                      const row = ctx && ctx.payload;
                      return [
                        `${Number(value).toFixed(2)} (${row?.snellen ?? ''})${row?.experimental ? ' [experimental]' : ''}${row?.guardrail ? ' [guardrail]' : ''}`,
                        'logMAR',
                      ];
                    }
                    return [value, name];
                  }}
                />
                <ReferenceLine y={0} stroke="#64748b" strokeDasharray="4 4" label={{ value: '6/6', position: 'right', fontSize: 11, fill: '#64748b' }} />
                <Line
                  type="monotone"
                  dataKey="logMAR"
                  stroke="#0f172a"
                  strokeWidth={2}
                  dot={{ r: 5, fill: '#0f172a', stroke: '#ffffff', strokeWidth: 1 }}
                  activeDot={{ r: 7 }}
                  isAnimationActive={false}
                />
                <Legend />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        )}

        {/* Kinetic (Phase 2 DEMO) results */}
        {kineticResult && (
          <div className="bg-white rounded-lg border border-rose-300 p-5 mb-6">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="font-semibold text-slate-800">Phase 2 · Kinetic VA</h2>
              <span className="px-2 py-0.5 bg-rose-600 text-white text-[10px] rounded font-semibold">DEMO_KINETIC</span>
              <span className="text-xs text-slate-500">web timing -not clinical-grade</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <div className="text-xs text-slate-500">Threshold speed</div>
                <div className="text-2xl font-mono font-bold text-slate-800">
                  {kineticResult.thresholdSpeedKmh.toFixed(0)} km/h
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Starting logMAR</div>
                <div className="text-2xl font-mono font-bold text-slate-800">
                  {kineticResult.fixedLogMAR.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Trials · reversals</div>
                <div className="text-2xl font-mono font-bold text-slate-800">
                  {kineticResult.totalTrials} · {kineticResult.totalReversals}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Travel @ threshold</div>
                <div className="text-2xl font-mono font-bold text-slate-800">
                  {kineticTravelTimeMs(kineticResult.thresholdSpeedKmh).toFixed(0)} ms
                </div>
              </div>
            </div>
            {kineticJitter && (
              <div className="mt-4 text-xs text-slate-500 border-t border-slate-200 pt-3">
                Frame timing over {kineticJitter.trialCount} trials · avg frame delta{' '}
                <span className="font-mono">{kineticJitter.avgOfAvgs.toFixed(2)} ms</span> ·
                worst frame delta{' '}
                <span className="font-mono">{kineticJitter.worstMax.toFixed(2)} ms</span>{' '}
                (target ≈ 16.7 ms @ 60 Hz / 8.3 ms @ 120 Hz). High worst-case deltas indicate the browser dropped frames.
              </div>
            )}
            <div className="mt-3 text-xs bg-rose-50 border border-rose-200 rounded p-2 text-rose-800">
              <strong>Demo only.</strong> Kinetic VA on the web uses <code>requestAnimationFrame</code> which cannot
              guarantee the sub-millisecond timing precision needed for clinical kinetic thresholds. Use this for
              design validation and collaborator demos; re-measure on native iOS before publishing any number.
            </div>
          </div>
        )}

        {/* Kinetic Seam (Phase 3b DEMO) results */}
        {kineticSeamResult && (
          <div className="bg-white rounded-lg border border-rose-300 p-5 mb-6">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="font-semibold text-slate-800">Phase 3b · Kinetic Cricket-Ball Seam</h2>
              <span className="px-2 py-0.5 bg-rose-600 text-white text-[10px] rounded font-semibold">DEMO_KINETIC</span>
              {seamTheme && (
                <span className="text-xs text-slate-500 flex items-center gap-2">
                  <span
                    className="inline-block rounded-full border"
                    style={{ width: 14, height: 14, backgroundColor: seamTheme.ball, borderColor: seamTheme.seam }}
                  />
                  {seamTheme.label}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <div className="text-xs text-slate-500">Threshold speed</div>
                <div className="text-2xl font-mono font-bold text-slate-800">
                  {kineticSeamResult.thresholdSpeedKmh.toFixed(0)} km/h
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Starting logMAR</div>
                <div className="text-2xl font-mono font-bold text-slate-800">
                  {kineticSeamResult.fixedLogMAR.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Trials · reversals</div>
                <div className="text-2xl font-mono font-bold text-slate-800">
                  {kineticSeamResult.totalTrials} · {kineticSeamResult.totalReversals}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Travel @ threshold</div>
                <div className="text-2xl font-mono font-bold text-slate-800">
                  {kineticTravelTimeMs(kineticSeamResult.thresholdSpeedKmh).toFixed(0)} ms
                </div>
              </div>
            </div>
            {kineticSeamJitter && (
              <div className="mt-4 text-xs text-slate-500 border-t border-slate-200 pt-3">
                Frame timing over {kineticSeamJitter.trialCount} trials · avg frame delta{' '}
                <span className="font-mono">{kineticSeamJitter.avgOfAvgs.toFixed(2)} ms</span> ·
                worst frame delta{' '}
                <span className="font-mono">{kineticSeamJitter.worstMax.toFixed(2)} ms</span>{' '}
                (target ≈ 16.7 ms @ 60 Hz / 8.3 ms @ 120 Hz).
              </div>
            )}
            {kineticResult && (
              <div className="mt-3 text-xs text-slate-500 border-t border-slate-200 pt-2">
                Δ vs Phase 2 (Landolt C kinetic):{' '}
                <span className="font-mono">
                  {(kineticSeamResult.thresholdSpeedKmh - kineticResult.thresholdSpeedKmh >= 0 ? '+' : '')}
                  {(kineticSeamResult.thresholdSpeedKmh - kineticResult.thresholdSpeedKmh).toFixed(0)} km/h
                </span>
                {' · '}
                positive means the subject can handle the cricket-ball seam at a higher speed than the Landolt C gap at the same logMAR -stimulus-specific advantage.
              </div>
            )}
            {renderDecayFooter(kineticSeamTrials)}
            <div className="mt-3 text-xs bg-rose-50 border border-rose-200 rounded p-2 text-rose-800">
              <strong>Demo only.</strong> Same RAF-timing caveat as Phase 2 -kinetic thresholds must be re-measured on native iOS.
            </div>
          </div>
        )}

        {/* Drift (Phase 3c DEMO) results */}
        {driftResult && (
          <div className="bg-white rounded-lg border border-rose-300 p-5 mb-6">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="font-semibold text-slate-800">Phase 3c · Swing / Drift Detection</h2>
              <span className="px-2 py-0.5 bg-rose-600 text-white text-[10px] rounded font-semibold">DEMO_KINETIC</span>
              {seamTheme && (
                <span className="text-xs text-slate-500 flex items-center gap-2">
                  <span className="inline-block rounded-full border"
                    style={{ width: 14, height: 14, backgroundColor: seamTheme.ball, borderColor: seamTheme.seam }} />
                  {seamTheme.label}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <div className="text-xs text-slate-500">Min detectable drift</div>
                <div className="text-2xl font-mono font-bold text-slate-800">
                  {driftResult.thresholdDriftPx.toFixed(0)} px
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Starting logMAR · speed</div>
                <div className="text-2xl font-mono font-bold text-slate-800">
                  {driftResult.fixedLogMAR.toFixed(2)} · {driftResult.fixedSpeedKmh.toFixed(0)} km/h
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Trials · reversals</div>
                <div className="text-2xl font-mono font-bold text-slate-800">
                  {driftResult.totalTrials} · {driftResult.totalReversals}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Chance level</div>
                <div className="text-2xl font-mono font-bold text-slate-800">50% (2AFC)</div>
              </div>
            </div>
            {renderDecayFooter(driftTrials)}
            <div className="mt-3 text-xs bg-rose-50 border border-rose-200 rounded p-2 text-rose-800">
              <strong>Demo only.</strong> 2AFC left/right drift detection at a given starting logMAR and speed. Input:
              compass <strong>←</strong> or <strong>→</strong>. Clinical use requires native-timing re-measurement.
            </div>
          </div>
        )}

        {/* Spin (Phase 3d DEMO) results */}
        {spinResult && (
          <div className="bg-white rounded-lg border border-rose-300 p-5 mb-6">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="font-semibold text-slate-800">Phase 3d · Spin Direction Detection</h2>
              <span className="px-2 py-0.5 bg-rose-600 text-white text-[10px] rounded font-semibold">DEMO_KINETIC</span>
              {seamTheme && (
                <span className="text-xs text-slate-500 flex items-center gap-2">
                  <span className="inline-block rounded-full border"
                    style={{ width: 14, height: 14, backgroundColor: seamTheme.ball, borderColor: seamTheme.seam }} />
                  {seamTheme.label}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <div className="text-xs text-slate-500">Min detectable rotation</div>
                <div className="text-2xl font-mono font-bold text-slate-800">
                  {spinResult.thresholdRevsPerSec.toFixed(1)} rev/s
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Starting logMAR · speed</div>
                <div className="text-2xl font-mono font-bold text-slate-800">
                  {spinResult.fixedLogMAR.toFixed(2)} · {spinResult.fixedSpeedKmh.toFixed(0)} km/h
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Trials · reversals</div>
                <div className="text-2xl font-mono font-bold text-slate-800">
                  {spinResult.totalTrials} · {spinResult.totalReversals}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Chance level</div>
                <div className="text-2xl font-mono font-bold text-slate-800">50% (2AFC)</div>
              </div>
            </div>
            {renderDecayFooter(spinTrials)}
            <div className="mt-3 text-xs bg-rose-50 border border-rose-200 rounded p-2 text-rose-800">
              <strong>Demo only.</strong> 2AFC CCW/CW rotation detection. Input: compass <strong>←</strong>&nbsp;(CCW) or
              <strong> →</strong>&nbsp;(CW). Clinical use requires native-timing re-measurement.
            </div>
          </div>
        )}

        {/* Seam (Phase 3a) results */}
        {seamResult && (
          <div className="bg-white rounded-lg border border-slate-300 p-5 mb-6">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="font-semibold text-slate-800">Phase 3a · Static Seam Detection</h2>
              {seamTheme && (
                <span className="text-xs text-slate-500 flex items-center gap-2">
                  <span
                    className="inline-block rounded-full border"
                    style={{ width: 14, height: 14, backgroundColor: seamTheme.ball, borderColor: seamTheme.seam }}
                  />
                  {seamTheme.label}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
              <div>
                <div className="text-xs text-slate-500">Seam logMAR</div>
                <div className="text-2xl font-mono font-bold text-slate-800">{seamResult.logMAR.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Snellen @ {session.distanceM}m</div>
                <div className="text-2xl font-mono font-bold text-slate-800">{logMARtoSnellen(seamResult.logMAR, session.distanceM)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Decimal VA</div>
                <div className="text-2xl font-mono font-bold text-slate-800">{seamResult.decimalVA.toFixed(3)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Seam width</div>
                <div className="text-2xl font-mono font-bold text-slate-800">
                  {(seamResult.mar).toFixed(2)} ′
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Trials · reversals</div>
                <div className="text-2xl font-mono font-bold text-slate-800">
                  {seamState?.totalTrials ?? 0} · {seamState?.totalReversals ?? 0}
                </div>
              </div>
            </div>
            {va100Result && (
              <div className="mt-4 text-xs text-slate-500 border-t border-slate-200 pt-3">
                Δ vs VA100:{' '}
                <span className="font-mono">
                  {(seamResult.logMAR - va100Result.logMAR >= 0 ? '+' : '')}
                  {(seamResult.logMAR - va100Result.logMAR).toFixed(2)} logMAR
                </span>
                {' · '}
                Positive Δ means the subject needed a larger angular detail to identify a cricket-ball seam than to identify a Landolt C gap at full contrast -a functional detail-detection gap.
              </div>
            )}
            {renderDecayFooter(seamTrials)}
          </div>
        )}

        {/* Summary table (Phase 1 only) */}
        {(va100Result || contrastResults.length > 0) && (
        <div className="bg-white rounded-lg border border-slate-300 p-5 mb-6">
          <h2 className="font-semibold text-slate-800 mb-3">Summary</h2>
          <div className="overflow-x-auto">
          <table className="text-sm w-full min-w-[700px]">
            <thead>
              <tr className="text-slate-500 border-b border-slate-200">
                <th className="text-left py-1">Contrast</th>
                <th className="text-right">logCS</th>
                <th className="text-right">logMAR</th>
                <th className="text-right">Snellen</th>
                <th className="text-right">Decimal VA</th>
                <th className="text-right">Trials</th>
                <th className="text-center">Confirm</th>
                <th className="text-center">Guardrail</th>
                <th className="text-center">Tag</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {va100Result && (
                <tr className="border-b border-slate-100 bg-slate-50">
                  <td className="py-1">100.0%</td>
                  <td className="text-right">{logCS(1.0).toFixed(2)}</td>
                  <td className="text-right">{va100Result.logMAR.toFixed(2)}</td>
                  <td className="text-right">{logMARtoSnellen(va100Result.logMAR, session.distanceM)}</td>
                  <td className="text-right">{va100Result.decimalVA.toFixed(3)}</td>
                  <td className="text-right">{va100Result.totalTrials}</td>
                  <td className="text-center">converged</td>
                  <td className="text-center">-</td>
                  <td className="text-center">reliable</td>
                </tr>
              )}
              {contrastResults.map((r) => (
                <tr key={r.contrast} className="border-b border-slate-100">
                  <td className="py-1">{r.contrastPercent.toFixed(r.contrast < 0.01 ? 2 : 1)}%</td>
                  <td className="text-right">{r.logCS.toFixed(2)}</td>
                  <td className="text-right">{r.logMAR.toFixed(2)}</td>
                  <td className="text-right">{logMARtoSnellen(r.logMAR, session.distanceM)}</td>
                  <td className="text-right">{r.decimalVA.toFixed(3)}</td>
                  <td className="text-right">{r.trialsCount}</td>
                  <td className="text-center">{r.confirmationScore ?? '-'}</td>
                  <td className="text-center">{r.guardrailTriggered ? '●' : '-'}</td>
                  <td className={`text-center ${
                    r.reliabilityTag === 'experimental' ? 'text-rose-600' :
                    r.reliabilityTag === 'caution' ? 'text-amber-600' : 'text-emerald-600'
                  }`}>{r.reliabilityTag}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div className="text-xs text-slate-400 mt-2">
            Fidelity tier: <strong>CLINICAL_STATIC</strong> -static VA and contrast measurements on a calibrated display are clinical-grade.
          </div>
        </div>
        )}

        {/* Trial log */}
        <div className="bg-white rounded-lg border border-slate-300 p-5 mb-6">
          <h2 className="font-semibold text-slate-800 mb-3">Trial log ({allTrials.length})</h2>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-xs font-mono min-w-[600px]">
              <thead className="text-slate-500 sticky top-0 bg-white">
                <tr className="border-b border-slate-200">
                  <th className="text-left py-1 px-2">#</th>
                  <th className="text-left">Phase</th>
                  <th className="text-left">Stage</th>
                  <th className="text-right">logMAR</th>
                  <th className="text-right">C%</th>
                  <th className="text-left">Shown</th>
                  <th className="text-left">Resp</th>
                  <th className="text-center">OK</th>
                  <th className="text-right">RT (ms)</th>
                  <th className="text-center">Ovrd</th>
                </tr>
              </thead>
              <tbody>
                {allTrials.map((t, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td className="py-1 px-2">{i + 1}</td>
                    <td>{t.phase}</td>
                    <td>{t.stage}</td>
                    <td className="text-right">{t.logMAR.toFixed(2)}</td>
                    <td className="text-right">{t.contrastPercent.toFixed(t.contrastFraction < 0.01 ? 2 : 1)}</td>
                    <td>{t.orientationPresented}</td>
                    <td>{t.orientationResponded ?? '-'}</td>
                    <td className="text-center">{t.isCorrect ? '✓' : '✗'}</td>
                    <td className="text-right">{Math.round(t.reactionTimeMs)}</td>
                    <td className="text-center">{t.isManualOverride ? '●' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
          <button onClick={onNewSubject}
                  className="flex items-center justify-center gap-2 px-4 py-2 border border-slate-300 rounded-lg bg-white hover:bg-slate-100 text-sm">
            <RotateCcw className="w-4 h-4" /> New Subject
          </button>
          <button onClick={onBackToSetup}
                  className="flex items-center justify-center gap-2 px-4 py-2 border border-slate-300 rounded-lg bg-white hover:bg-slate-100 text-sm">
            Edit Settings
          </button>
          <button onClick={onNewTest}
                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-900 text-sm">
            <Play className="w-4 h-4" /> Re-run Test (Same Settings)
          </button>
        </div>

        <AppFooter />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SECTION 8: MAIN APP
// ═══════════════════════════════════════════════════════════════

const initialAppState = {
  screen: 'SETUP',
  session: null,
  va100State: null,
  va100Trials: [],
  contrastState: null,
  contrastTrials: [],
  seamState: null,
  seamTrials: [],
  kineticState: null,
  kineticTrials: [],
  kineticSeamState: null,
  kineticSeamTrials: [],
  driftState: null,
  driftTrials: [],
  spinState: null,
  spinTrials: [],
  phaseCursor: 0,
};

function screenForPhase(phase) {
  switch (phase) {
    case 'VA100':         return 'TESTING_VA100';
    case 'CONTRAST':      return 'TESTING_CONTRAST';
    case 'SEAM_STATIC':   return 'TESTING_SEAM';
    case 'KINETIC_SPEED': return 'TESTING_KINETIC';
    case 'KINETIC_SEAM':  return 'TESTING_KINETIC_SEAM';
    case 'DRIFT':         return 'TESTING_DRIFT';
    case 'SPIN':          return 'TESTING_SPIN';
    default:              return 'RESULTS';
  }
}

function nextPhaseScreen(session, cursor) {
  const phases = TEST_BATTERIES[session?.battery]?.phases ?? ['VA100', 'CONTRAST'];
  if (cursor >= phases.length) return { screen: 'RESULTS', cursor };
  return { screen: screenForPhase(phases[cursor]), cursor };
}

function appReducer(state, action) {
  switch (action.type) {
    case 'OPEN_HARNESS':
      return { ...state, screen: 'TEST_HARNESS' };
    case 'CLOSE_HARNESS':
      return { ...state, screen: 'SETUP' };
    case 'OPEN_ABOUT':
      return { ...state, screen: 'ABOUT' };
    case 'CLOSE_ABOUT':
      return { ...state, screen: 'SETUP' };
    case 'START_SESSION': {
      const session = action.session;
      const first = nextPhaseScreen(session, 0);
      return {
        ...state,
        session,
        va100State: null, va100Trials: [],
        contrastState: null, contrastTrials: [],
        seamState: null, seamTrials: [],
        kineticState: null, kineticTrials: [],
        kineticSeamState: null, kineticSeamTrials: [],
        driftState: null, driftTrials: [],
        spinState: null, spinTrials: [],
        phaseCursor: first.cursor + 1,
        screen: first.screen === 'RESULTS' ? 'RESULTS' : first.screen,
      };
    }
    case 'FINISH_VA100': {
      const next = nextPhaseScreen(state.session, state.phaseCursor);
      return {
        ...state,
        va100State: action.va100State,
        va100Trials: action.trials,
        phaseCursor: state.phaseCursor + 1,
        screen: next.screen,
      };
    }
    case 'FINISH_CONTRAST': {
      const next = nextPhaseScreen(state.session, state.phaseCursor);
      return {
        ...state,
        contrastState: action.contrastState,
        contrastTrials: action.trials,
        phaseCursor: state.phaseCursor + 1,
        screen: next.screen,
      };
    }
    case 'FINISH_SEAM': {
      const next = nextPhaseScreen(state.session, state.phaseCursor);
      return {
        ...state,
        seamState: action.seamState,
        seamTrials: action.trials,
        phaseCursor: state.phaseCursor + 1,
        screen: next.screen,
      };
    }
    case 'FINISH_KINETIC': {
      const next = nextPhaseScreen(state.session, state.phaseCursor);
      return {
        ...state,
        kineticState: action.kineticState,
        kineticTrials: action.trials,
        phaseCursor: state.phaseCursor + 1,
        screen: next.screen,
      };
    }
    case 'FINISH_KINETIC_SEAM': {
      const next = nextPhaseScreen(state.session, state.phaseCursor);
      return {
        ...state,
        kineticSeamState: action.kineticSeamState,
        kineticSeamTrials: action.trials,
        phaseCursor: state.phaseCursor + 1,
        screen: next.screen,
      };
    }
    case 'FINISH_DRIFT': {
      const next = nextPhaseScreen(state.session, state.phaseCursor);
      return {
        ...state,
        driftState: action.driftState,
        driftTrials: action.trials,
        phaseCursor: state.phaseCursor + 1,
        screen: next.screen,
      };
    }
    case 'FINISH_SPIN': {
      const next = nextPhaseScreen(state.session, state.phaseCursor);
      return {
        ...state,
        spinState: action.spinState,
        spinTrials: action.trials,
        phaseCursor: state.phaseCursor + 1,
        screen: next.screen,
      };
    }
    case 'NEW_TEST_SAME_SETTINGS': {
      const first = nextPhaseScreen(state.session, 0);
      return {
        ...state,
        va100State: null, va100Trials: [],
        contrastState: null, contrastTrials: [],
        seamState: null, seamTrials: [],
        kineticState: null, kineticTrials: [],
        kineticSeamState: null, kineticSeamTrials: [],
        driftState: null, driftTrials: [],
        spinState: null, spinTrials: [],
        phaseCursor: first.cursor + 1,
        screen: first.screen,
      };
    }
    case 'BACK_TO_SETUP':
      return { ...state, screen: 'SETUP' };
    case 'NEW_SUBJECT':
      return { ...initialAppState };
    default:
      return state;
  }
}

export default function OptoKVA() {
  const [state, dispatch] = useReducer(appReducer, initialAppState);

  if (state.screen === 'TEST_HARNESS') {
    return <TestHarness onBack={() => dispatch({ type: 'CLOSE_HARNESS' })} />;
  }

  if (state.screen === 'ABOUT') {
    return <AboutScreen onBack={() => dispatch({ type: 'CLOSE_ABOUT' })} />;
  }

  if (state.screen === 'SETUP') {
    return (
      <SetupScreen
        initialSession={state.session}
        onStart={(session) => dispatch({ type: 'START_SESSION', session })}
        onOpenHarness={() => dispatch({ type: 'OPEN_HARNESS' })}
        onOpenAbout={() => dispatch({ type: 'OPEN_ABOUT' })}
      />
    );
  }

  if (state.screen === 'TESTING_VA100') {
    return (
      <TestScreen
        key={`va100-${state.session?.sessionId ?? 'new'}`}
        engineAdapter={va100EngineAdapter}
        initialStateArgs={{}}
        session={state.session}
        fidelityTier={FIDELITY_TIERS.CLINICAL_STATIC}
        onComplete={(va100State, trials) => dispatch({ type: 'FINISH_VA100', va100State, trials })}
      />
    );
  }

  if (state.screen === 'TESTING_CONTRAST') {
    const va100Result = va100GetResult(state.va100State);
    const seed = va100Result ? va100Result.logMAR : state.va100State?.logMAR ?? 0;
    return (
      <TestScreen
        key={`contrast-${state.session?.sessionId ?? 'new'}`}
        engineAdapter={contrastEngineAdapter}
        initialStateArgs={{ va100LogMAR: seed }}
        session={state.session}
        fidelityTier={FIDELITY_TIERS.CLINICAL_STATIC}
        onComplete={(contrastState, trials) => dispatch({ type: 'FINISH_CONTRAST', contrastState, trials })}
      />
    );
  }

  if (state.screen === 'TESTING_SEAM') {
    const seamAdapter = makeSeamStaticEngineAdapter(
      state.session?.ballTheme ?? DEFAULT_BALL_THEME,
      {
        plainBackground: state.session?.plainBackground,
        matchConditionSchedule: state.session?.matchConditionSchedule,
      }
    );
    return (
      <TestScreen
        key={`seam-${state.session?.sessionId ?? 'new'}`}
        engineAdapter={seamAdapter}
        initialStateArgs={{}}
        session={state.session}
        fidelityTier={FIDELITY_TIERS.CLINICAL_STATIC}
        onComplete={(seamState, trials) => dispatch({ type: 'FINISH_SEAM', seamState, trials })}
      />
    );
  }

  if (state.screen === 'TESTING_KINETIC') {
    return (
      <TestScreen
        key={`kinetic-${state.session?.sessionId ?? 'new'}`}
        engineAdapter={kineticSpeedEngineAdapter}
        initialStateArgs={{
          fixedLogMAR: state.session?.kineticLogMAR ?? CONFIG.KINETIC_DEFAULT_LOGMAR,
          initialSpeedKmh: state.session?.kineticStartSpeed ?? CONFIG.KINETIC_DEFAULT_START_SPEED_KMH,
        }}
        session={state.session}
        fidelityTier={FIDELITY_TIERS.DEMO_KINETIC}
        onComplete={(kineticState, trials) => dispatch({ type: 'FINISH_KINETIC', kineticState, trials })}
      />
    );
  }

  if (state.screen === 'TESTING_KINETIC_SEAM') {
    const kineticSeamAdapter = makeKineticSeamEngineAdapter(
      state.session?.ballTheme ?? DEFAULT_BALL_THEME,
      {
        plainBackground: state.session?.plainBackground,
        matchConditionSchedule: state.session?.matchConditionSchedule,
      }
    );
    return (
      <TestScreen
        key={`kinseam-${state.session?.sessionId ?? 'new'}`}
        engineAdapter={kineticSeamAdapter}
        initialStateArgs={{
          fixedLogMAR: state.session?.kineticLogMAR ?? CONFIG.KINETIC_DEFAULT_LOGMAR,
          initialSpeedKmh: state.session?.kineticStartSpeed ?? CONFIG.KINETIC_DEFAULT_START_SPEED_KMH,
        }}
        session={state.session}
        fidelityTier={FIDELITY_TIERS.DEMO_KINETIC}
        onComplete={(kineticSeamState, trials) => dispatch({ type: 'FINISH_KINETIC_SEAM', kineticSeamState, trials })}
      />
    );
  }

  if (state.screen === 'TESTING_DRIFT') {
    const driftAdapter = makeDriftEngineAdapter(
      state.session?.ballTheme ?? DEFAULT_BALL_THEME,
      {
        plainBackground: state.session?.plainBackground,
        matchConditionSchedule: state.session?.matchConditionSchedule,
      }
    );
    return (
      <TestScreen
        key={`drift-${state.session?.sessionId ?? 'new'}`}
        engineAdapter={driftAdapter}
        initialStateArgs={{
          fixedLogMAR: state.session?.kineticLogMAR ?? CONFIG.DRIFT_DEFAULT_LOGMAR,
          fixedSpeedKmh: state.session?.kineticStartSpeed ?? CONFIG.DRIFT_DEFAULT_SPEED_KMH,
        }}
        session={state.session}
        fidelityTier={FIDELITY_TIERS.DEMO_KINETIC}
        onComplete={(driftState, trials) => dispatch({ type: 'FINISH_DRIFT', driftState, trials })}
      />
    );
  }

  if (state.screen === 'TESTING_SPIN') {
    const spinAdapter = makeSpinEngineAdapter(
      state.session?.ballTheme ?? DEFAULT_BALL_THEME,
      {
        plainBackground: state.session?.plainBackground,
        matchConditionSchedule: state.session?.matchConditionSchedule,
      }
    );
    return (
      <TestScreen
        key={`spin-${state.session?.sessionId ?? 'new'}`}
        engineAdapter={spinAdapter}
        initialStateArgs={{
          fixedLogMAR: state.session?.kineticLogMAR ?? CONFIG.SPIN_DEFAULT_LOGMAR,
          fixedSpeedKmh: state.session?.kineticStartSpeed ?? CONFIG.SPIN_DEFAULT_SPEED_KMH,
        }}
        session={state.session}
        fidelityTier={FIDELITY_TIERS.DEMO_KINETIC}
        onComplete={(spinState, trials) => dispatch({ type: 'FINISH_SPIN', spinState, trials })}
      />
    );
  }

  if (state.screen === 'RESULTS') {
    return (
      <ResultsScreen
        session={state.session}
        va100State={state.va100State}
        va100Trials={state.va100Trials}
        contrastState={state.contrastState}
        contrastTrials={state.contrastTrials}
        seamState={state.seamState}
        seamTrials={state.seamTrials}
        kineticState={state.kineticState}
        kineticTrials={state.kineticTrials}
        kineticSeamState={state.kineticSeamState}
        kineticSeamTrials={state.kineticSeamTrials}
        driftState={state.driftState}
        driftTrials={state.driftTrials}
        spinState={state.spinState}
        spinTrials={state.spinTrials}
        onNewTest={() => dispatch({ type: 'NEW_TEST_SAME_SETTINGS' })}
        onBackToSetup={() => dispatch({ type: 'BACK_TO_SETUP' })}
        onNewSubject={() => dispatch({ type: 'NEW_SUBJECT' })}
      />
    );
  }

  return <div>Unknown screen: {state.screen}</div>;
}
