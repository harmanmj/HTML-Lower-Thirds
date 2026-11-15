# HTML Lower Thirds

Lower thirds, song lyrics and whole service orders for OBS, run from a control panel in your browser. You can open it from any computer, tablet or phone on the same network.

- **Speaker lower thirds** (name and title)
- **Song lyrics** from your own hymn text files, split into slides automatically
- **Service orders:** speakers and songs in one list, stepped through with the arrow keys
- **Setup tab** for building services, with saved leadership lists for the stake and for each ward
- No installer and no admin rights needed

## Get it running

1. Download **HTML-Lower-Thirds-Windows.exe** (or the Linux version) from the [Releases](../../releases) page.
2. Put it anywhere you like, such as your Desktop, and double-click it.
   - Windows may show "Windows protected your PC" because the app isn't signed. Click **More info → Run anyway**.
3. The control panel opens in your browser. Leave the black window open while you use it, and close it to stop.

The window lists every address you need: the overlay, the control panel and the setup page, both on this computer (Local) and for other devices (Network).

### Running from source instead

With [Node.js](https://nodejs.org) 18 or newer: double-click `start.bat` (Windows), or run `./start.sh` / `node server.js`. No `npm install` is needed.

### Using it from other computers and phones

The app starts in **this-computer-only** mode, so Windows never asks about the firewall just to use it locally. To use the control panel from a phone, tablet or another computer (or run OBS on a different computer):

1. In the control panel, click **Network: Off** (top right) and then **Turn on**. It lists the addresses other devices can use. Network access lasts until the app is closed: it always starts as this-computer-only.
2. Windows Firewall may ask about network access at that point. Allowing it needs an administrator, and only has to be done once per computer. If no administrator is around, click **Cancel**, and someone with admin rights can later double-click **Allow-Network-Access.bat** (from the same release) once. It opens the app's port on private and work networks and keeps working after updates.

Network access can only be turned on or off from the computer running the app. If port 3000 is already in use, set `"port": 3001` in `config.json` and run `Allow-Network-Access.bat 3001`.

## Your files

Everything you create lives in **Documents\HTML Lower Thirds**, which is made the first time the app runs:

```
HTML Lower Thirds\
  config.json         settings (song folders, lines per slide, ...)
  Leadership.txt      saved leadership lists (stake, and one per ward)
  Services\           service order files, in a folder per ward, e.g.
                        "Arvada 1st Ward\2026-11-15 Sacrament Meeting.txt"
  Songs\              song files (starts with an example; you can use other folders instead)
  presets.json        presets saved from the control panel
```

If your Documents folder is in OneDrive, these files sync to any computer signed in to the same OneDrive. Updating the app never touches this folder.

## Set up OBS

1. Add a **Browser Source** with URL `http://localhost:3000/overlay.html`, Width `1920`, Height `1080`.
2. Optional: **Docks → Custom Browser Docks…** with URL `http://localhost:3000/` to have the control panel inside OBS.
3. After updating the app, double-click the browser source and click **Refresh cache of current page**.

The overlay has no animation of its own. Use OBS show/hide transitions (or the Move plugin) on the browser source, and untick **Shutdown source when not visible**.

To run the app on a different computer from OBS, use that computer's Network address in the browser source instead of `localhost`.

## Service tab

The **Service** tab runs a service order file: speaker lower thirds and songs in order.

```
speaker | Bishop Allen | Conducting
song | 1003
speaker | Sister Ruiz | Speaker
song | 1 - the morning breaks
```

- `song |` takes a hymn number (`1003`), a file name, or part of a title. It expands into the song's lyric slides, starting with its title.
- **→** or **Space** shows the next item, **←** goes back, and **Esc** clears the screen. Click any line to show it, and double-click a speaker line to load it into the form for a one-off edit.
- Songs that can't be found are listed in orange with their line numbers.
- **Browse…** switches to another service file. **Edit…** opens the Setup tab.
- Edits to the service file, or to any song in it, appear within a couple of seconds.

## Setup tab

Builds a service without editing text files by hand. It's also available on its own at `http://localhost:3000/setup.html`.

- **Speakers:** type a name and title. Pick a ward under "Save to ward / list" to keep them in that ward's list. **☆ Save to…** does the same for any speaker already in the service.
- **Leadership lists:** **Stake Leaders** plus one list per ward. **+ Add ward list** adds a ward (for example *Arvada 1st Ward*); **Rename** and **Delete list** manage the selected list.
- **Saved people:** click someone to add them to the service.
- **Songs:** search by hymn number or title; use ↑ ↓ and Enter to pick.
- **Reorder** by dragging the numbers or with ▲ ▼; ✕ removes an item. Speaker names can be edited in place.
- **Save** (Ctrl+S) updates the current file. **New service…** and **Save as…** ask for a date (defaults to the coming Sunday), a service name and a **ward**. The file is saved as `Services\<ward>\yyyy-mm-dd Service name.txt` (or straight in the folder with "No ward") and the control panel switches to it. **Change…** picks the folder; the folder and ward are remembered.

### Leadership.txt

The saved people lists, editable by hand too:

```
[Stake Leaders]
President Hale | Stake President

[Arvada 1st Ward]
Bishop Allen | Bishop
Brother Diaz | First Counselor
Sister Lopez | Relief Society President

[Arvada 2nd Ward]
Bishop Ruiz | Bishop
```

Each `[Name]` is one list: the stake, or a ward. Add a heading (or use **+ Add ward list**) for each ward.

## Song lyrics (on the Service tab)

For songs that aren't in the service order, use the **Song lyrics** section under the name and title form: type a number or title in the box and press Enter, then step through it with **→ / Space**, **←** and **Esc**. Once you pick a song there, the arrow keys control that song; clicking a line in the service order hands them back. The line under the On Air box shows which one the arrow keys control.

### Song files

One `.txt` file per song. The file name is what appears in the song list.

```
[Title]
1 - The Morning Breaks

[Verse]
line one
line two
line three

[Chorus]
line one
line two
```

- `[Title]` is shown as the song's first slide.
- Repeated `[Verse]` sections are numbered Verse 1, Verse 2, and so on. Choruses aren't numbered.
- Each section is split into slides of 2 lines (`linesPerSlide` in `config.json`), so a 5-line verse becomes 2 + 2 + 1.
- Empty sections (like `[Outro]`) and lines starting with `#` are ignored.

## config.json

```json
{
  "songSources": [
    "%OneDrive%\\Documents\\Hymns\\1985 Hymns",
    "%OneDrive%\\Documents\\Hymns\\Hymns for Home and Church"
  ],
  "linesPerSlide": 2,
  "openBrowser": true,
  "lowerThirdsFile": "Services\\Service order.txt",
  "leadershipFile": "Leadership.txt"
}
```

- **songSources:** folders to copy songs from, for example on OneDrive. Their song files are copied into `Songs\<folder name>` inside `Documents\HTML Lower Thirds`, and the app plays the copies, so songs keep working when OneDrive is offline. New and changed files are copied when the app starts, every 5 minutes, and when you click **Update songs** in the Song lyrics section. Each folder becomes a group in the song list. Use `%OneDrive%`, `%USERPROFILE%` or `~` so the same settings work on every computer.
- **songFolders:** use this instead to read songs straight from folders without copying them.
- **Paths:** relative paths are inside `Documents\HTML Lower Thirds`. In JSON, Windows paths need double backslashes (`\\`).
- **openBrowser:** opens the control panel automatically when the app starts.
- **port:** the port to use (default 3000). Restart the app after changing it.
- **allowNetwork:** set to `true` to have network access on every time the app starts (normally it starts as this-computer-only, and the Network switch lasts until the app closes).
- **Applying changes:** restart the app after editing this file. If it can't read `config.json`, the window says so.

## Templates and look

| Template | Fields |
|---|---|
| Speaker (`speaker` / `person`) | name, title: navy `#001f3f` boxes, Arial 48 px / 24 px, at 96, 864 |
| Lyrics | full-width band at y = 810, 1920 × 216, Arial 72 px bold with a black outline, 70 % opaque navy |

The styles are at the top of each template's section in `public/overlay.html`.

## HTTP API (Stream Deck, Companion, scripts)

GET works for all of these, so Stream Deck "Website" buttons and Bitfocus Companion can call them directly.

| URL | What it does |
|---|---|
| `/api/next`, `/api/prev` | Next / previous item in the service order |
| `/api/rundown/show?i=0` | Show service item `i` (counting from 0) |
| `/api/lyrics/song?name=1003` | Choose a song in the Song lyrics section |
| `/api/lyrics/next`, `/api/lyrics/prev` | Next / previous lyric slide |
| `/api/show?preset=Jane` | Show a saved preset |
| `/api/hide` | Clear the screen |
| `/api/state` | What's on screen right now |

## Building the app

The release workflow (`.github/workflows/release.yml`) builds the Windows and Linux apps on every push to `main`. When the `version` in `package.json` hasn't been released yet, it publishes a GitHub release tagged `v<version>`; 0.x versions are marked as pre-releases. So to release a new version, bump `version` and push. To build locally with Node 22+: `npm run build`, which creates the app in `dist/`.

```
server.js               the app (Node built-ins only)
public/                 overlay, control panel and setup pages
lowerthirds.example.txt starter service order
songs-example/          starter song
scripts/build.mjs       packages everything into one executable
```

Hymn texts are often copyrighted, so keep your song files out of this repo. The app reads them from your own folders.
