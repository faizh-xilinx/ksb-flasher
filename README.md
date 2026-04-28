# KSB Flasher

A web-based multi-terminal application for programming firmware images on AMD SmartNIC cards. Opens four SSH sessions to a remote lab machine through a jump host, with integrated iDRAC power control -- all in a single window.

## Layout

**Default (3-pane):**
```
+------------------+---------------------+
|  SEC Minicom     |                     |
|                  |    APU UART         |
+--  resizable  ---+                     |
|  NMC Minicom     |                     |
+------------------+---------------------+
```

**XSDB enabled (4-quad):**
```
+------------------+---------------------+
|  SEC Minicom     |  NMC Minicom        |
+--  resizable  ---+--  resizable  ------+
|  APU UART        |  XSDB Session       |
+------------------+---------------------+
```

## One-Click Install (Windows)

```
git clone https://github.com/faizh-xilinx/ksb-flasher.git
cd ksb-flasher
install.bat
```

The installer downloads a portable Python, installs dependencies, builds a standalone `KSB_Flasher.exe` (~13.5 MB), and creates a desktop shortcut. No admin rights needed.

### Updating

Run `install.bat` again after pulling new changes. It auto-detects the existing installation and does a fast update (~35s) -- only copies new files and rebuilds the .exe, skipping Python/deps.

```
git pull
install.bat            # quick update (~35s)
install.bat --fresh    # full reinstall if needed
```

## Features

### Connection
- **Jump host support** -- SSH through a gateway to reach lab machines on internal networks
- **Separate user logins** -- different users for jump host (e.g. `faizh`) and target (e.g. `root`)
- **Connection history** -- remembers hosts, users, commands, and iDRAC credentials per connection
- **Connection profiles** -- save/load named profiles (e.g. "NDR730J B0 PDI") from a dropdown
- **Export/Import config** -- share a `.json` config file with teammates for identical setup

### Terminals
- **4 terminal sessions** -- SEC Minicom, NMC Minicom, APU UART, and XSDB (togglable)
- **XSDB toggle** -- switch between 3-pane (SEC/NMC + APU) and 4-quad layout via toolbar button
- **Live terminals** -- full interactive PTY via xterm.js (colors, special keys, 10K line scrollback)
- **Resizable panes** -- drag dividers between panes to resize
- **Terminal search** -- Ctrl+F to search scrollback, Enter/Shift+Enter for next/prev match
- **Font zoom** -- Ctrl+/- or toolbar buttons (8-24px range), Ctrl+0 to reset
- **Dark/Light theme** -- toggle in toolbar, preference persists across sessions
- **Reconnect per-pane** -- reconnect a single dropped session without affecting others
- **AMD logo watermark** -- faded AMD branding in each terminal pane background

### iDRAC Power Control
- **Power On / Power Off** -- control host power directly via iDRAC Redfish REST API
- **Power status indicator** -- real-time green/red dot showing host power state (polls every 15s)
- **SSH readiness indicator** -- green when target host SSH port is reachable, red during boot
- **SSH-ready notification** -- desktop notification when host becomes SSH-reachable after power on
- **iDRAC hostname display** -- shows system hostname from iDRAC alongside IP in toolbar
- **Credential persistence** -- iDRAC host, username, and password saved with connection history
- **Power macro buttons** -- Power Off (red) and Power On (green) in the macro bar

### Automation
- **Macro buttons** -- one-click command buttons grouped by pane in a toolbar bar
- **Dynamic PMC target** -- macros auto-select the PMC target via `targets -set -filter {name =~ "*PMC*"}` instead of hardcoded target numbers
- **Broadcast input** -- BCAST toggle sends keystrokes to all panes simultaneously
- **Watch patterns** -- comma-separated strings (e.g. `DONE, ERROR`); triggers desktop notification on match
- **Editable commands** -- modify startup commands for each terminal before connecting

### Operations
- **Session logging** -- auto-saves terminal output to timestamped log files in `logs/`
- **File upload** -- drag-and-drop SCP upload to the target machine through the jump host

## Default XSDB Macros

| Button | Command |
|---|---|
| Targets | `targets` |
| Reset System | `targets -set -filter {name =~ "*PMC*"}; rst -system; source run.tcl` |
| Program PDI | `targets -set -filter {name =~ "*PMC*"}; source run.tcl` |
| Load All FW | `ta 7; dow -f cmc_fw.elf; con; ta 4; dow -f nmc_fw.elf; con; ta 5; dow -f sec_fw.elf; con` |
| Load CMC | `ta 7; dow -f cmc_fw.elf; con` |
| Load NMC | `ta 4; dow -f nmc_fw.elf; con` |
| Load SEC | `ta 5; dow -f sec_fw.elf; con` |
| Full Flash | Reset + Program PDI + Load All FW in sequence |

## Complete Firmware Programming Workflow

```
1. Launch KSB_Flasher.exe
2. Enter connection details (or click a saved history/profile)
   - Jump host, target host, users
   - iDRAC host, user, password
3. Click Connect
4. Click "Power Off" (macro bar or toolbar) -- host powers down
5. Wait for power indicator to show OFF
6. Click "XSDB" toggle to show XSDB pane
7. Click "Program PDI" or "Full Flash" macro
8. Click "Power On" -- host boots
9. Watch SSH indicator go green + desktop notification
10. Monitor boot on SEC/NMC/APU UART panes
```

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Ctrl+F | Search terminal scrollback |
| Ctrl++ / Ctrl+- | Increase/decrease font size |
| Ctrl+0 | Reset font size to default |
| Enter (in search) | Next match |
| Shift+Enter (in search) | Previous match |
| Esc | Close search bar |

## Requirements

- Windows 10/11
- SSH key access to the jump host (`~/.ssh/id_rsa`)
- Network access to the jump host and iDRAC
