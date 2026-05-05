# KSB Flasher

A web-based multi-terminal application for programming firmware images on AMD SmartNIC cards. Manages SSH sessions, iDRAC power control, and host operations -- all in a single window.

## Quick Start (No Installation)

```
git clone https://github.com/faizh-xilinx/ksb-flasher.git
```

Then run `release\KSB_Flasher.exe` -- that's it. No Python, no build, no admin rights.

The pre-built `.exe` is included in the `release/` folder of the repo. Just clone and double-click.

### Build from Source (for developers)

```
git clone https://github.com/faizh-xilinx/ksb-flasher.git
cd ksb-flasher
install.bat            # first time: downloads Python + deps + builds .exe
install.bat            # subsequent: quick update (~35s)
install.bat --fresh    # full reinstall from scratch
```

## Layout

**Main grid (always visible):**
```
+------------------+---------------------+
|  SEC Minicom     |                     |
|                  |    APU UART         |
+--  resizable  ---+                     |
|  NMC Minicom     |                     |
+------------------+---------------------+
```

**Floating windows (togglable, draggable, resizable):**
- **XSDB** -- toggle in toolbar, floating window for XSDB/firmware operations
- **Host SSH** -- toggle in toolbar, floating window for host machine SSH

## Features

### Lab Host Database
- **CSV-based host database** (`ksb_hosts.csv`) -- all lab hosts pre-configured
- **Dropdown selector** -- select a host from the list, all fields auto-fill
- **No manual entry** -- host, partner, iDRAC IP all come from the CSV
- Only user-specific fields (jump host, username, passwords) need to be entered once

### Connection
- **Jump host support** -- SSH through a gateway to reach lab machines
- **Separate user logins** -- different users for jump host and target
- **Connection history** -- remembers all settings per connection
- **Connection profiles** -- save/load named profiles from a dropdown
- **Export/Import config** -- share JSON config files with teammates

### Terminal Sessions
- **5 terminal sessions** -- SEC Minicom, NMC Minicom, APU UART, XSDB (togglable), Host SSH (floating)
- **XSDB** -- floating, draggable, resizable window for firmware operations
- **Host SSH** -- floating, draggable, resizable window for host operations
- **Live terminals** -- full interactive PTY via xterm.js (colors, special keys, 10K scrollback)
- **Resizable panes** -- drag dividers between panes
- **Terminal search** -- Ctrl+F to search scrollback
- **Font zoom** -- Ctrl+/- (8-24px range), Ctrl+0 to reset
- **Dark/Light theme** -- toggle in toolbar, persists across sessions
- **Reconnect per-pane** -- reconnect individual dropped sessions
- **AMD logo watermark** -- faded AMD branding in each terminal pane

### iDRAC Power Control
- **Power On / Power Off** -- via iDRAC Redfish REST API
- **Power status indicator** -- real-time green/red dot (polls every 15s)
- **Host readiness indicator** -- pings host IP to detect when it's up after power cycle
- **Boot notification** -- desktop alert when host responds to ping after power on
- **iDRAC hostname display** -- shows system hostname from Redfish in toolbar
- **KVM button** -- opens iDRAC web UI for virtual console
- **Card Power button** -- opens card power server URL, shows port number
- **Credential persistence** -- iDRAC credentials saved (base64 obfuscated)

### Automation
- **Macro buttons** -- one-click command buttons grouped by pane
- **Dynamic PMC target** -- auto-selects PMC via `targets -set -filter {name =~ "*PMC*"}`
- **JTAG auto-detect** -- Auto-Detect button parses `targets` output
- **Broadcast input** -- BCAST toggle sends keystrokes to all panes
- **Watch patterns** -- desktop notification on pattern match (e.g. DONE, ERROR)
- **Flash progress** -- status bar shows percentage from XSDB output
- **Editable commands** -- modify startup commands before connecting

### Operations
- **Session logging** -- auto-saves to timestamped log files with periodic timestamps
- **Log pruning** -- auto-deletes oldest logs when total exceeds 2MB (FIFO)
- **Log viewer** -- browse and read saved logs from the UI
- **File upload** -- drag-and-drop SCP to target machine
- **System info** -- query iDRAC for BIOS version, model, serial number
- **Tab close protection** -- confirmation dialog prevents accidental session loss

## Default XSDB Macros

| Button | Command |
|---|---|
| Targets | `targets` |
| Auto-Detect | Enumerates JTAG targets, shows in status bar |
| Reset System | `targets -set -filter {name =~ "*PMC*"}; rst -system; source run.tcl` |
| Program PDI | `targets -set -filter {name =~ "*PMC*"}; source run.tcl` |
| Load All FW | `ta 7; dow -f cmc_fw.elf; con; ta 4; dow -f nmc_fw.elf; con; ta 5; dow -f sec_fw.elf; con` |
| Load CMC | `ta 7; dow -f cmc_fw.elf; con` |
| Load NMC | `ta 4; dow -f nmc_fw.elf; con` |
| Load SEC | `ta 5; dow -f sec_fw.elf; con` |
| Full Flash | Reset + Program PDI + Load All FW in sequence |
| Power Off | iDRAC ForceOff (in POWER group) |
| Power On | iDRAC On (in POWER group) |

## Complete Firmware Programming Workflow

```
1. Launch KSB_Flasher.exe (or double-click desktop shortcut)
2. Select lab host from dropdown (auto-fills everything)
3. Enter jump host, username, iDRAC credentials
4. Click Connect
5. Click "Power Off" to power down the host
6. Wait for HOST indicator to go red
7. Toggle XSDB on, click "Full Flash" or individual macros
8. Click "Power On" to boot
9. Watch HOST indicator go green + desktop notification
10. Monitor boot on SEC/NMC/APU UART panes
11. Toggle HOST SSH for host operations
12. Use Card Pwr button for SmartNIC card power management
```

## Lab Host Database

Edit `ksb_hosts.csv` to add/modify lab hosts:

```csv
s_no,host_name,host_idrac_ip,partner_machine,partner_machine_idrac_ip,card_power_server,card_power_port
1,ndr7515b.xndlab.xilinx.com,10.170.92.61,ndr730j.xndlab.xilinx.com,10.170.92.25,http://10.170.92.65/...,1
```

| Column | Description |
|---|---|
| host_name | The machine controlled by iDRAC (has the SmartNIC card) |
| host_idrac_ip | iDRAC IP for power control and system info |
| partner_machine | The machine you SSH to for minicom/xsdb |
| partner_machine_idrac_ip | Partner's iDRAC (informational) |
| card_power_server | URL for the NMC/APC power outlet controller |
| card_power_port | Which outlet port controls the SmartNIC card |

After editing the CSV, run `install.bat` to rebuild the `.exe` with the updated hosts.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Ctrl+F | Search terminal scrollback |
| Ctrl++ / Ctrl+- | Increase/decrease font size |
| Ctrl+0 | Reset font size to default |
| Enter (in search) | Next match |
| Shift+Enter | Previous match |
| Esc | Close search bar |

## Requirements

- Windows 10/11 (64-bit)
- SSH key access to the jump host (`~/.ssh/id_rsa`)
- Network access to the jump host and iDRAC
- Internet access (first install only, for downloading Python + deps)

## Project Structure

```
ksb-flasher/
  app.py              # Python backend (aiohttp + asyncssh + Redfish)
  install.bat          # Windows installer/updater
  ksb_flasher.spec     # PyInstaller build spec
  ksb_hosts.csv        # Lab host database
  requirements.txt     # Python dependencies
  static/
    index.html         # Main UI
    css/style.css       # Styles (dark/light theme)
    js/app.js           # Frontend logic
    amd-logo.png        # AMD watermark
```
