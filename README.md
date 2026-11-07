# Kiyoame

![Kiyoame](media/poster.jpg)

**Kiyoame** is a work-in-progress game that mixes a small open world with a rhythm game. You explore Kiyoame, a rainy Japanese harbour town with a bay, a river and hills to the north, and play its music in a two-layer rhythm mode with no lanes.

The game is built in Unity 6 (URP) with a cel-shaded look. This repository holds the **demo video** and a **playable web prototype** of the rhythm mode.

**[Play the web prototype in your browser](https://buchunneku-dot.github.io/kiyoame-demo/)** · **[Open the chart editor](https://buchunneku-dot.github.io/kiyoame-demo/editor.html)** · **[Watch the demo video](https://github.com/buchunneku-dot/kiyoame-demo/releases/latest)**

## Demo video

The 54-second demo is attached to the [latest release](https://github.com/buchunneku-dot/kiyoame-demo/releases/latest). It was captured in engine and shows the town by day and by night, a few interiors, and two stretches of rhythm play.

| | | |
|---|---|---|
| ![City flight](media/city-flight.jpg) | ![Old town in the rain](media/old-town-rain.jpg) | ![Konbini](media/konbini.jpg) |
| ![AME BAR](media/ame-bar.jpg) | ![Izakaya](media/izakaya.jpg) | ![Night bay](media/night-bay.jpg) |

## Web prototype

![Rhythm play](media/rhythm-1.jpg)

The rhythm mode as a single web page, with two songs: **Kiyoame Theme** (120 BPM, about 1:30) and **Ams** (136 BPM, about 2:30).

### Start playing

- Play online at **https://buchunneku-dot.github.io/kiyoame-demo/**.
- Or download this repository and open [`play/index.html`](play/index.html) in a desktop or mobile browser. Kiyoame Theme is built into the page, so it plays with no server or install. Ams loads from `play/song/ams.mp3`, so play it online or through a local web server. The editor loads both songs from `play/song/` the same way.
- Chrome, Edge, Firefox and Safari all work. Play in landscape, and use headphones if you can. Start switches the page to fullscreen; leaving fullscreen pauses the song.

On the song select screen, pick a song and a chart, then press **Start**:

| Song | Chart | Notes | For |
|---|---|---|---|
| Kiyoame Theme | **Standard** | 247 | A first play: the melody plus light decoration. |
| Kiyoame Theme | **Showcase** | 351 | The full arrangement: chords, short stairs, hand-to-hand runs and sixteenths in the choruses. |
| Ams | **Standard** | 454 | Kicks and snares in eighths, holds in the quiet parts, slides before the last drop. |
| Ams | **Showcase** | 620 | Denser drops with sixteenth pairs and hand-to-hand runs into each drop. |

### Controls

The game uses a **mouse or a touch screen**. There is no keyboard input.

- The field is one wide strip with no lanes, split into **24 cells** across. A note covers a range of cells, and you hit it by touching anywhere inside that range when it reaches the **judgement line** at the bottom.
- Notes fall on **two layers**: the lower layer (pink) usually carries the melody, and the upper layer (teal) carries the arrangement around it. Both layers meet at the same line, so you play them with the same hand movements.
- With a mouse you have one "finger". With a touch screen you can use as many fingers as you like. No chart ever needs more than two at once.

### Notes

| Note | What to do |
|---|---|
| **Tap** | Press when it reaches the line. |
| **Hold** | Press at the start and keep a finger inside the range until the end. You can switch fingers or slide around, as long as one stays inside. |
| **Slide** | Like a Hold, but the range moves. Follow it. |
| **Drag** (yellow) | Just touch it. A finger resting or sweeping through the range counts, and every touch is PERFECT. |
| **Flow** | A long band scored in ticks. Keep a finger inside it; on the scrub kind, rub back and forth across it. |
| **Ex** notes (gold outline) | Ex Tap, Ex Hold, Ex Slide and Ex Flow work like the plain notes, but any hit within 100 ms either way is PERFECT. |
| **Linked pair** | Two notes at the same moment, one on each layer, joined by a yellow line. Hit both. |

### Judgement and score

| Grade | Timing |
|---|---|
| PERFECT | within ±40 ms |
| GREAT | within ±70 ms |
| GOOD | 70–100 ms late |
| MISS | more than 100 ms late, or not hit |

There is no early GOOD or early MISS: a touch more than 70 ms before a note is ignored, and a finger already resting on a tap before its window opens does not take it. Pressing a Hold, Slide or Flow early never misses: the start is GREAT when its window opens (PERFECT for Ex notes). When two notes' timing windows overlap, a touch goes to the note it would grade higher. A finger that lands up to one cell outside a note still hits it, unless it is resting on another note that is coming up.

Holds and Slides are judged at the start like a tap, then at a checkpoint every eighth note (every sixteenth under 120 BPM). Each checkpoint is PERFECT if a finger was inside within the last 50 ms, GREAT within 100 ms, GOOD within 150 ms, and MISS otherwise. There is no judgement on release, and missing the start does not end the note: keep holding and the checkpoints still count.

The score goes up to 1,000,000. The result screen shows accuracy, max combo and the grade counts for each layer, then a timing histogram (average offset, spread, FAST and SLOW), accuracy across the song by section, results by note type, and short findings such as a steady late bias or the weakest section.

The full rule set, including conflict rules and every note type, is in [Judgement and Scoring](docs/JudgementAndScoring.md). All timing values live in one file, `src/judgement-config.js`.

### Settings

- **Scroll speed** from 1.0 to 20.0, set separately for the upper and lower layers, or locked together.
- **Background**: mist or dark.
- **Touch area**: only near the line, the lower half of the screen, or the full screen.
- **Grid lines**: lane width, every cell, or off.
- **Auto play**: watch a chart played perfectly.

### Chart editor

![Chart editor](media/chart-editor.jpg)

[`play/editor.html`](play/editor.html) is a desktop chart editor for both layers: place and edit every note type on a beat grid, link pairs, play the song with hit sounds, and test the chart in the game from any point. It runs the game's own validation, chart check and auto play after every edit and outlines the notes with problems. See [Chart Editor](docs/ChartEditor.md).

## Documents

| Document | Content |
|---|---|
| [Game Overview](docs/GameOverview.md) | Concept, pillars, the town and the rhythm mode, session flow |
| [Core Gameplay](docs/CoreGameplay.md) | Field, layers, note types, charts, results, settings |
| [Judgement and Scoring](docs/JudgementAndScoring.md) | Timing windows, rules per note type, conflict rules, score formula |
| [Boundary Test Report](docs/BoundaryTestReport.md) | Every rule edge with its expected and actual result |
| [Chart Validation](docs/ChartValidation.md) | Chart format, validation errors, chart warnings, authoring rules |
| [Chart Editor](docs/ChartEditor.md) | Making, checking and testing charts |

## Repository layout

```
play/index.html    the playable page
play/editor.html   the chart editor
src/               the same page as separate files, plus tests
docs/              rule documents and test reports
media/             images for this README
```

To work from the separate files, serve the repository over http (for example `python -m http.server`) and open `src/trackless.html` or `src/editor.html`. To rebuild `play/` from `src/`:

```
python src/build.py
```

To run the tests (Node.js 18 or later):

```
node src/tests/judgement-rules.test.js
node src/tests/trackless-core.test.js
node src/tests/song.test.js
node src/tests/projection.test.js
node src/tests/trackless-touch.test.js
node src/tests/trackless-audio.test.js
node src/tests/editor-model.test.js
node src/tests/result-analysis.test.js
```

`node src/tests/judgement-rules.test.js --report` also rewrites [docs/BoundaryTestReport.md](docs/BoundaryTestReport.md).

## Music

Kiyoame Theme and Ams are original music for this game.

## License

Copyright © 2026 buchunneku-dot. All rights reserved. See [LICENSE](LICENSE).
