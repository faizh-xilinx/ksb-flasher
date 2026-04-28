/* ====================================================================
   KSB Flasher – Frontend Application
   ==================================================================== */

(() => {
  "use strict";

  // ── DOM refs ─────────────────────────────────────────────────────

  const $connectScreen = document.getElementById("connect-screen");
  const $termScreen    = document.getElementById("terminal-screen");
  const $jumpInput     = document.getElementById("jump-input");
  const $hostInput     = document.getElementById("host-input");
  const $jumpUserInput = document.getElementById("jump-user-input");
  const $targetUserInput = document.getElementById("target-user-input");
  const $passInput     = document.getElementById("pass-input");
  const $connectBtn    = document.getElementById("connect-btn");
  const $connectError  = document.getElementById("connect-error");
  const $cmdToggle     = document.getElementById("cmd-toggle");
  const $cmdEditor     = document.getElementById("cmd-editor");
  const $cmdSec        = document.getElementById("cmd-sec");
  const $cmdNmc        = document.getElementById("cmd-nmc");
  const $cmdXsdb       = document.getElementById("cmd-xsdb");
  const $historyList   = document.getElementById("history-list");
  const $historyEmpty  = document.getElementById("history-empty");
  const $toolbarHost   = document.getElementById("toolbar-host");
  const $disconnectBtn = document.getElementById("disconnect-btn");
  const $statusBar     = document.getElementById("statusbar-text");

  // ── State ────────────────────────────────────────────────────────

  const TERMINAL_DEFS = ["sec", "nmc", "xsdb"];

  const state = {
    connected: false,
    terminals: {},   // { sec: { term, fitAddon, ws }, ... }
    defaults: null,
    history: [],
  };

  // xterm.js theme matching our dark UI
  const XTERM_THEME = {
    background:  "#0a0e14",
    foreground:  "#c5cdd9",
    cursor:      "#00d4ff",
    cursorAccent:"#0a0e14",
    selectionBackground: "rgba(0, 212, 255, 0.18)",
    black:       "#1d2433",
    red:         "#ef4444",
    green:       "#10b981",
    yellow:      "#f59e0b",
    blue:        "#3b82f6",
    magenta:     "#a855f7",
    cyan:        "#00d4ff",
    white:       "#c5cdd9",
    brightBlack: "#475569",
    brightRed:   "#f87171",
    brightGreen: "#34d399",
    brightYellow:"#fbbf24",
    brightBlue:  "#60a5fa",
    brightMagenta:"#c084fc",
    brightCyan:  "#67e8f9",
    brightWhite: "#f1f5f9",
  };

  // ── Init ─────────────────────────────────────────────────────────

  async function init() {
    await loadDefaults();
    await loadHistory();

    $cmdToggle.addEventListener("click", toggleCmdEditor);
    $connectBtn.addEventListener("click", handleConnect);
    $disconnectBtn.addEventListener("click", handleDisconnect);

    $hostInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleConnect();
    });

    window.addEventListener("resize", fitAllTerminals);
  }

  // ── Defaults & History ───────────────────────────────────────────

  async function loadDefaults() {
    try {
      const resp = await fetch("/api/defaults");
      state.defaults = await resp.json();
    } catch {
      state.defaults = {};
    }
    populateCommandEditor();
  }

  function populateCommandEditor() {
    const d = state.defaults;
    if (d.sec_minicom)  $cmdSec.value  = d.sec_minicom.commands.join("\n");
    if (d.nmc_minicom)  $cmdNmc.value  = d.nmc_minicom.commands.join("\n");
    if (d.xsdb)         $cmdXsdb.value = d.xsdb.commands.join("\n");
    if (d._jumpHost && !$jumpInput.value) $jumpInput.value = d._jumpHost;
    if (d._username && !$jumpUserInput.value) $jumpUserInput.value = d._username;
    if (d._targetUsername && !$targetUserInput.value) $targetUserInput.value = d._targetUsername;
  }

  async function loadHistory() {
    try {
      const resp = await fetch("/api/history");
      state.history = await resp.json();
    } catch {
      state.history = [];
    }
    renderHistory();
  }

  function renderHistory() {
    $historyList.innerHTML = "";
    if (state.history.length === 0) {
      $historyEmpty.classList.add("visible");
      return;
    }
    $historyEmpty.classList.remove("visible");

    state.history.forEach((entry, idx) => {
      const li = document.createElement("li");
      const jumpLabel = entry.jumpHost
        ? `${entry.jumpUser ? esc(entry.jumpUser) + "@" : ""}${esc(entry.jumpHost)} → `
        : "";
      const targetLabel = `${entry.targetUser ? esc(entry.targetUser) + "@" : ""}${esc(entry.host)}`;
      li.innerHTML = `
        <div>
          ${jumpLabel ? `<span class="history-user">${jumpLabel}</span>` : ""}
          <span class="history-host">${targetLabel}</span>
        </div>
        <div class="history-meta">
          <span class="history-time">${relativeTime(entry.timestamp)}</span>
          <button class="history-delete" title="Remove" data-idx="${idx}">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="3" y1="3" x2="9" y2="9"/><line x1="9" y1="3" x2="3" y2="9"/></svg>
          </button>
        </div>`;

      li.addEventListener("click", (e) => {
        if (e.target.closest(".history-delete")) return;
        $jumpInput.value = entry.jumpHost || "";
        $hostInput.value = entry.host;
        $jumpUserInput.value = entry.jumpUser || "";
        $targetUserInput.value = entry.targetUser || "";
        if (entry.commands) {
          if (entry.commands.sec)  $cmdSec.value  = entry.commands.sec.join("\n");
          if (entry.commands.nmc)  $cmdNmc.value  = entry.commands.nmc.join("\n");
          if (entry.commands.xsdb) $cmdXsdb.value = entry.commands.xsdb.join("\n");
        }
        $hostInput.focus();
      });

      const delBtn = li.querySelector(".history-delete");
      delBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          const resp = await fetch(`/api/history/${idx}`, { method: "DELETE" });
          state.history = await resp.json();
          renderHistory();
        } catch { /* ignore */ }
      });

      $historyList.appendChild(li);
    });
  }

  // ── Command editor toggle ────────────────────────────────────────

  function toggleCmdEditor() {
    const isOpen = $cmdEditor.classList.toggle("open");
    $cmdToggle.classList.toggle("open", isOpen);
  }

  // ── Connect / Disconnect ─────────────────────────────────────────

  async function handleConnect() {
    const host = $hostInput.value.trim();
    if (!host) {
      $hostInput.focus();
      return;
    }

    const jumpHost = $jumpInput.value.trim() || undefined;
    const jumpUser = $jumpUserInput.value.trim() || undefined;
    const targetUser = $targetUserInput.value.trim() || undefined;
    const password = $passInput.value || undefined;
    const commands = {
      sec:  parseCommands($cmdSec.value),
      nmc:  parseCommands($cmdNmc.value),
      xsdb: parseCommands($cmdXsdb.value),
    };

    hideError();
    setConnecting(true);

    // Pre-flight: verify SSH reachability before opening terminals
    try {
      const check = await fetch("/api/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, jumpUser, targetUser, password, jumpHost }),
      });
      const result = await check.json();
      if (!result.ok) {
        showError(result.error);
        setConnecting(false);
        return;
      }
    } catch (err) {
      showError("Pre-flight check failed: " + err.message);
      setConnecting(false);
      return;
    }

    // Save to history (only after successful preflight)
    try {
      const resp = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, jumpUser, targetUser, jumpHost, commands }),
      });
      state.history = await resp.json();
    } catch { /* non-critical */ }

    // Switch to terminal screen
    $connectScreen.classList.remove("active");
    $termScreen.classList.add("active");
    const via = jumpHost ? ` via ${jumpUser ? jumpUser + "@" : ""}${jumpHost}` : "";
    $toolbarHost.textContent = `${targetUser ? targetUser + "@" : ""}${host}${via}`;

    // Create terminals and connect
    await createAllTerminals();
    connectAllTerminals(host, jumpUser, targetUser, password, jumpHost, commands);

    state.connected = true;
    setConnecting(false);
  }

  function handleDisconnect() {
    for (const name of TERMINAL_DEFS) {
      const t = state.terminals[name];
      if (t) {
        if (t.ws && t.ws.readyState <= WebSocket.OPEN) t.ws.close();
        if (t.term) t.term.dispose();
      }
    }
    state.terminals = {};
    state.connected = false;

    $termScreen.classList.remove("active");
    $connectScreen.classList.add("active");
    $statusBar.textContent = "Disconnected";
    loadHistory();
  }

  // ── Terminal creation ────────────────────────────────────────────

  async function createAllTerminals() {
    for (const name of TERMINAL_DEFS) {
      const container = document.getElementById(`term-${name}`);
      container.innerHTML = "";

      const term = new Terminal({
        theme: XTERM_THEME,
        fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", monospace',
        fontSize: 13,
        lineHeight: 1.35,
        cursorBlink: true,
        cursorStyle: "bar",
        scrollback: 10000,
        allowProposedApi: true,
      });

      const fitAddon = new FitAddon.FitAddon();
      term.loadAddon(fitAddon);

      try {
        const webLinksAddon = new WebLinksAddon.WebLinksAddon();
        term.loadAddon(webLinksAddon);
      } catch { /* optional */ }

      term.open(container);
      fitAddon.fit();

      state.terminals[name] = { term, fitAddon, ws: null };
    }
  }

  function connectAllTerminals(host, jumpUser, targetUser, password, jumpHost, commands) {
    connectTerminal("sec",  host, jumpUser, targetUser, password, jumpHost, commands.sec);
    connectTerminal("nmc",  host, jumpUser, targetUser, password, jumpHost, commands.nmc);
    connectTerminal("xsdb", host, jumpUser, targetUser, password, jumpHost, commands.xsdb);
    updateStatusBar();
  }

  function connectTerminal(name, host, jumpUser, targetUser, password, jumpHost, commands) {
    const t = state.terminals[name];
    if (!t) return;

    const statusDot = document.getElementById(`status-${name}`);
    statusDot.className = "status-dot connecting";

    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/ws/terminal`);
    t.ws = ws;

    const { term, fitAddon } = t;
    const dims = fitAddon.proposeDimensions();
    const cols = dims ? dims.cols : 120;
    const rows = dims ? dims.rows : 40;

    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: "init",
        host, jumpUser, targetUser, password, jumpHost, commands, cols, rows,
      }));
    };

    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "status") {
            statusDot.className = `status-dot ${msg.status}`;
            if (msg.status === "error") {
              term.writeln(`\r\n\x1b[31m[Error] ${msg.message}\x1b[0m`);
            }
            updateStatusBar();
          }
        } catch { /* not JSON – treat as text */ }
      } else {
        term.write(new Uint8Array(event.data));
      }
    };

    ws.onclose = () => {
      statusDot.className = "status-dot error";
      term.writeln("\r\n\x1b[33m[Session closed]\x1b[0m");
      updateStatusBar();
    };

    ws.onerror = () => {
      statusDot.className = "status-dot error";
      updateStatusBar();
    };

    // Forward keyboard input to SSH via WebSocket
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    // Handle terminal resize
    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    });
  }

  // ── Fit terminals on window resize ───────────────────────────────

  let fitDebounce = null;

  function fitAllTerminals() {
    clearTimeout(fitDebounce);
    fitDebounce = setTimeout(() => {
      for (const name of TERMINAL_DEFS) {
        const t = state.terminals[name];
        if (t && t.fitAddon) {
          try { t.fitAddon.fit(); } catch { /* ignore */ }
        }
      }
    }, 100);
  }

  // ── Status bar ───────────────────────────────────────────────────

  function updateStatusBar() {
    const statuses = TERMINAL_DEFS.map((name) => {
      const dot = document.getElementById(`status-${name}`);
      return dot ? dot.className.split(" ").pop() : "unknown";
    });

    const allConnected = statuses.every((s) => s === "connected");
    const anyError     = statuses.some((s) => s === "error");
    const anyConnecting = statuses.some((s) => s === "connecting");

    if (allConnected) {
      $statusBar.textContent = "All sessions connected";
    } else if (anyError) {
      const errCount = statuses.filter((s) => s === "error").length;
      $statusBar.textContent = `${errCount} session(s) disconnected`;
    } else if (anyConnecting) {
      $statusBar.textContent = "Connecting…";
    } else {
      $statusBar.textContent = "Disconnected";
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────

  function parseCommands(text) {
    return text
      .split("\n")
      .map((l) => l.trimEnd())
      .filter((l) => l.length > 0);
  }

  function setConnecting(busy) {
    $connectBtn.disabled = busy;
    $connectBtn.classList.toggle("connecting", busy);
    $connectBtn.innerHTML = busy
      ? "Connecting…"
      : `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6,3 16,9 6,15"/></svg> Connect`;
  }

  function showError(msg) {
    $connectError.textContent = msg;
    $connectError.classList.add("visible");
  }

  function hideError() {
    $connectError.classList.remove("visible");
    $connectError.textContent = "";
  }

  function esc(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function relativeTime(isoString) {
    if (!isoString) return "";
    const diff = Date.now() - new Date(isoString).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);

    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 30) return `${days}d ago`;
    return new Date(isoString).toLocaleDateString();
  }

  // ── Boot ─────────────────────────────────────────────────────────

  document.addEventListener("DOMContentLoaded", init);
})();
