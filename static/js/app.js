/* ====================================================================
   KSB Flasher - Frontend Application
   ==================================================================== */

(() => {
  "use strict";

  // -- DOM refs --------------------------------------------------------

  const $ = (id) => document.getElementById(id);
  const $connectScreen = $("connect-screen");
  const $termScreen    = $("terminal-screen");
  const $jumpInput     = $("jump-input");
  const $hostInput     = $("host-input");
  const $jumpUserInput = $("jump-user-input");
  const $targetUserInput = $("target-user-input");
  const $passInput     = $("pass-input");
  const $connectBtn    = $("connect-btn");
  const $connectError  = $("connect-error");
  const $cmdToggle     = $("cmd-toggle");
  const $cmdEditor     = $("cmd-editor");
  const $cmdSec        = $("cmd-sec");
  const $cmdNmc        = $("cmd-nmc");
  const $cmdXsdb       = $("cmd-xsdb");
  const $historyList   = $("history-list");
  const $historyEmpty  = $("history-empty");
  const $toolbarHost   = $("toolbar-host");
  const $disconnectBtn = $("disconnect-btn");
  const $statusBar     = $("statusbar-text");
  const $macroBar      = $("macro-bar");
  const $loggingToggle = $("logging-toggle");
  const $loggingCheckbox = $("logging-checkbox");
  const $uploadBtn     = $("upload-btn");
  const $uploadOverlay = $("upload-overlay");
  const $uploadDrop    = $("upload-drop");
  const $uploadFileInput = $("upload-file-input");
  const $uploadRemoteDir = $("upload-remote-dir");
  const $uploadStatus  = $("upload-status");
  const $uploadCancel  = $("upload-cancel");
  const $uploadSend    = $("upload-send");
  const $profileSelect = $("profile-select");
  const $profileName   = $("profile-name-input");
  const $profileSave   = $("profile-save-btn");
  const $profileDel    = $("profile-del-btn");
  const $watchPatterns = $("watch-patterns");
  const $searchBar     = $("search-bar");
  const $searchInput   = $("search-input");
  const $searchPrev    = $("search-prev");
  const $searchNext    = $("search-next");
  const $searchClose   = $("search-close");
  const $searchPaneLabel = $("search-pane-label");

  // -- State -----------------------------------------------------------

  const TERMINAL_DEFS = ["sec", "nmc", "xsdb"];
  const TERMINAL_LABELS = { sec: "SEC", nmc: "NMC", xsdb: "XSDB" };

  const state = {
    connected: false,
    terminals: {},
    defaults: null,
    history: [],
    connParams: null,
    macros: {},
    uploadFiles: [],
    profiles: {},
    watchPatterns: [],
    focusedPane: "xsdb",
  };

  const XTERM_THEME = {
    background:  "#0a0e14", foreground:  "#c5cdd9",
    cursor:      "#00d4ff", cursorAccent:"#0a0e14",
    selectionBackground: "rgba(0, 212, 255, 0.18)",
    black:   "#1d2433", red:     "#ef4444", green:   "#10b981",
    yellow:  "#f59e0b", blue:    "#3b82f6", magenta: "#a855f7",
    cyan:    "#00d4ff", white:   "#c5cdd9",
    brightBlack: "#475569", brightRed:   "#f87171", brightGreen: "#34d399",
    brightYellow:"#fbbf24", brightBlue:  "#60a5fa", brightMagenta:"#c084fc",
    brightCyan:  "#67e8f9", brightWhite: "#f1f5f9",
  };

  const PROFILES_KEY = "ksb_flasher_profiles";

  // -- Init ------------------------------------------------------------

  async function init() {
    await loadDefaults();
    await loadHistory();
    loadProfiles();

    $cmdToggle.addEventListener("click", toggleCmdEditor);
    $connectBtn.addEventListener("click", handleConnect);
    $disconnectBtn.addEventListener("click", handleDisconnect);
    $hostInput.addEventListener("keydown", (e) => { if (e.key === "Enter") handleConnect(); });
    window.addEventListener("resize", fitAllTerminals);

    $loggingCheckbox.addEventListener("change", () => {
      $loggingToggle.classList.toggle("active", $loggingCheckbox.checked);
    });
    $loggingToggle.classList.toggle("active", $loggingCheckbox.checked);

    for (const name of TERMINAL_DEFS) {
      const btn = $(`reconnect-${name}`);
      if (btn) btn.addEventListener("click", () => reconnectPane(name));
    }

    // Upload
    $uploadBtn.addEventListener("click", () => {
      $uploadOverlay.classList.remove("hidden");
      $uploadStatus.textContent = ""; $uploadStatus.className = "upload-status";
      state.uploadFiles = [];
    });
    $uploadCancel.addEventListener("click", () => $uploadOverlay.classList.add("hidden"));
    $uploadDrop.addEventListener("click", () => $uploadFileInput.click());
    $uploadFileInput.addEventListener("change", (e) => {
      state.uploadFiles = Array.from(e.target.files);
      $uploadStatus.textContent = state.uploadFiles.map(f => f.name).join(", ");
      $uploadStatus.className = "upload-status";
    });
    $uploadDrop.addEventListener("dragover", (e) => { e.preventDefault(); $uploadDrop.classList.add("dragover"); });
    $uploadDrop.addEventListener("dragleave", () => $uploadDrop.classList.remove("dragover"));
    $uploadDrop.addEventListener("drop", (e) => {
      e.preventDefault(); $uploadDrop.classList.remove("dragover");
      state.uploadFiles = Array.from(e.dataTransfer.files);
      $uploadStatus.textContent = state.uploadFiles.map(f => f.name).join(", ");
      $uploadStatus.className = "upload-status";
    });
    $uploadSend.addEventListener("click", handleUpload);

    // Profiles
    $profileSelect.addEventListener("change", applyProfile);
    $profileSave.addEventListener("click", saveProfile);
    $profileDel.addEventListener("click", deleteProfile);

    // Search (Ctrl+F)
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f" && state.connected) {
        e.preventDefault();
        $searchBar.classList.remove("hidden");
        $searchInput.focus();
        $searchInput.select();
        updateSearchPaneLabel();
      }
      if (e.key === "Escape" && !$searchBar.classList.contains("hidden")) {
        $searchBar.classList.add("hidden");
      }
    });
    $searchInput.addEventListener("input", doSearch);
    $searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.shiftKey ? doSearchPrev() : doSearchNext(); }
      if (e.key === "Escape") $searchBar.classList.add("hidden");
    });
    $searchNext.addEventListener("click", doSearchNext);
    $searchPrev.addEventListener("click", doSearchPrev);
    $searchClose.addEventListener("click", () => $searchBar.classList.add("hidden"));

    // Track focused pane
    for (const name of TERMINAL_DEFS) {
      const el = $(`term-${name}`);
      if (el) el.addEventListener("focusin", () => { state.focusedPane = name; updateSearchPaneLabel(); });
    }

    // Resizable dividers
    initResizableDividers();

    // Request notification permission
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }

  // -- Profiles --------------------------------------------------------

  function loadProfiles() {
    try {
      state.profiles = JSON.parse(localStorage.getItem(PROFILES_KEY) || "{}");
    } catch { state.profiles = {}; }
    renderProfileDropdown();
  }

  function renderProfileDropdown() {
    const names = Object.keys(state.profiles).sort();
    $profileSelect.innerHTML = '<option value="">-- New Connection --</option>';
    for (const name of names) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      $profileSelect.appendChild(opt);
    }
  }

  function applyProfile() {
    const name = $profileSelect.value;
    if (!name || !state.profiles[name]) return;
    const p = state.profiles[name];
    $jumpInput.value = p.jumpHost || "";
    $hostInput.value = p.host || "";
    $jumpUserInput.value = p.jumpUser || "";
    $targetUserInput.value = p.targetUser || "";
    if (p.commands) {
      if (p.commands.sec)  $cmdSec.value  = p.commands.sec.join("\n");
      if (p.commands.nmc)  $cmdNmc.value  = p.commands.nmc.join("\n");
      if (p.commands.xsdb) $cmdXsdb.value = p.commands.xsdb.join("\n");
    }
    if (p.macros) state.macros = p.macros;
    if (p.watchPatterns) $watchPatterns.value = p.watchPatterns;
    $profileName.value = name;
  }

  function saveProfile() {
    const name = $profileName.value.trim();
    if (!name) return;
    state.profiles[name] = {
      host: $hostInput.value.trim(),
      jumpHost: $jumpInput.value.trim(),
      jumpUser: $jumpUserInput.value.trim(),
      targetUser: $targetUserInput.value.trim(),
      commands: {
        sec:  parseCommands($cmdSec.value),
        nmc:  parseCommands($cmdNmc.value),
        xsdb: parseCommands($cmdXsdb.value),
      },
      macros: state.macros,
      watchPatterns: $watchPatterns.value.trim(),
    };
    localStorage.setItem(PROFILES_KEY, JSON.stringify(state.profiles));
    renderProfileDropdown();
    $profileSelect.value = name;
  }

  function deleteProfile() {
    const name = $profileSelect.value || $profileName.value.trim();
    if (!name || !state.profiles[name]) return;
    delete state.profiles[name];
    localStorage.setItem(PROFILES_KEY, JSON.stringify(state.profiles));
    renderProfileDropdown();
    $profileName.value = "";
  }

  // -- Defaults & History ----------------------------------------------

  async function loadDefaults() {
    try {
      const resp = await fetch("/api/defaults");
      state.defaults = await resp.json();
    } catch { state.defaults = {}; }
    if (state.defaults._macros) state.macros = state.defaults._macros;
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
    try { state.history = await (await fetch("/api/history")).json(); }
    catch { state.history = []; }
    renderHistory();
  }

  function renderHistory() {
    $historyList.innerHTML = "";
    if (state.history.length === 0) { $historyEmpty.classList.add("visible"); return; }
    $historyEmpty.classList.remove("visible");

    state.history.forEach((entry, idx) => {
      const li = document.createElement("li");
      const jumpLabel = entry.jumpHost ? `${entry.jumpUser ? esc(entry.jumpUser) + "@" : ""}${esc(entry.jumpHost)} \u2192 ` : "";
      const targetLabel = `${entry.targetUser ? esc(entry.targetUser) + "@" : ""}${esc(entry.host)}`;
      li.innerHTML = `<div>${jumpLabel ? `<span class="history-user">${jumpLabel}</span>` : ""}<span class="history-host">${targetLabel}</span></div>
        <div class="history-meta"><span class="history-time">${relativeTime(entry.timestamp)}</span>
        <button class="history-delete" title="Remove"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="3" y1="3" x2="9" y2="9"/><line x1="9" y1="3" x2="3" y2="9"/></svg></button></div>`;

      li.addEventListener("click", (e) => {
        if (e.target.closest(".history-delete")) return;
        $jumpInput.value = entry.jumpHost || ""; $hostInput.value = entry.host;
        $jumpUserInput.value = entry.jumpUser || ""; $targetUserInput.value = entry.targetUser || "";
        if (entry.commands) {
          if (entry.commands.sec) $cmdSec.value = entry.commands.sec.join("\n");
          if (entry.commands.nmc) $cmdNmc.value = entry.commands.nmc.join("\n");
          if (entry.commands.xsdb) $cmdXsdb.value = entry.commands.xsdb.join("\n");
        }
        if (entry.macros) state.macros = entry.macros;
        $hostInput.focus();
      });

      li.querySelector(".history-delete").addEventListener("click", async (e) => {
        e.stopPropagation();
        try { state.history = await (await fetch(`/api/history/${idx}`, { method: "DELETE" })).json(); renderHistory(); } catch {}
      });
      $historyList.appendChild(li);
    });
  }

  function toggleCmdEditor() {
    $cmdEditor.classList.toggle("open");
    $cmdToggle.classList.toggle("open");
  }

  // -- Connect / Disconnect --------------------------------------------

  async function handleConnect() {
    const host = $hostInput.value.trim();
    if (!host) { $hostInput.focus(); return; }

    const jumpHost = $jumpInput.value.trim() || undefined;
    const jumpUser = $jumpUserInput.value.trim() || undefined;
    const targetUser = $targetUserInput.value.trim() || undefined;
    const password = $passInput.value || undefined;
    const commands = { sec: parseCommands($cmdSec.value), nmc: parseCommands($cmdNmc.value), xsdb: parseCommands($cmdXsdb.value) };

    state.watchPatterns = $watchPatterns.value.split(",").map(s => s.trim()).filter(Boolean);

    hideError(); setConnecting(true);

    try {
      const result = await (await fetch("/api/preflight", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, jumpUser, targetUser, password, jumpHost }),
      })).json();
      if (!result.ok) { showError(result.error); setConnecting(false); return; }
    } catch (err) { showError("Pre-flight failed: " + err.message); setConnecting(false); return; }

    state.connParams = { host, jumpHost, jumpUser, targetUser, password, commands };

    try {
      state.history = await (await fetch("/api/history", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, jumpUser, targetUser, jumpHost, commands, macros: state.macros }),
      })).json();
    } catch {}

    $connectScreen.classList.remove("active");
    $termScreen.classList.add("active");
    const via = jumpHost ? ` via ${jumpUser ? jumpUser + "@" : ""}${jumpHost}` : "";
    $toolbarHost.textContent = `${targetUser ? targetUser + "@" : ""}${host}${via}`;

    buildMacroBar();
    await createAllTerminals();
    connectAllTerminals();
    state.connected = true;
    setConnecting(false);
  }

  function handleDisconnect() {
    for (const name of TERMINAL_DEFS) {
      const t = state.terminals[name];
      if (t) { if (t.ws && t.ws.readyState <= WebSocket.OPEN) t.ws.close(); if (t.term) t.term.dispose(); }
    }
    state.terminals = {}; state.connected = false; state.connParams = null;
    $uploadOverlay.classList.add("hidden"); $searchBar.classList.add("hidden");
    $termScreen.classList.remove("active"); $connectScreen.classList.add("active");
    $statusBar.textContent = "Disconnected"; $macroBar.innerHTML = "";
    loadHistory();
  }

  // -- Macro bar -------------------------------------------------------

  function buildMacroBar() {
    $macroBar.innerHTML = "";
    for (const name of TERMINAL_DEFS) {
      const macros = state.macros[name];
      if (!macros || macros.length === 0) continue;
      const label = document.createElement("span");
      label.className = "macro-group-label"; label.textContent = TERMINAL_LABELS[name];
      $macroBar.appendChild(label);
      for (const m of macros) {
        const btn = document.createElement("button");
        btn.className = "macro-btn"; btn.textContent = m.label;
        btn.title = `Send to ${TERMINAL_LABELS[name]}`;
        btn.addEventListener("click", () => sendMacro(name, m.command));
        $macroBar.appendChild(btn);
      }
    }
  }

  function sendMacro(name, command) {
    const t = state.terminals[name];
    if (t && t.ws && t.ws.readyState === WebSocket.OPEN)
      t.ws.send(JSON.stringify({ type: "input", data: command }));
  }

  // -- Reconnect -------------------------------------------------------

  function reconnectPane(name) {
    if (!state.connParams) return;
    const t = state.terminals[name]; if (!t) return;
    if (t.ws && t.ws.readyState <= WebSocket.OPEN) t.ws.close();
    t.term.clear(); t.term.writeln("\x1b[33m[Reconnecting...]\x1b[0m");
    const { host, jumpHost, jumpUser, targetUser, password, commands } = state.connParams;
    connectTerminal(name, host, jumpUser, targetUser, password, jumpHost, commands[name]);
  }

  // -- File upload -----------------------------------------------------

  async function handleUpload() {
    if (state.uploadFiles.length === 0) { $uploadStatus.textContent = "No files selected"; $uploadStatus.className = "upload-status error"; return; }
    if (!state.connParams) return;
    const { host, jumpHost, jumpUser, targetUser, password } = state.connParams;
    const remoteDir = $uploadRemoteDir.value.trim() || "/tmp";
    for (const file of state.uploadFiles) {
      $uploadStatus.textContent = `Uploading ${file.name}...`; $uploadStatus.className = "upload-status";
      const form = new FormData();
      form.append("meta", JSON.stringify({ host, jumpHost, jumpUser, targetUser, password, remoteDir }));
      form.append("file", file);
      try {
        const result = await (await fetch("/api/upload", { method: "POST", body: form })).json();
        if (!result.ok) { $uploadStatus.textContent = `Failed: ${result.error}`; $uploadStatus.className = "upload-status error"; return; }
        $uploadStatus.textContent = `Uploaded to ${result.path}`; $uploadStatus.className = "upload-status success";
      } catch (err) { $uploadStatus.textContent = `Error: ${err.message}`; $uploadStatus.className = "upload-status error"; return; }
    }
  }

  // -- Terminal search (Ctrl+F) ----------------------------------------

  function updateSearchPaneLabel() {
    $searchPaneLabel.textContent = TERMINAL_LABELS[state.focusedPane] || "ALL";
  }

  function doSearch() {
    const q = $searchInput.value;
    for (const name of TERMINAL_DEFS) {
      const t = state.terminals[name];
      if (t && t.searchAddon) t.searchAddon.findNext(q);
    }
  }

  function doSearchNext() {
    const q = $searchInput.value;
    const t = state.terminals[state.focusedPane];
    if (t && t.searchAddon) t.searchAddon.findNext(q);
  }

  function doSearchPrev() {
    const q = $searchInput.value;
    const t = state.terminals[state.focusedPane];
    if (t && t.searchAddon) t.searchAddon.findPrevious(q);
  }

  // -- Notification on pattern match -----------------------------------

  let notifCooldown = {};

  function checkWatchPatterns(name, text) {
    if (state.watchPatterns.length === 0) return;
    if ("Notification" in window && Notification.permission !== "granted") return;
    const now = Date.now();
    for (const pat of state.watchPatterns) {
      if (text.includes(pat)) {
        const key = `${name}_${pat}`;
        if (notifCooldown[key] && now - notifCooldown[key] < 5000) continue;
        notifCooldown[key] = now;
        try {
          new Notification(`KSB Flasher - ${TERMINAL_LABELS[name]}`, {
            body: `Pattern matched: "${pat}"`,
            tag: key,
          });
        } catch {}
      }
    }
  }

  // -- Resizable dividers ----------------------------------------------

  function initResizableDividers() {
    const vDiv = document.querySelector(".terminal-layout > .pane-divider.vertical");
    const hDiv = document.querySelector(".left-column > .pane-divider.horizontal");
    const layout = document.querySelector(".terminal-layout");
    const leftCol = document.querySelector(".left-column");

    if (vDiv && layout) {
      let dragging = false;
      vDiv.addEventListener("mousedown", (e) => {
        e.preventDefault(); dragging = true; vDiv.classList.add("dragging");
        document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none";
      });
      document.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        const rect = layout.getBoundingClientRect();
        const pct = ((e.clientX - rect.left) / rect.width) * 100;
        const clamped = Math.max(20, Math.min(80, pct));
        leftCol.style.flex = `0 0 ${clamped}%`; leftCol.style.maxWidth = `${clamped}%`;
        const xsdbPane = document.querySelector(".pane-half");
        if (xsdbPane) { xsdbPane.style.flex = `0 0 ${100 - clamped}%`; xsdbPane.style.maxWidth = `${100 - clamped}%`; }
        fitAllTerminals();
      });
      document.addEventListener("mouseup", () => {
        if (!dragging) return;
        dragging = false; vDiv.classList.remove("dragging");
        document.body.style.cursor = ""; document.body.style.userSelect = "";
        fitAllTerminals();
      });
    }

    if (hDiv && leftCol) {
      let dragging = false;
      hDiv.addEventListener("mousedown", (e) => {
        e.preventDefault(); dragging = true; hDiv.classList.add("dragging");
        document.body.style.cursor = "row-resize"; document.body.style.userSelect = "none";
      });
      document.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        const rect = leftCol.getBoundingClientRect();
        const pct = ((e.clientY - rect.top) / rect.height) * 100;
        const clamped = Math.max(15, Math.min(85, pct));
        const panes = leftCol.querySelectorAll(".terminal-pane");
        if (panes.length >= 2) {
          panes[0].style.flex = `0 0 ${clamped}%`; panes[0].style.maxHeight = `${clamped}%`;
          panes[1].style.flex = `0 0 ${100 - clamped}%`; panes[1].style.maxHeight = `${100 - clamped}%`;
        }
        fitAllTerminals();
      });
      document.addEventListener("mouseup", () => {
        if (!dragging) return;
        dragging = false; hDiv.classList.remove("dragging");
        document.body.style.cursor = ""; document.body.style.userSelect = "";
        fitAllTerminals();
      });
    }
  }

  // -- Terminal creation -----------------------------------------------

  async function createAllTerminals() {
    for (const name of TERMINAL_DEFS) {
      if (state.terminals[name] && state.terminals[name].term) continue;
      const container = $(`term-${name}`);
      container.innerHTML = "";

      const term = new Terminal({
        theme: XTERM_THEME,
        fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", monospace',
        fontSize: 13, lineHeight: 1.35, cursorBlink: true, cursorStyle: "bar",
        scrollback: 10000, allowProposedApi: true,
      });

      const fitAddon = new FitAddon.FitAddon();
      term.loadAddon(fitAddon);
      try { term.loadAddon(new WebLinksAddon.WebLinksAddon()); } catch {}

      let searchAddon = null;
      try {
        searchAddon = new SearchAddon.SearchAddon();
        term.loadAddon(searchAddon);
      } catch {}

      term.open(container);
      fitAddon.fit();
      state.terminals[name] = { term, fitAddon, searchAddon, ws: null };
    }
  }

  function connectAllTerminals() {
    const { host, jumpHost, jumpUser, targetUser, password, commands } = state.connParams;
    connectTerminal("sec",  host, jumpUser, targetUser, password, jumpHost, commands.sec);
    connectTerminal("nmc",  host, jumpUser, targetUser, password, jumpHost, commands.nmc);
    connectTerminal("xsdb", host, jumpUser, targetUser, password, jumpHost, commands.xsdb);
    updateStatusBar();
  }

  function connectTerminal(name, host, jumpUser, targetUser, password, jumpHost, commands) {
    const t = state.terminals[name]; if (!t) return;
    const statusDot = $(`status-${name}`);
    statusDot.className = "status-dot connecting";

    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/ws/terminal`);
    t.ws = ws;

    const { term, fitAddon } = t;
    const dims = fitAddon.proposeDimensions();
    const cols = dims ? dims.cols : 120, rows = dims ? dims.rows : 40;
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: "init", host, jumpUser, targetUser, password, jumpHost,
        commands, cols, rows, sessionName: name, enableLogging: $loggingCheckbox.checked,
      }));
    };

    const textDecoder = new TextDecoder();

    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "status") {
            statusDot.className = `status-dot ${msg.status}`;
            if (msg.status === "error") term.writeln(`\r\n\x1b[31m[Error] ${msg.message}\x1b[0m`);
            updateStatusBar();
          }
        } catch {}
      } else {
        const bytes = new Uint8Array(event.data);
        term.write(bytes);
        if (state.watchPatterns.length > 0) {
          try { checkWatchPatterns(name, textDecoder.decode(bytes)); } catch {}
        }
      }
    };

    ws.onclose = () => { statusDot.className = "status-dot error"; term.writeln("\r\n\x1b[33m[Session closed]\x1b[0m"); updateStatusBar(); };
    ws.onerror = () => { statusDot.className = "status-dot error"; updateStatusBar(); };

    term.onData((data) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "input", data })); });
    term.onResize(({ cols, rows }) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "resize", cols, rows })); });
  }

  // -- Fit terminals on resize -----------------------------------------

  let fitDebounce = null;
  function fitAllTerminals() {
    clearTimeout(fitDebounce);
    fitDebounce = setTimeout(() => {
      for (const name of TERMINAL_DEFS) {
        const t = state.terminals[name];
        if (t && t.fitAddon) { try { t.fitAddon.fit(); } catch {} }
      }
    }, 80);
  }

  // -- Status bar ------------------------------------------------------

  function updateStatusBar() {
    const s = TERMINAL_DEFS.map(n => { const d = $(`status-${n}`); return d ? d.className.split(" ").pop() : "unknown"; });
    if (s.every(x => x === "connected"))     $statusBar.textContent = "All sessions connected";
    else if (s.some(x => x === "error"))     $statusBar.textContent = `${s.filter(x => x === "error").length} session(s) disconnected`;
    else if (s.some(x => x === "connecting")) $statusBar.textContent = "Connecting\u2026";
    else $statusBar.textContent = "Disconnected";
  }

  // -- Helpers ---------------------------------------------------------

  function parseCommands(text) { return text.split("\n").map(l => l.trimEnd()).filter(l => l.length > 0); }

  function setConnecting(busy) {
    $connectBtn.disabled = busy; $connectBtn.classList.toggle("connecting", busy);
    $connectBtn.innerHTML = busy ? "Connecting\u2026" : '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6,3 16,9 6,15"/></svg> Connect';
  }

  function showError(msg) { $connectError.textContent = msg; $connectError.classList.add("visible"); }
  function hideError()    { $connectError.classList.remove("visible"); $connectError.textContent = ""; }
  function esc(str) { const d = document.createElement("div"); d.textContent = str; return d.innerHTML; }

  function relativeTime(iso) {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000);
    if (m < 1) return "just now"; if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`; if (d < 30) return `${d}d ago`;
    return new Date(iso).toLocaleDateString();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
