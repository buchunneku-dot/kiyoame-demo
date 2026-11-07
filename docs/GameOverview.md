# Game Overview

## Concept

Kiyoame is a game that combines a small open world with a rhythm game. The player explores Kiyoame, a rainy Japanese harbour town with a bay, a river and hills to the north, and plays the town's music in a rhythm mode with no lanes.

| | |
|---|---|
| Genre | Rhythm game with an explorable town |
| Engine | Unity 6, Universal Render Pipeline, cel-shaded |
| Input | Touch first; mouse supported |
| This repository | A demo video of the Unity build and a playable web prototype of the rhythm mode |

## Pillars

1. **Play where the hand lands.** Notes cover ranges on one open strip instead of fixed lanes. Chart shapes follow the music, and the player reads movement, not columns.
2. **Two voices, one line.** The melody and the arrangement fall on two layers that meet at the same judgement line, so one song reads as two parts played together.
3. **Fair to fingers.** Timing and position rules are built for real touch screens: wide fingers, latency and several fingers at once.
4. **A town that sounds like its music.** The open world sets the mood the songs are written for: rain, harbour lights, small streets at night.

## The two parts

### The town

The Unity build has a planned harbour town of about 470 × 420 m with countryside around it. It has districts with their own roles, a day and night cycle, rain, street lighting, rail and roads, and interiors such as a bar, an izakaya and a convenience store. A menu button opens the rhythm mode from anywhere in the town and returns to the same spot. The [demo video](https://github.com/buchunneku-dot/kiyoame-demo/releases/latest) shows this build.

### The rhythm mode

The web prototype in this repository is the rhythm mode on its own. It runs in any modern browser on desktop or mobile and contains:

- two original songs with two charts each;
- the full judgement and scoring rules;
- settings for scroll speed, background, touch area and grid lines;
- auto play;
- a result screen with timing and section analysis;
- a two-layer chart editor.

## Session flow

1. **Song select.** Pick a song and a chart. Each chart shows its note count.
2. **Play.** The page enters fullscreen and the song starts. Leaving fullscreen pauses it.
3. **Results.** The score, accuracy, max combo and grade counts, then analysis: timing distribution, accuracy across the song, results by note type and short findings.
4. **Retry or return** to song select.

## Documents

| Document | Content |
|---|---|
| [Core Gameplay](CoreGameplay.md) | Field, layers, note types, charts, results and settings |
| [Judgement and Scoring](JudgementAndScoring.md) | Timing windows, note rules, conflict rules, score formula |
| [Boundary Test Report](BoundaryTestReport.md) | Every rule edge with its expected and actual result |
| [Chart Validation](ChartValidation.md) | Chart format, validation errors, chart warnings, authoring rules |
| [Chart Editor](ChartEditor.md) | How to make and test charts |
