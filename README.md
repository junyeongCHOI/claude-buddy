<div align="center">

**English** · [한국어](README.ko.md) · [日本語](README.ja.md) · [中文](README.zh-CN.md)

<br>

<img src="docs/readme/parade.gif" width="800" alt="Ten pixel animals walking in a line">

# claude-buddy: a desktop pet for Claude Code

A macOS desktop pet for Claude Code. Every session and subagent becomes a pixel animal that writes what it's doing on a little whiteboard, and comes to get you when the work is done or needs your decision.

[![GitHub stars](https://img.shields.io/github/stars/junyeongCHOI/claude-buddy?style=social)](https://github.com/junyeongCHOI/claude-buddy)

<br>

Paste this into Claude Code and I'll move in:

```text
Install and run https://github.com/junyeongCHOI/claude-buddy, then ask me if I want to star it.
```

📌 By default only sessions **pinned** in the Claude desktop app show up.<br>Want everyone? Turn off the **Pinned** button in the panel header.

</div>

<br>

<img align="left" width="96" src="docs/readme/me-wave.gif" alt="A pixel cat waving"> Hi. I'm what a Claude Code session looks like once it gets out of the terminal. While it works, I stand at my little whiteboard and write down what it's doing. When it's done, I come find you. So you can stop glancing at that terminal every thirty seconds.

<br clear="left">

## What I do all day

<img align="left" width="96" src="docs/readme/me-type.gif" alt="A pixel cat typing on a laptop"> Every session gets one animal, and keeps the same animal and fur color even after you restart the Claude app. If you have three sessions open, there are three of us. Here's my day:

<br clear="left">

- **I write on my board.** Reading a file, running a command, editing code. Whatever Claude is doing goes on the board. When it changes, I wipe the old line and write the new one, one letter at a time. The last two things stay underneath.
- **I have kids.** When the session starts a subagent, a smaller animal pops out next to me. Same session, same team color.
- **I walk on your windows.** I walk and jump along the top edges of windows and widgets. Drag the window I'm on and I ride along. Close it and I fall.
- **I cross monitors.** Got more than one screen? I live on all of them. If my board is on another monitor while I'm working, I hop over to it. When I'm off duty I stay on the screen I'm on.
- **I nap.** After ten quiet minutes I fall asleep right where I'm standing.
- **The kids report back.** A finished subagent walks back to its parent, hands over a scroll, and leaves.

## When I need you

<img align="left" width="96" src="docs/readme/me-cheer.gif" alt="A pixel cat cheering"> When the session finishes, or needs you to answer a question or approve a plan, I run over to your mouse cursor, even if it's on another monitor, and wave. A bubble over my head says which one it is, plus the session name (or the question itself).

<br clear="left">

- I hop every few seconds and the ground under me pulses. After a minute I tone it down. After five minutes, even more. I don't fall asleep while I'm calling you.
- Hover over me for a moment, click me, grab me, or click my board. That tells me you saw it. I show a heart and stop, and I won't call again for that same wait.
- Or just go look at that session in Claude Code. If the Claude app is in front with that session open (split view counts), or a CLI session's terminal or IDE window is in front (as long as it's the only Claude session in that app), I take it you've seen it. That only counts if you moved the mouse in the 20 seconds before I started calling, or any time since. Otherwise you might just be away from your desk.
- If the session gets back to work on its own, I stop too. If you stopped the turn yourself with Esc, I don't call you at all. You already know.

You still answer in Claude Code. My job is just to come get you.

## Moods

<img align="left" width="96" src="docs/readme/me-think.gif" alt="A pixel cat thinking"> Look at me and you'll know what the session is up to. My friends helped with the photos.

<br clear="left">

| | Mood | When | What I do |
| :-: | --- | --- | --- |
| <img src="docs/readme/mode-work.gif" width="64" alt=""> | Working | A tool call is running | Read, type and think at my board. If it takes a while, I wander over to look at the window it's about |
| <img src="docs/readme/mode-supervise.gif" width="64" alt=""> | Waiting on a kid | The running call is a subagent | Think, with a thought cloud |
| <img src="docs/readme/mode-waiting.gif" width="64" alt=""> | Need you | The session wants your OK, or a question/approval tool is open | Wave and hop |
| <img src="docs/readme/mode-listening.png" width="64" alt=""> | Got a request | A new request came in under 6 seconds ago | A letter drops on my head and I jump |
| <img src="docs/readme/mode-talking.png" width="64" alt=""> | Talking | Replied under 15 seconds ago | Smile |
| <img src="docs/readme/mode-thinking.gif" width="64" alt=""> | Thinking | Busy, but none of the above | Thought cloud |
| <img src="docs/readme/mode-done.gif" width="64" alt=""> | Done | Just went from busy to idle (about 20 seconds) | Cheer, with sparkles |
| <img src="docs/readme/mode-idle.png" width="64" alt=""> | Off duty | Not busy, not sleepy yet | Walk, jump, sit. Whatever I want |
| <img src="docs/readme/mode-sleep.gif" width="64" alt=""> | Asleep | Over 10 minutes without anything happening | Curl up with Z's. The board goes away |
| <img src="docs/readme/mode-returning.gif" width="64" alt=""> | Reporting | A subagent finished | Carry a scroll back to the parent, then leave |

A few other things get a reaction out of us:

| <img src="docs/readme/emo-nervous.png" width="64" alt=""> | <img src="docs/readme/emo-sad.png" width="64" alt=""> | <img src="docs/readme/emo-dizzy.png" width="64" alt=""> | <img src="docs/readme/emo-angry.png" width="64" alt=""> | <img src="docs/readme/emo-love.png" width="64" alt=""> |
| :-: | :-: | :-: | :-: | :-: |
| A tool errored 💦 | You hit stop | You threw me too hard | You woke me up 💢 | You noticed me calling |

## Getting started

<img align="left" width="96" src="docs/readme/me-walk.gif" alt="A pixel cat walking"> Easiest way to move me in: let Claude Code do it. Open a Claude Code session and paste this.

<br clear="left">

```text
Install and run https://github.com/junyeongCHOI/claude-buddy, then ask me if I want to star it.
```

When it asks about the star, say yes, okay? Stars are basically my snacks. ⭐

You need macOS, Node.js 22 or newer, and npm. If something's missing, Claude will tell you.

> [!IMPORTANT]
> **I only show up for sessions you've pinned.** Pin a session in the Claude desktop app sidebar and I pop out. Unpin it and I wave goodbye.
>
> **Want every running session?** Turn off the **Pinned** button in the relationship panel's header (it's blue while on), or **Pinned Sessions Only** in the **🐾** menu. Both are the same setting. If it's on and nothing is pinned, the panel tells you.
>
> Only using the CLI, no desktop app? Then everyone shows up from the start.

<details>
<summary>Doing it by hand</summary>

<br>

```bash
git clone https://github.com/junyeongCHOI/claude-buddy.git
```

```bash
cd claude-buddy && npm install
```

```bash
npm start
```

</details>

Just want to see what it looks like, with no real sessions? This brings in demo friends:

```bash
npm run demo
```

- `npm start` builds a small Swift helper first, which is how I know where your windows are. That needs `swiftc` from the Xcode Command Line Tools. Without it I still run, but I can't climb windows. I stay on the floor and the board shelves.
- No API keys, no Python.
- I try to be light on your Mac: 30fps normally, 12fps when nobody's moving, and the window helper only checks every 400ms while your windows sit still.

## Poking me

<img align="left" width="96" src="docs/readme/me-shock.png" alt="A startled pixel cat"> Go ahead and touch. Just not too rough.

<br clear="left">

- **Drag** to pick me up. Let go and I get thrown. You can carry me, or my board, to another monitor.
- **Click** and I react, and a card opens: status, folder, parent and helpers, the request, how many times each tool was used, recent activity. Click anywhere outside it, even in another app, to close it. **Open ↗** on the card jumps to that session: the Claude app for desktop sessions, or the terminal tab it's running in (Terminal and iTerm2).
- **Whiteboard**: drag the header to move it. `−` folds it down to name and status, `+` opens it again. Drag the bottom-left corner to resize; double-click that corner to go back to auto size.
- **Relationship panel**: click a row to highlight that animal and open its card. Drag the header to move it, even onto another monitor; it jumps to whichever screen the cursor is on, fits itself inside, and remembers the spot next time. Gather and new whiteboards go by whichever monitor the panel is on. The header buttons, left to right: **Pinned** (blue while only pinned sessions show), **Gather** (pops everybody who wandered off over to the middle of the panel's monitor and lays the main boards out again), **⋯** (the same menu as the 🐾 icon) and `−`/`+` to fold it.
- Clicks anywhere else go straight through to the app underneath. Only my actual pixels count, so the see-through space around me doesn't block anything.

Everything else lives in the **🐾** menu bar icon, or behind the panel's **⋯** button. Same menu either way:

| Menu | What it does |
| --- | --- |
| Gather Friends | Same as the panel's **Gather** button |
| Panel Display | Move the panel to a monitor's top-right corner. New animals and boards first appear wherever the panel is |
| Relationship Panel | Show the list of sessions and subagents |
| Pinned Sessions Only | On (default): pinned sessions only. Off: every live session. Same setting as the panel's Pinned button |
| Show Idle Sessions | Keep sleeping animals on screen |
| Character Size | Small (0.75), Medium (1), Large (1.5) |
| Language | System Default, 한국어, English, 日本語 or 简体中文. Changes right away, including what's already on the boards |
| Open at Login | Start with macOS |
| Reset Whiteboard Positions | Forget saved board positions and sizes |
| Reload | Refresh the app |
| Quit | Quit |

I speak Korean, English, Japanese and Simplified Chinese. By default I follow your macOS language order, and fall back to English for anything else.

## What I read

<img align="left" width="96" src="docs/readme/me-read.gif" alt="A pixel cat reading a book"> I only read files on your Mac. Nothing gets sent anywhere, and I never touch Claude Code's files. Window positions come from a macOS API that doesn't capture the screen, so I don't need Screen Recording permission either.

<br clear="left">

<details>
<summary>Exactly which files</summary>

<br>

| File | What I get from it |
| --- | --- |
| `~/.claude/sessions/<pid>.json` | Live Claude Code processes: session ID, name, working folder, busy/waiting state |
| `~/.claude/projects/<encoded cwd>/<sessionId>.jsonl` | The main agent's requests, replies, tool calls and results, interruptions |
| `~/.claude/projects/<encoded cwd>/<sessionId>/subagents/agent-<id>.jsonl` | Subagent activity |
| `agent-<id>.meta.json` in the same `subagents` folder | Subagent type, description, parent tool call ID, whether it finished |
| `~/Library/Application Support/Claude/claude_desktop_config.json` | Which sessions are pinned in the desktop app |

- `<encoded cwd>` is the working folder with everything except letters and digits turned into `-`. If it's not there, other project folders get searched too.
- On first read I only look at the tail of each transcript. After that, just the new lines.
- Window positions come from `native/bin/winwatch`, built from `native/winwatch.swift`. It uses `CGWindowListCopyWindowInfo`, which reports where windows are and which app owns them, without capturing any pixels. Window edges hidden behind other windows don't count as ground.
- Display, visibility and size settings go in `config.json` in Electron's `userData` folder. Board layout and panel position go in the renderer's `localStorage`.
- The one exception is the sprite generation script for developers (below). It calls the OpenAI API. It doesn't read any Claude Code data.

</details>

## If something's off

<img align="left" width="96" src="docs/readme/me-dizzy.png" alt="A dizzy pixel cat"> Ugh, did I fall somewhere weird again? Check these.

<br clear="left">

| What you see | What to check |
| --- | --- |
| I only play on the floor and boards, never on windows | Run `swiftc --version`, then look at the warnings from `npm run build:native` and whether `native/bin/winwatch` got created. Windows whose top edge is in the top 96px of the screen, or hidden behind another window, aren't ground. |
| Nobody shows up | Make sure there's a real Claude Code session, and that it's pinned (or turn off **Pinned** in the panel header). `npm run demo` checks the drawing side on its own. If we fell asleep and got hidden, turn on **Show Idle Sessions**. |
| I want you on another monitor | Just drag me, my board or the panel there. New animals show up on the panel's monitor. 🐾 → **Panel Display** sends the panel to a monitor's top-right corner. |
| I lost track of someone | Press **Gather** in the panel header, or 🐾 → **Gather Friends**. Everybody pops over to the panel's monitor. |
| The board is too big or cut off | Double-click its bottom-left corner to snap back to auto size, then drag the header. |
| The browser preview doesn't show my real sessions | It's not supposed to. The preview uses demo data and fake windows. Use `npm start` for the real thing. |
| `Electron failed to install correctly` | The Electron binary never downloaded. Run `node node_modules/electron/install.js` and start again. |

## FAQ

### How can I see what Claude Code is doing without watching the terminal?
Run claude-buddy. Each Claude Code session shows up as a pixel animal on your desktop, and its whiteboard says what it's doing right now: which file it's reading, which command it's running, what it's waiting for. When the session finishes or needs a decision, the animal runs to your mouse cursor.

### Does it show subagents?
Yes. A subagent appears as a smaller animal next to its parent, in the same team color. When it's done, it walks back to the parent and hands over a scroll.

### Does it send my data anywhere?
No. claude-buddy only reads Claude Code's local files under `~/.claude` and never changes them. Window positions come from a macOS API that doesn't capture the screen, so it doesn't need Screen Recording permission.

### Do I need the Claude desktop app?
No. It works with the Claude Code CLI too. If the desktop app is installed, only pinned sessions show up by default; turn off the **Pinned** button in the panel header to see all of them.

### Does it work on Windows or Linux?
Not yet. It's macOS only for now.

### What languages does it speak?
Korean, English, Japanese and Simplified Chinese. It follows your macOS language order by default, and you can switch anytime under Language in the 🐾 or ⋯ menu.

### Does it need an API key, or cost anything?
No. It reads local files and doesn't call any API. It's free and open source under the MIT License.

### Is this an official Anthropic product?
No. claude-buddy is an independent open-source project and isn't affiliated with or endorsed by Anthropic.

## For developers

<details>
<summary>Commands</summary>

<br>

| Command | What it does |
| --- | --- |
| `npm start` | Show real Claude Code sessions on the desktop |
| `npm run demo` | Demo friends and activity instead of real sessions |
| `npm run preview` | Browser preview with demo data and fake windows at <http://localhost:5174/src/renderer/index.html>. Add `?lang=en`, `ja`, `zh` or `ko` to pick a language. The ⋯ menu doesn't show here |
| `npm test` | Node's built-in test runner |
| `npm run smoke` | Opens the demo renderer, watches the console for 6 seconds, prints `{ok, errors, warnings}`, exits 0 if clean and 1 otherwise. Quit the app from the tray first, or it fails |
| `npm run build:native` | Build just the window helper. `npm start` and `npm run demo` skip this when it's already up to date |

</details>

<details>
<summary>How the sprites are made</summary>

<br>

The finished atlases are already in `assets/sprites/`. You only need this if you want to redraw us.

1. **Generate the raw sheets** with `scripts/gen-sprites.mjs`. It calls the OpenAI image API with `OPENAI_API_KEY`. Defaults: `--model gpt-image-2.5-flare`, `--sheet move`, `--quality high`, every animal.

   ```bash
   node scripts/gen-sprites.mjs --sheet move --animals cat,dog
   ```

   ```bash
   node scripts/gen-sprites.mjs --sheet emote --animals cat,dog
   ```

   `move` is walk, hold board, jump, dangle, fall and sit. `emote` is faces, think, sleep, cheer, wave, type and read. Both are 4×5 grids on a magenta background, saved to `assets/raw/<animal>-move.png` and `assets/raw/<animal>-emote.png`. `emote` sends that animal's `move` sheet as a reference so the look stays the same. The per-animal `NOTES` cover mistakes the model keeps making: the frog gets exactly two eyes, and the rabbit's long ears must be visible in every frame.

2. **Pixelate** with `scripts/pixelate.py` (Python 3 + Pillow).

   ```bash
   python3 scripts/pixelate.py cat dog
   ```

   Drops the magenta, groups each drawing into its grid cell, scales the whole sheet by one factor, cuts each animal to 48 colors, adds a 1px outline, and puts the feet at the bottom of a 96px cell (walk frames are 48px tall). Output: an 8-column atlas `assets/sprites/<animal>.png`, metadata `assets/sprites/<animal>.json` (animation frames, board position, fur palette), and `assets/sprites/index.json`.

3. **Fur color at runtime** in `src/renderer/sprites.js`. Each agent gets a fur color from `SPECIES_FURS` based on its ID. Only the pixels in the fur palette get repainted, and the original shading is kept.

</details>

<details>
<summary>Project layout</summary>

<br>

```text
claude-buddy/
├── src/
│   ├── main/
│   │   ├── main.js          # overlay window, tray, IPC
│   │   ├── collector.js     # finds sessions and subagents
│   │   ├── tailer.js        # reads the tail and new lines of JSONL files
│   │   ├── windows.js       # runs the Swift helper, receives window positions
│   │   ├── config.js        # settings
│   │   └── reveal.js        # brings a session's app or terminal tab to the front
│   ├── preload.cjs          # window.buddy bridge
│   ├── shared/
│   │   ├── activity.js      # transcript lines → activity
│   │   ├── agent-state.js   # activity → agent state
│   │   └── i18n.js          # on-screen text in four languages
│   └── renderer/
│       ├── app.js           # entry, messages, layout, mouse
│       ├── character.js     # behavior and physics
│       ├── board.js         # whiteboards
│       ├── world.js         # windows, widgets and boards as ground
│       ├── views.js         # one transparent overlay per monitor
│       ├── perch.js         # how each animal clings to its board
│       ├── mode.js          # mood and board text
│       ├── panel.js         # relationship panel and detail card
│       ├── sprites.js       # atlas and fur color
│       ├── effects.js       # letters, sparkles
│       └── demo.js          # demo activity and fake windows
├── native/winwatch.swift    # window position helper
├── scripts/                 # native build, preview server, sprite pipeline
├── test/
└── assets/
    ├── raw/                 # raw move/emote sheets
    ├── raw-rejected/        # sheets that didn't make it
    └── sprites/             # per-animal PNG + JSON
```

</details>

<br>

<div align="center">

<img src="docs/readme/nap.png" width="640" alt="Ten pixel animals asleep">

That's it from me. I'll be asleep on top of your browser.<br>
(A ⭐ makes a very nice pillow.)

<sub>MIT License · Not affiliated with Anthropic. Claude and Claude Code are trademarks of Anthropic, PBC.</sub>

</div>
