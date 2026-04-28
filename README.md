# KSB Flasher

A web-based multi-terminal application for programming firmware images on SmartNIC cards. Opens three SSH sessions to a remote lab machine through a jump host, all in a single window.

## Layout

```
+------------------+---------------------+
|  SEC Minicom     |                     |
|  (top-left)      |                     |
|                  |    XSDB Session     |
+------------------+    (right half)     |
|  NMC Minicom     |                     |
|  (bottom-left)   |                     |
+------------------+---------------------+
```

## One-Click Install (Windows)

1. Download or clone this repository
2. Double-click **`install.bat`**

That's it. The script will:
- Download a portable Python (no system install needed)
- Install all dependencies
- Build a standalone `KSB_Flasher.exe`
- Create a desktop shortcut

## Manual Setup

```bash
pip install -r requirements.txt
pip install pyinstaller
python -m PyInstaller ksb_flasher.spec --clean --noconfirm
# Output: dist/KSB_Flasher.exe
```

Or run directly without building:

```bash
pip install -r requirements.txt
python app.py
```

## Features

- **Jump host support** — SSH through a gateway to reach lab machines on internal networks
- **Separate user logins** — different users for jump host (e.g. `faizh`) and target (e.g. `root`)
- **Connection history** — remembers hosts, users, and customized commands per connection
- **Editable commands** — modify startup commands for each terminal before connecting
- **Live terminals** — full interactive PTY sessions via xterm.js (colors, special keys, scrollback)
- **Auto-resize** — terminals resize with the browser window
- **Standalone .exe** — no Python or dependencies needed on the target machine

## Requirements

- Windows 10/11
- SSH key access to the jump host (`~/.ssh/id_rsa`)
- Network access to the jump host
