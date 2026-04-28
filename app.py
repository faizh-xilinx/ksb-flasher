#!/usr/bin/env python3
"""
KSB Flasher - SmartNIC Firmware Programming Terminal

A web-based multi-terminal application for programming firmware
images on SmartNIC cards via SSH.
"""

import asyncio
import json
import os
import sys
import webbrowser
from pathlib import Path
from datetime import datetime, timezone

from aiohttp import web, WSMsgType
import asyncssh


def _base_dir():
    """Resolve base directory whether running as script or frozen .exe."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)
    return Path(__file__).parent


def _data_dir():
    """Writable directory next to the .exe (or project root in dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent
    return Path(__file__).parent


def _find_client_keys():
    """Return list of SSH private key paths found in ~/.ssh/."""
    ssh_dir = Path.home() / ".ssh"
    candidates = ["id_rsa", "id_ed25519", "id_ecdsa"]
    return [str(ssh_dir / k) for k in candidates if (ssh_dir / k).exists()]


STATIC_DIR = _base_dir() / "static"
HISTORY_FILE = _data_dir() / "connection_history.json"
PORT = 8765

DEFAULT_JUMP_HOST = "xndengvm004116"
DEFAULT_USERNAME = os.environ.get("USER") or os.environ.get("USERNAME") or ""
DEFAULT_TARGET_USERNAME = "root"

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
    """SSH into the jump host using local keys."""
    kw = {"host": jump_host, "known_hosts": None}
    client_keys = _find_client_keys()
    if client_keys:
        kw["client_keys"] = client_keys
    if username:
        kw["username"] = username
    if password:
        kw["password"] = password
    return await asyncssh.connect(**kw)


# ---------------------------------------------------------------------------
# REST API handlers
# ---------------------------------------------------------------------------

async def index_handler(request):
    return web.FileResponse(STATIC_DIR / "index.html")


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
    })


async def preflight_check(request):
    """Quick SSH connect/disconnect to validate the first hop (jump host
    or target) is reachable.  Target reachability through the jump host
    is verified by the terminal sessions themselves."""
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
            status=200,
        )
    except OSError as exc:
        return web.json_response(
            {"ok": False, "error": f"Cannot reach '{first_hop}': {exc}"},
            status=200,
        )
    except asyncssh.Error as exc:
        return web.json_response(
            {"ok": False, "error": f"SSH error on '{first_hop}': {exc}"},
            status=200,
        )
    except Exception as exc:
        return web.json_response(
            {"ok": False, "error": str(exc)},
            status=200,
        )
    finally:
        if conn:
            conn.close()


# ---------------------------------------------------------------------------
# WebSocket ↔ SSH bridge
# ---------------------------------------------------------------------------

async def ws_terminal(request):
    ws = web.WebSocketResponse(max_msg_size=4 * 1024 * 1024)
    await ws.prepare(request)

    conn = None
    process = None
    reader_task = None

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

        await ws.send_str(json.dumps({"type": "status", "status": "connecting"}))

        # Connect to the first hop (jump host, or target directly)
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

        # Open a PTY shell. If we have a jump host, chain SSH to the target.
        shell_cmd = None
        if jump_host:
            user_flag = f"-l {target_user} " if target_user else ""
            shell_cmd = f"ssh -o StrictHostKeyChecking=no -tt {user_flag}{host}"

        process = await conn.create_process(
            shell_cmd,
            term_type="xterm-256color",
            term_size=(cols, rows),
            encoding=None,
        )

        await ws.send_str(json.dumps({"type": "status", "status": "connected"}))

        # Forward SSH stdout → WebSocket (binary)
        async def _reader():
            try:
                while not process.stdout.at_eof():
                    data = await process.stdout.read(65536)
                    if data and not ws.closed:
                        await ws.send_bytes(data)
            except (asyncssh.Error, ConnectionError, OSError):
                pass
            finally:
                if not ws.closed:
                    await ws.send_str(json.dumps({
                        "type": "status", "status": "disconnected",
                    }))

        reader_task = asyncio.create_task(_reader())

        # Wait for shell (and chained SSH) to be ready, then send commands
        if commands:
            initial_delay = 2.0 if jump_host else 0.5
            await asyncio.sleep(initial_delay)
            for cmd in commands:
                if process.stdin:
                    process.stdin.write(cmd.encode("utf-8") + b"\n")
                await asyncio.sleep(command_delay)

        # Forward WebSocket → SSH stdin
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

    return ws


# ---------------------------------------------------------------------------
# Application setup
# ---------------------------------------------------------------------------

def create_app():
    app = web.Application()

    app.router.add_get("/", index_handler)
    app.router.add_get("/api/history", get_history)
    app.router.add_post("/api/history", post_history)
    app.router.add_delete("/api/history/{idx}", delete_history_entry)
    app.router.add_get("/api/defaults", get_defaults)
    app.router.add_post("/api/preflight", preflight_check)
    app.router.add_get("/ws/terminal", ws_terminal)

    app.router.add_static("/static", STATIC_DIR)
    return app


def main():
    print(f"\n  KSB Flasher starting → http://localhost:{PORT}\n")
    webbrowser.open(f"http://localhost:{PORT}")

    app = create_app()

    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    web.run_app(app, host="127.0.0.1", port=PORT, print=None)


if __name__ == "__main__":
    main()
