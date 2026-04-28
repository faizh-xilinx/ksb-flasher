# KSB Flasher

A web-based multi-terminal application for programming firmware images on SmartNIC cards. Opens three SSH sessions to a remote lab machine through a jump host, all in a single window.

## Layout

```
+------------------+---------------------+
|  SEC Minicom     |                     |
+--  resizable  ---+                     |
|  NMC Minicom     |    XSDB Session     |
+--  resizable  ---+    (right half)     |
|  APU UART        |                     |
+------------------+---------------------+
```

## One-Click Install (Windows)

```
git clone https://github.com/faizh-xilinx/ksb-flasher.git
cd ksb-flasher
install.bat
```

The installer downloads a portable Python, installs dependencies, builds a standalone `KSB_Flasher.exe`, and creates a desktop shortcut. No admin rights needed.

### Updating

After pulling new changes, just run `install.bat` again. It auto-detects the existing installation and does a fast update (copies new files + rebuilds the .exe, skips Python/deps).

```
git pull
install.bat            # quick update (~35s)
install.bat --fresh    # full reinstall if needed
```

## Features

### Connection
- **Jump host support** -- SSH through a gateway to reach lab machines on internal networks
- **Separate user logins** -- different users for jump host (e.g. `faizh`) and target (e.g. `root`)
- **Connection history** -- remembers hosts, users, and customized commands per connection
- **Connection profiles** -- save/load named profiles (e.g. "NDR730J B0 PDI") from a dropdown
- **Export/Import config** -- share a `.json` config file with teammates

### Terminals
- **Live terminals** -- full interactive PTY via xterm.js (colors, special keys, scrollback)
- **Resizable panes** -- drag the dividers to resize SEC/NMC/XSDB panes
- **Terminal search** -- Ctrl+F to search scrollback, Enter/Shift+Enter for next/prev match
- **Font zoom** -- Ctrl+/- or toolbar buttons (8-24px), Ctrl+0 to reset
- **Dark/Light theme** -- toggle in toolbar, persists across sessions
- **Reconnect per-pane** -- reconnect a single dropped session without affecting others

### Automation
- **Macro buttons** -- one-click command buttons grouped by pane (XSDB: Reset System, Program PDI, Load All FW, etc.)
- **Dynamic PMC target** -- macros auto-select the PMC target via `targets -set -filter {name =~ "*PMC*"}` instead of hardcoded target numbers
- **Broadcast input** -- BCAST toggle sends keystrokes to all three panes simultaneously
- **Watch patterns** -- comma-separated strings (e.g. `DONE, ERROR`); triggers a desktop notification when matched
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

## Requirements

- Windows 10/11
- SSH key access to the jump host (`~/.ssh/id_rsa`)
- Network access to the jump host
