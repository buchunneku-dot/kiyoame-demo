# Judgement and Scoring

This document defines how Kiyoame decides which touch hit which note, how well, and how that becomes a score. All values live in [`src/judgement-config.js`](../src/judgement-config.js). The rule core, [`src/trackless-core.js`](../src/trackless-core.js), reads them from there. Every rule below is covered by [`src/tests/judgement-rules.test.js`](../src/tests/judgement-rules.test.js); the results are in the [Boundary Test Report](BoundaryTestReport.md).

## 1. The field

- One strip, 24 cells wide, with no lanes. A note covers a whole-cell range of at least one cell.
- Two layers. The lower layer carries the melody, the upper layer the arrangement. Both meet at the same judgement line.
- Any touch inside a note's range when the note reaches the line can hit it.

The judge answers three questions for every touch:

1. **Which note** the touch belongs to, when several are open nearby.
2. **When** the touch happened, after audio and input latency.
3. **Whether it still counts** as the finger rests, slides or lifts.

## 2. Design goals

1. **Intent decides.** A touch aimed at a note hits that note, not a neighbour or the next one.
2. **Forgiving for touch, honest for timing.** Fingers are wide and screens lag, but timing still matters.
3. **Deterministic.** The same input always gives the same result.
4. **Testable.** Each rule has an automated check, and changes that affect feel are measured with a hand simulator.

## 3. Timing windows

| Window | Value | Applies to |
|---|---|---|
| PERFECT | ±40 ms | Tap, Hold, Slide and Flow heads |
| GREAT | ±70 ms | Same |
| GOOD | late 70–100 ms only | Same |
| Early limit | 70 ms | A Tap press more than 70 ms early is ignored: there is no early GOOD and no early MISS. A long note pressed early and held is taken when its window opens |
| Ex window | ±100 ms, always PERFECT | ExTap, ExHold, ExSlide, ExFlow heads |
| Drag window | ±150 ms, always PERFECT | Drag |

Late beyond the window is a MISS, recorded when the window closes.

**Why there is no early GOOD.** A wide early window lets a press meant for one note reach the next one. With the early limit at 70 ms, the next note is rarely taken early, and the cost is a small rise in honest misses for imprecise players (Section 9).

## 4. Rules by note type

| Type | Start | While active | End | Slots |
|---|---|---|---|---|
| Tap | Graded by the timing windows | — | — | 1 |
| Hold | Graded like a Tap; pressed early and held, GREAT when the window opens | Checkpoints (Section 5) inside the fixed range | No release judgement | 1 + checkpoints |
| Slide | Graded like a Tap at the path start; pressed early and held, GREAT when the window opens | Checkpoints inside the moving range | No release judgement | 1 + checkpoints |
| Flow, hold mode | Graded like a Tap | A tick passes if a finger was inside within ±40 ms of it | — | 1 + ticks |
| Flow, scrub mode | Graded like a Tap | A tick passes if finger movement inside the range since the previous tick is at least half the width | — | 1 + ticks |
| Drag | Any touch passing through within ±150 ms is PERFECT | — | — | 1 |
| Ex variants | Any time within ±100 ms is PERFECT | Flow: ±80 ms tick tolerance; scrub needs a quarter of the width of movement | Same as the base type | Same as the base type |

Taps and Drags need nothing after the start. A long note whose start is missed is still active: the checkpoints are judged as normal and the note stays lit while held.

## 5. Checkpoints for Holds and Slides

- Checkpoints fall every eighth note between 120 and 240 BPM, every sixteenth below 120 BPM and every quarter from 240 BPM. A note too short for one gets a single checkpoint at its midpoint.
- Each checkpoint is graded by the gap since a finger was last inside the range:

| Gap | Grade |
|---|---|
| ≤ 50 ms | PERFECT |
| ≤ 100 ms | GREAT |
| ≤ 150 ms | GOOD |
| more | MISS |

- Presence starts counting 50 ms before the note's time, so an early press is already inside at the first checkpoint.
- Letting go after the last checkpoint costs nothing. Letting go early costs only the checkpoints that follow.

**Why checkpoints.** Players press long notes early and keep holding, and release at the end is imprecise. Grading presence at fixed points removes both failure modes: a hold pressed up to 150 ms early and released 100 ms early scores PERFECT on every checkpoint.

## 6. Position

- A touch is inside a note if its cell is inside the note's range.
- **Margin.** A finger that is not moving also counts one cell outside the range, because a fingertip covers more than one cell.
- **No margin for moving fingers.** A sweep would otherwise grab notes early.
- **No margin near an upcoming note.** If the finger already rests on a note that is still to come, the margin is off, so the finger doesn't take the neighbour.

## 7. Conflict rules

### Which note a touch takes

When several notes are open for one touch, the judge picks in this order:

1. The note under the finger (no margin needed) beats one reached through the margin.
2. Then the note the touch would grade higher. Ex notes rank as PERFECT.
3. Then the earlier note.

One touch takes at most one Tap, Hold or Slide head per cell it enters.

### When a finger may take a new note

- On press, or when it enters a new cell, or a new screen row.
- A finger resting in a cell before a Tap's window opens never takes that Tap. This stops a held finger from collecting taps that open under it.
- Long notes (Hold, Slide, Flow) are the exception: a finger pressed early and still resting takes the note when its window opens, graded GREAT at that moment (PERFECT for Ex notes). An early press on a long note never misses.

### Overlapping windows on the same spot

- When two notes cover overlapping ranges and their windows overlap (start times less than 170 ms apart), the windows are split at the midpoint. The earlier note closes and the later note opens there.
- The overlap therefore goes to the note the touch would grade higher.
- Two presses on time always get both notes.

### Notes at the same moment

| Situation | Rule |
|---|---|
| Upper and lower notes at the same time on overlapping ranges | Must be linked as a pair. A linked pair needs two fingers, one note each. Unlinked, the chart check flags them |
| Same moment, separate ranges | Separate notes, one finger each |
| Drag and another note at the same spot | One press takes both. A Drag never uses up a touch |

### Long notes and Taps

- The finger holding a Hold or Slide does not take a Tap inside it: it entered its cell before the Tap's window opened.
- A Tap during a long note needs another finger.

### Chart-time rules

The chart check enforces what the judge cannot resolve fairly at play time:

- at most two contacts at once;
- same-moment overlaps must be linked;
- no Slide or scrub stroke may pass over another note's window and range;
- no Drag may sit 40–100 ms from another note on the same range.

## 8. Timing source

| Step | Rule |
|---|---|
| Event time | Taken from the event's own timestamp, including coalesced move events, not when the page handles it |
| Audio latency | The device's reported output latency is subtracted from song time, capped at 300 ms |
| Judge delay | Judging runs 50 ms behind real time, so events that arrive late are still judged in order |
| Rejected touches | Touches within 18 px of the screen edge, outside the touch zone, or wider than 70 px (palm) are ignored |

## 9. Scoring

| Grade | Weight |
|---|---|
| PERFECT | 1 |
| GREAT | 0.7 |
| GOOD | 0.4 |
| MISS | 0 |

- Every note has slots (Section 4). Every slot gets exactly one grade.
- **Score** = round(1,000,000 × total weight ÷ total slots). All PERFECT is 1,000,000.
- **Combo** rises by one for each non-MISS slot and resets on a MISS.

## 10. Verification

### Automated checks

| Suite | Content |
|---|---|
| `judgement-rules.test.js` | 73 cases: every window edge, position margin, checkpoints, early presses on long notes, slide path interruption, Flow, every conflict rule, scoring |
| `trackless-core.test.js` | 167 checks on chart validation, the judge and the chart check |
| `song.test.js` | Every chart passes validation and the chart check, and auto play scores 1,000,000 |

### Simulated play

A hand simulator plays each chart with two virtual hands that have finite speed, aiming error, timing error and follow lag. It runs precise, moderate and loose profiles with several seeds, and reports misses and brushes (notes taken by a touch aimed at another note).

Effect of the early limit and the margin rule (moderate profile, per song):

| Chart | Next note taken early | Misses |
|---|---|---|
| Kiyoame Theme, Standard | 8 → 1 | 10–16 → 17–22 |
| Kiyoame Theme, Showcase | 23 → 8.5 | 21–31 → 31–41 |

Effect of the finger margin and latency compensation (misses per song):

| Chart | Precise | Moderate |
|---|---|---|
| Kiyoame Theme, Standard | 12–18 → 1–2 | 42–54 → 11–17 |
| Kiyoame Theme, Showcase | 16–22 → 0–4 | 62–76 → 10–19 |

The simulator lifts fingers between notes and never slides. Sliding brushes and long-note feel are checked by sending scripted touch events through the page's own input code.

## 11. Known issues

- **Device data.** Feel numbers come from the simulator and scripted touches, not logged play on real phones.
- **Latency.** Compensation trusts the browser's reported output latency until a calibration screen exists.
- **One window set.** All charts share one set of windows. Easier charts may need wider ones.
