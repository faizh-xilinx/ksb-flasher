#!/usr/bin/env python3
"""
KSB Flasher - SmartNIC Firmware Programming Terminal

A web-based multi-terminal application for programming firmware
images on SmartNIC cards via SSH.
"""

import asyncio
import csv
import json
import os
import sys
import webbrowser
from pathlib import Path
from datetime import datetime, timezone

import ssl

import aiohttp as aiohttp_client
from aiohttp import web, WSMsgType
import asyncssh


def _base_dir():
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)
    return Path(__file__).parent


def _data_dir():
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent
    return Path(__file__).parent


def _find_client_keys():
    ssh_dir = Path.home() / ".ssh"
    keys = []
    if ssh_dir.exists():
        for f in ssh_dir.iterdir():
            if f.is_file() and not f.suffix and f.name.startswith("id_"):
                keys.append(str(f))
            elif f.suffix == ".pem":
                keys.append(str(f))
    return keys


STATIC_DIR = _base_dir() / "static"
HISTORY_FILE = _data_dir() / "connection_history.json"
HOSTS_CSV = _base_dir() / "ksb_hosts.csv"
LOGS_DIR = _data_dir() / "logs"
PORT = 8765

DEFAULT_JUMP_HOST = "xndengvm004116"
DEFAULT_USERNAME = os.environ.get("USER") or os.environ.get("USERNAME") or ""
DEFAULT_TARGET_USERNAME = "root"

DEFAULT_MACROS = {
    "sec": [
        {"label": "Ctrl+A X (Exit)", "command": "\x01x"},
    ],
    "nmc": [
        {"label": "Ctrl+A X (Exit)", "command": "\x01x"},
    ],
    "apu": [
        {"label": "Ctrl+A X (Exit)", "command": "\x01x"},
    ],
    "xsdb": [
        {"label": "Targets", "command": "targets\n"},
        {"label": "Auto-Detect", "command": "puts \"KSB_DETECT_START\"; foreach t [targets -target-properties] { puts \"KSB_T:[dict get $t target_id]:[dict get $t name]\" }; puts \"KSB_DETECT_END\"\n"},
        {"label": "Reset System", "command": "targets -set -filter {name =~ \"*PMC*\"}; rst -system; source run.tcl\n"},
        {"label": "Program PDI", "command": "targets -set -filter {name =~ \"*PMC*\"}; source run.tcl\n"},
        {"label": "Load All FW", "command": "ta 7; dow -f cmc_fw.elf; con; ta 4; dow -f nmc_fw.elf; con; ta 5; dow -f sec_fw.elf; con\n"},
        {"label": "Load CMC", "command": "ta 7; dow -f cmc_fw.elf; con\n"},
        {"label": "Load NMC", "command": "ta 4; dow -f nmc_fw.elf; con\n"},
        {"label": "Load SEC", "command": "ta 5; dow -f sec_fw.elf; con\n"},
        {"label": "Full Flash", "command": "targets -set -filter {name =~ \"*PMC*\"}; rst -system; source run.tcl; targets -set -filter {name =~ \"*PMC*\"}; source run.tcl; ta 7; dow -f cmc_fw.elf; con; ta 4; dow -f nmc_fw.elf; con; ta 5; dow -f sec_fw.elf; con\n"},
    ],
}

DEFAULT_TERMINALS = {
    "sec_minicom": {
        "label": "SEC Minicom",
        "commands": [
            "sudo su",
            "minicom -D /dev/tty_ndr7515b_sec -b 115200",
        ],
    },
    "nmc_minicom": {
        "label": "NMC Minicom",
        "commands": [
            "sudo su",
            "minicom -D /dev/tty_ndr7515b_nmc -b 115200",
        ],
    },
    "apu_uart": {
        "label": "APU UART",
        "commands": [
            "sudo su",
            "minicom -D /dev/tty_ndr7515b_apu -b 115200",
        ],
    },
    "xsdb": {
        "label": "XSDB",
        "commands": [
            "sudo su",
            "cd /root/faizh/ksb_fw/single_host/b0_pdi",
            "source /proj/smartnic/xir/tools/smartnic_fw_env_2024.2_1123.sh",
            'xsdb -eval "connect -url TCP:$HOSTNAME:22022" -interactive',
        ],
    },
}


# ---------------------------------------------------------------------------
# Connection history persistence
# ---------------------------------------------------------------------------

def load_history():
    if HISTORY_FILE.exists():
        try:
            with open(HISTORY_FILE, encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return []
    return []


def save_history(history):
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(history, f, indent=2)


def add_to_history(entry):
    history = load_history()
    history = [
        h for h in history
        if not (h["host"] == entry["host"]
                and h.get("username") == entry.get("username")
                and h.get("jumpHost") == entry.get("jumpHost"))
    ]
    history.insert(0, {
        **entry,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    history = history[:20]
    save_history(history)
    return history


# ---------------------------------------------------------------------------
# SSH helpers
# ---------------------------------------------------------------------------

async def _connect_jump(jump_host, username=None, password=None):
    kw = {"host": jump_host, "known_hosts": None, "agent_forwarding": True}
    client_keys = _find_client_keys()
    if client_keys:
        kw["client_keys"] = client_keys
    if username:
        kw["username"] = username
    if password:
        kw["password"] = password
    try:
        return await asyncssh.connect(**kw)
    except asyncssh.PermissionDenied:
        # Retry without explicit keys (let asyncssh try agent + defaults)
        kw2 = {"host": jump_host, "known_hosts": None, "agent_forwarding": True}
        if username:
            kw2["username"] = username
        if password:
            kw2["password"] = password
        return await asyncssh.connect(**kw2)


# ---------------------------------------------------------------------------
# Session logging
# ---------------------------------------------------------------------------

MAX_LOGS_SIZE = 2 * 1024 * 1024  # 2 MB


def _prune_logs():
    """Delete oldest logs in FIFO order when total size exceeds MAX_LOGS_SIZE."""
    if not LOGS_DIR.exists():
        return
    logs = sorted(LOGS_DIR.glob("*.log"), key=lambda f: f.stat().st_mtime)
    total = sum(f.stat().st_size for f in logs)
    while total > MAX_LOGS_SIZE and logs:
        oldest = logs.pop(0)
        total -= oldest.stat().st_size
        oldest.unlink(missing_ok=True)


def _open_log(session_name, host):
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    _prune_logs()
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_host = host.replace(".", "_").replace("/", "_")
    path = LOGS_DIR / f"{ts}_{safe_host}_{session_name}.log"
    f = open(path, "wb")
    header = f"=== KSB Flasher Log ===\nSession: {session_name}\nHost: {host}\nStarted: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n{'=' * 40}\n\n"
    f.write(header.encode("utf-8"))
    return f


# ---------------------------------------------------------------------------
# Log viewer
# ---------------------------------------------------------------------------

async def list_logs(request):
    if not LOGS_DIR.exists():
        return web.json_response([])
    logs = []
    for f in sorted(LOGS_DIR.glob("*.log"), reverse=True)[:50]:
        logs.append({"name": f.name, "size": f.stat().st_size, "modified": f.stat().st_mtime})
    return web.json_response(logs)


async def read_log(request):
    name = request.match_info["name"]
    path = LOGS_DIR / name
    if not path.exists() or not path.is_file():
        return web.json_response({"error": "Log not found"}, status=404)
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
        if len(text) > 500000:
            text = text[-500000:]
        return web.json_response({"name": name, "content": text})
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


# ---------------------------------------------------------------------------
# Firmware version info
# ---------------------------------------------------------------------------

async def fw_version_info(request):
    body = await request.json()
    host = body.get("idracHost", "")
    user = body.get("idracUser", "root")
    pw = body.get("idracPass", "")
    if not host:
        return web.json_response({"ok": False})
    try:
        status, data = await _idrac_request("GET", host, REDFISH_SYSTEM, user, pw)
        info = {
            "biosVersion": data.get("BiosVersion", ""),
            "model": data.get("Model", ""),
            "manufacturer": data.get("Manufacturer", ""),
            "serialNumber": data.get("SerialNumber", ""),
            "hostName": data.get("HostName", ""),
        }
        return web.json_response({"ok": True, **info})
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)})


# ---------------------------------------------------------------------------
# Lab hosts database
# ---------------------------------------------------------------------------

def load_lab_hosts():
    if not HOSTS_CSV.exists():
        return []
    hosts = []
    try:
        with open(HOSTS_CSV, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                hosts.append(row)
    except Exception:
        pass
    return hosts


# ---------------------------------------------------------------------------
# REST API handlers
# ---------------------------------------------------------------------------

async def index_handler(request):
    return web.FileResponse(STATIC_DIR / "index.html")


async def get_lab_hosts(request):
    return web.json_response(load_lab_hosts())


async def get_history(request):
    return web.json_response(load_history())


async def post_history(request):
    data = await request.json()
    history = add_to_history(data)
    return web.json_response(history)


async def delete_history_entry(request):
    idx = int(request.match_info["idx"])
    history = load_history()
    if 0 <= idx < len(history):
        history.pop(idx)
        save_history(history)
    return web.json_response(history)


async def get_defaults(request):
    return web.json_response({
        **DEFAULT_TERMINALS,
        "_jumpHost": DEFAULT_JUMP_HOST,
        "_username": DEFAULT_USERNAME,
        "_targetUsername": DEFAULT_TARGET_USERNAME,
        "_macros": DEFAULT_MACROS,
    })


async def preflight_check(request):
    data = await request.json()
    host = data.get("host", "")
    jump_user = data.get("jumpUser") or None
    target_user = data.get("targetUser") or None
    password = data.get("password") or None
    jump_host = data.get("jumpHost") or None

    first_hop = jump_host or host
    first_user = jump_user if jump_host else target_user
    conn = None
    try:
        conn = await asyncio.wait_for(
            _connect_jump(first_hop, first_user, password), timeout=15
        )
        return web.json_response({"ok": True})
    except asyncio.TimeoutError:
        return web.json_response(
            {"ok": False, "error": f"Connection to '{first_hop}' timed out. Check hostname and network."},
        )
    except OSError as exc:
        return web.json_response({"ok": False, "error": f"Cannot reach '{first_hop}': {exc}"})
    except asyncssh.Error as exc:
        return web.json_response({"ok": False, "error": f"SSH error on '{first_hop}': {exc}"})
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)})
    finally:
        if conn:
            conn.close()


async def upload_file(request):
    """SCP a file to the target machine through the jump host."""
    reader = await request.multipart()
    meta_field = await reader.next()  # JSON metadata
    meta = json.loads(await meta_field.text())
    file_field = await reader.next()  # file data
    filename = file_field.filename
    file_data = await file_field.read(decode=False)

    host = meta.get("host", "")
    jump_user = meta.get("jumpUser") or None
    target_user = meta.get("targetUser") or None
    password = meta.get("password") or None
    jump_host = meta.get("jumpHost") or None
    remote_dir = meta.get("remoteDir", "/tmp")

    conn = None
    try:
        first_hop = jump_host or host
        first_user = jump_user if jump_host else target_user
        conn = await asyncio.wait_for(
            _connect_jump(first_hop, first_user, password), timeout=20
        )

        if jump_host:
            user_flag = f"{target_user}@" if target_user else ""
            remote_path = f"{remote_dir}/{filename}"

            tmp_path = f"/tmp/_ksb_upload_{filename}"
            async with conn.start_sftp_client() as sftp:
                async with sftp.open(tmp_path, "wb") as f:
                    await f.write(file_data)

            result = await conn.run(
                f"scp -o StrictHostKeyChecking=no {tmp_path} {user_flag}{host}:{remote_path}; rm -f {tmp_path}",
                check=False,
            )
            if result.exit_status != 0:
                return web.json_response(
                    {"ok": False, "error": f"SCP failed: {result.stderr.strip()}"}
                )
        else:
            remote_path = f"{remote_dir}/{filename}"
            async with conn.start_sftp_client() as sftp:
                async with sftp.open(remote_path, "wb") as f:
                    await f.write(file_data)

        return web.json_response({"ok": True, "path": f"{remote_dir}/{filename}"})
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)})
    finally:
        if conn:
            conn.close()


# ---------------------------------------------------------------------------
# SSH readiness check
# ---------------------------------------------------------------------------

async def ssh_ready_check(request):
    """Check if host is reachable (ping) via jump host.
    Uses hostIp if provided, otherwise falls back to host."""
    data = await request.json()
    host_ip = data.get("hostIp") or data.get("host", "")
    jump_user = data.get("jumpUser") or None
    jump_host = data.get("jumpHost") or None
    password = data.get("password") or None

    if not host_ip:
        return web.json_response({"ready": False})

    conn = None
    try:
        if jump_host:
            conn = await asyncio.wait_for(
                _connect_jump(jump_host, jump_user, password), timeout=10
            )
            result = await asyncio.wait_for(
                conn.run(
                    f"ping -c1 -W2 {host_ip} >/dev/null 2>&1 && echo READY || echo NOPE",
                    check=False,
                ),
                timeout=8,
            )
            ready = "READY" in (result.stdout or "")
        else:
            conn = await asyncio.wait_for(
                _connect_jump(host_ip, jump_user, password), timeout=8
            )
            ready = True
    except Exception:
        ready = False
    finally:
        if conn:
            conn.close()

    return web.json_response({"ready": ready})


# ---------------------------------------------------------------------------
# iDRAC Redfish power control
# ---------------------------------------------------------------------------

_IDRAC_SSL = ssl.create_default_context()
_IDRAC_SSL.check_hostname = False
_IDRAC_SSL.verify_mode = ssl.CERT_NONE

REDFISH_SYSTEM = "/redfish/v1/Systems/System.Embedded.1"
REDFISH_RESET = REDFISH_SYSTEM + "/Actions/ComputerSystem.Reset"


async def _idrac_request(method, idrac_host, path, idrac_user, idrac_pass, json_body=None):
    url = f"https://{idrac_host}{path}"
    auth = aiohttp_client.BasicAuth(idrac_user, idrac_pass)
    async with aiohttp_client.ClientSession(auth=auth, connector=aiohttp_client.TCPConnector(ssl=_IDRAC_SSL)) as sess:
        async with sess.request(method, url, json=json_body, timeout=aiohttp_client.ClientTimeout(total=15)) as resp:
            text = await resp.text()
            try:
                data = json.loads(text)
            except json.JSONDecodeError:
                data = {}
            return resp.status, data


async def idrac_status(request):
    body = await request.json()
    host = body.get("idracHost", "")
    user = body.get("idracUser", "root")
    pw = body.get("idracPass", "")
    if not host:
        return web.json_response({"ok": False, "error": "No iDRAC host configured"})
    try:
        status, data = await _idrac_request("GET", host, REDFISH_SYSTEM, user, pw)
        power = data.get("PowerState", "Unknown")
        hostname = data.get("HostName", "")
        return web.json_response({"ok": True, "power": power, "hostname": hostname})
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)})


async def idrac_poweron(request):
    body = await request.json()
    host = body.get("idracHost", "")
    user = body.get("idracUser", "root")
    pw = body.get("idracPass", "")
    if not host:
        return web.json_response({"ok": False, "error": "No iDRAC host configured"})
    try:
        status, data = await _idrac_request(
            "POST", host, REDFISH_RESET, user, pw, {"ResetType": "On"}
        )
        if status in (200, 204):
            return web.json_response({"ok": True, "message": "Power On sent"})
        return web.json_response({"ok": False, "error": data.get("error", {}).get("message", f"HTTP {status}")})
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)})


async def idrac_poweroff(request):
    body = await request.json()
    host = body.get("idracHost", "")
    user = body.get("idracUser", "root")
    pw = body.get("idracPass", "")
    if not host:
        return web.json_response({"ok": False, "error": "No iDRAC host configured"})
    try:
        status, data = await _idrac_request(
            "POST", host, REDFISH_RESET, user, pw, {"ResetType": "ForceOff"}
        )
        if status in (200, 204):
            return web.json_response({"ok": True, "message": "Power Off sent"})
        return web.json_response({"ok": False, "error": data.get("error", {}).get("message", f"HTTP {status}")})
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)})


# ---------------------------------------------------------------------------
# WebSocket - SSH bridge
# ---------------------------------------------------------------------------

async def ws_terminal(request):
    ws = web.WebSocketResponse(max_msg_size=4 * 1024 * 1024)
    await ws.prepare(request)

    conn = None
    process = None
    reader_task = None
    log_file = None

    try:
        init_msg = await ws.receive()
        if init_msg.type != WSMsgType.TEXT:
            return ws

        init = json.loads(init_msg.data)
        host = init["host"]
        jump_user = init.get("jumpUser") or None
        target_user = init.get("targetUser") or None
        password = init.get("password") or None
        jump_host = init.get("jumpHost") or None
        commands = init.get("commands", [])
        cols = init.get("cols", 120)
        rows = init.get("rows", 40)
        command_delay = init.get("commandDelay", 0.8)
        session_name = init.get("sessionName", "unknown")
        enable_logging = init.get("enableLogging", True)

        if enable_logging:
            try:
                log_file = _open_log(session_name, host)
            except OSError:
                pass

        await ws.send_str(json.dumps({"type": "status", "status": "connecting"}))

        first_hop = jump_host or host
        first_user = jump_user if jump_host else target_user
        try:
            conn = await asyncio.wait_for(
                _connect_jump(first_hop, first_user, password), timeout=20
            )
        except asyncio.TimeoutError:
            await ws.send_str(json.dumps({
                "type": "status", "status": "error",
                "message": f"SSH to '{first_hop}' timed out",
            }))
            return ws
        except (asyncssh.Error, OSError) as exc:
            await ws.send_str(json.dumps({
                "type": "status", "status": "error",
                "message": f"SSH to '{first_hop}' failed: {exc}",
            }))
            return ws

        stay_on_jump = init.get("stayOnJumpHost", False)
        shell_cmd = None
        if jump_host and not stay_on_jump:
            user_flag = f"-l {target_user} " if target_user else ""
            shell_cmd = f"ssh -o StrictHostKeyChecking=no -tt {user_flag}{host}"

        process = await conn.create_process(
            shell_cmd,
            term_type="xterm-256color",
            term_size=(cols, rows),
            encoding=None,
        )

        await ws.send_str(json.dumps({"type": "status", "status": "connected"}))

        last_ts = [0.0]

        async def _reader():
            try:
                while not process.stdout.at_eof():
                    data = await process.stdout.read(65536)
                    if data and not ws.closed:
                        await ws.send_bytes(data)
                        if log_file:
                            now = asyncio.get_event_loop().time()
                            if now - last_ts[0] > 30:
                                ts_line = f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}]\n"
                                log_file.write(ts_line.encode("utf-8"))
                                last_ts[0] = now
                            log_file.write(data)
            except (asyncssh.Error, ConnectionError, OSError):
                pass
            finally:
                if not ws.closed:
                    await ws.send_str(json.dumps({
                        "type": "status", "status": "disconnected",
                    }))

        reader_task = asyncio.create_task(_reader())

        if commands:
            initial_delay = 2.0 if jump_host else 0.5
            await asyncio.sleep(initial_delay)
            for cmd in commands:
                if process.stdin:
                    process.stdin.write(cmd.encode("utf-8") + b"\n")
                await asyncio.sleep(command_delay)

        async for msg in ws:
            if msg.type == WSMsgType.TEXT:
                payload = json.loads(msg.data)
                kind = payload.get("type")
                if kind == "input":
                    process.stdin.write(payload["data"].encode("utf-8"))
                elif kind == "resize":
                    process.change_terminal_size(payload["cols"], payload["rows"])
            elif msg.type == WSMsgType.BINARY:
                process.stdin.write(msg.data)
            elif msg.type in (WSMsgType.ERROR, WSMsgType.CLOSE):
                break

    except Exception as exc:
        if not ws.closed:
            await ws.send_str(json.dumps({
                "type": "status", "status": "error",
                "message": str(exc),
            }))
    finally:
        if reader_task:
            reader_task.cancel()
            try:
                await reader_task
            except asyncio.CancelledError:
                pass
        if process:
            process.close()
        if conn:
            conn.close()
        if log_file:
            log_file.close()

    return ws


# ---------------------------------------------------------------------------
# Application setup
# ---------------------------------------------------------------------------

def create_app():
    app = web.Application(client_max_size=100 * 1024 * 1024)

    app.router.add_get("/", index_handler)
    app.router.add_get("/api/history", get_history)
    app.router.add_post("/api/history", post_history)
    app.router.add_delete("/api/history/{idx}", delete_history_entry)
    app.router.add_get("/api/defaults", get_defaults)
    app.router.add_get("/api/lab-hosts", get_lab_hosts)
    app.router.add_post("/api/preflight", preflight_check)
    app.router.add_post("/api/upload", upload_file)
    app.router.add_post("/api/ssh-ready", ssh_ready_check)
    app.router.add_get("/api/logs", list_logs)
    app.router.add_get("/api/logs/{name}", read_log)
    app.router.add_post("/api/fw-version", fw_version_info)
    app.router.add_post("/api/idrac/status", idrac_status)
    app.router.add_post("/api/idrac/poweron", idrac_poweron)
    app.router.add_post("/api/idrac/poweroff", idrac_poweroff)
    app.router.add_get("/ws/terminal", ws_terminal)

    app.router.add_static("/static", STATIC_DIR)
    return app


def main():
    print(f"\n  KSB Flasher starting -> http://localhost:{PORT}\n")
    webbrowser.open(f"http://localhost:{PORT}")

    app = create_app()

    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    web.run_app(app, host="127.0.0.1", port=PORT, print=None)


if __name__ == "__main__":
    main()
