# Chart Validation

A chart passes three checks before it ships: **validation** (the chart is well formed and the judge can run it), the **chart check** (it is fair to play), and **auto play** (a perfect run scores 1,000,000). The editor runs all three after every edit; the test suite runs them on every shipped chart.

## Chart format

A chart is a JSON object. Shipped charts are stored as small scripts that assign it to a global, for example `window.KiyoameChartAmsStandard = { … }`.

| Field | Required | Meaning |
|---|---|---|
| `version` | yes | Always `"trackless-v1"` |
| `id` | yes | Unique chart name |
| `title` | no | Song title |
| `bpm` | yes | Tempo; sets checkpoint spacing |
| `duration` | yes | Song length in seconds |
| `cells` | yes | Always 24 |
| `lead` | no | Lead-in before the song, in seconds |
| `sections` | no | `[{ bar, name }]`, bar numbers from 0, used by the editor and the result screen |
| `notes` | yes | The notes, ordered by time |

Each note:

| Field | Notes | Meaning |
|---|---|---|
| `id` | all | Unique note ID |
| `type` | all | `Tap`, `Hold`, `Slide`, `Flow`, `Drag`, `ExTap`, `ExHold`, `ExSlide`, `ExFlow` |
| `layer` | all | `upper` or `lower` |
| `time` | all | Start time in seconds |
| `end` | Hold, Slide, Flow | End time in seconds |
| `x`, `width` | all | Range in whole cells: covers cells `x` to `x + width − 1` |
| `mode`, `tick` | Flow | `hold` or `scrub`; tick spacing in seconds |
| `path` | Slide | `[{ t, x, width }]` points from `time` to `end`; the range moves linearly between them |
| `link` | optional | The ID of the other half of a linked pair |

## Validation errors

Validation stops the chart from loading. Each error names the note.

| Check | Rule |
|---|---|
| Header | `version`, `id`, a non-empty `notes` list, 24 cells, positive `bpm` and `duration` |
| IDs | Present and unique |
| Type and layer | One of the known types; `upper` or `lower` |
| Time | Not negative, never earlier than the previous note |
| End | Long notes need an end after the start and before the song ends; other notes must not have one |
| Range | Whole cells, at least one cell wide, inside the field |
| Flow | Mode is `hold` or `scrub`; tick between 0.05 and 1 s; at least one tick fits |
| Other notes | No `mode` or `tick` outside Flow |
| Slide path | At least two points, from `time` to `end`, increasing times, every point inside the field, the first point matching the note's range |
| Links | Point both ways, same time, one upper and one lower, overlapping ranges |

## Chart check warnings

Warnings do not stop a chart from loading, but a shipped chart has none.

| Warning | Rule | Why |
|---|---|---|
| Contact limit | At most **two** contacts at once. Long notes count for their whole length; taps for 50 ms either side | No pattern should need a third finger |
| Slide or scrub brushing | A Slide's path, or a scrub Flow's band, must not cross another note's range while that note's window is open | The moving finger would take the other note by accident |
| Drag near a note | A Drag must not sit 40–100 ms from another note on an overlapping range | The press for one would also count for the other at a worse grade |
| Unlinked same-moment overlap | Two notes at the same moment on overlapping ranges must be linked | Otherwise it is unclear which touch is for which note |
| Slide layer | Slides belong on the upper layer | Keeps the layer roles readable |

## Auto play

Auto play presses every note exactly on time and in the centre of its range, holds long notes to the end, follows Slide paths and rubs scrub Flows. A valid chart must score 1,000,000. A lower score means the judge cannot resolve the chart as written, even with perfect input.

## Authoring rules

The checks above are automatic. Charts also follow these rules, checked with a hand simulator that plays each chart with two virtual hands at three skill levels:

- **Alternate hands** for notes less than 230 ms apart, including across bar lines.
- **No Drag inside sixteenth runs.** A Drag next to a sixteenth makes the hand that just played useless for the next note.
- **Long notes in calm sections.** Holds sit where the other hand is free; slides lead into drops rather than through them.
- **Charts follow the song.** The beat grid is measured from the audio, and density follows its sections.

## Where the checks run

| Place | What runs |
|---|---|
| `src/tests/song.test.js` | Every shipped chart: validation, no chart warnings, auto play 1,000,000 |
| Chart editor | All three after every edit; problem notes are outlined, and clicking a problem selects its notes |
| Game | Validation on load; chart warnings are logged to the browser console |
