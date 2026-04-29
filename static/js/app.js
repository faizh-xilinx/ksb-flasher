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
  const $cmdApu        = $("cmd-apu");
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
  const $themeToggle   = $("theme-toggle-btn");
  const $fontUp        = $("font-up");
  const $fontDown      = $("font-down");
  const $fontSizeLabel = $("font-size-label");
  const $xsdbToggle    = $("xsdb-toggle");
  const $xsdbCheckbox  = $("xsdb-checkbox");
  const $terminalGrid  = $("terminal-grid");
  const $broadcastToggle = $("broadcast-toggle");
  const $broadcastCheckbox = $("broadcast-checkbox");
  const $exportBtn     = $("export-config-btn");
  const $importBtn     = $("import-config-btn");
  const $importFile    = $("import-config-file");
  const $idracHost     = $("idrac-host-input");
  const $idracUser     = $("idrac-user-input");
  const $idracPass     = $("idrac-pass-input");
  const $powerDot      = $("power-dot");
  const $powerLabel    = $("power-label");
  const $powerOffBtn   = $("power-off-btn");
  const $powerOnBtn    = $("power-on-btn");
  const $sshDot        = $("ssh-dot");
  const $sshLabel      = $("ssh-label");
  const $logsBtn       = $("logs-btn");
  const $logsOverlay   = $("logs-overlay");
  const $logSelect     = $("log-select");
  const $logContent    = $("log-content");
  const $logsClose     = $("logs-close");
  const $fwInfoBtn     = $("fw-info-btn");
  const $fwInfoOverlay = $("fw-info-overlay");
  const $fwInfoContent = $("fw-info-content");
  const $fwInfoClose   = $("fw-info-close");
  const $openKvmBtn    = $("open-kvm-btn");

  // -- State -----------------------------------------------------------

  const TERMINAL_DEFS = ["sec", "nmc", "apu", "xsdb"];
  const TERMINAL_LABELS = { sec: "SEC", nmc: "NMC", apu: "APU", xsdb: "XSDB" };

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
    fontSize: 13,
    lightTheme: false,
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

  const XTERM_THEME_LIGHT = {
    background:  "#ffffff", foreground:  "#1e293b",
    cursor:      "#0078c8", cursorAccent:"#ffffff",
    selectionBackground: "rgba(0, 120, 200, 0.18)",
    black:   "#e2e8f0", red:     "#dc2626", green:   "#059669",
    yellow:  "#d97706", blue:    "#2563eb", magenta: "#7c3aed",
    cyan:    "#0078c8", white:   "#1e293b",
    brightBlack: "#94a3b8", brightRed:   "#ef4444", brightGreen: "#10b981",
    brightYellow:"#f59e0b", brightBlue:  "#3b82f6", brightMagenta:"#a855f7",
    brightCyan:  "#0ea5e9", brightWhite: "#0f172a",
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
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    // Resizable grid dividers
    initGridResize();

    // Theme toggle
    if (localStorage.getItem("ksb_theme") === "light") toggleTheme(true);
    $themeToggle.addEventListener("click", () => toggleTheme());

    // Font size (Ctrl+/-)
    $fontUp.addEventListener("click", () => changeFontSize(1));
    $fontDown.addEventListener("click", () => changeFontSize(-1));
    document.addEventListener("keydown", (e) => {
      if (!state.connected) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) { e.preventDefault(); changeFontSize(1); }
      if ((e.ctrlKey || e.metaKey) && e.key === "-") { e.preventDefault(); changeFontSize(-1); }
      if ((e.ctrlKey || e.metaKey) && e.key === "0") { e.preventDefault(); changeFontSize(0); }
    });

    // XSDB pane toggle (switches between 3-pane and 4-quad layout)
    $xsdbCheckbox.addEventListener("change", () => {
      const on = $xsdbCheckbox.checked;
      $xsdbToggle.classList.toggle("active", on);
      $terminalGrid.classList.toggle("quad-mode", on);
      document.querySelectorAll(".xsdb-element").forEach(el => el.classList.toggle("hidden", !on));
      fitAllTerminals();
    });

    // Open iDRAC KVM
    $openKvmBtn.addEventListener("click", () => {
      const ih = state.connParams && state.connParams.idracHost;
      if (ih) window.open(`https://${ih}`, "_blank");
      else alert("No iDRAC host configured");
    });

    // Broadcast toggle
    $broadcastCheckbox.addEventListener("change", () => {
      $broadcastToggle.classList.toggle("active", $broadcastCheckbox.checked);
    });

    // Export / Import config
    $exportBtn.addEventListener("click", exportConfig);
    $importBtn.addEventListener("click", () => $importFile.click());
    $importFile.addEventListener("change", importConfig);

    // iDRAC power control
    $powerOffBtn.addEventListener("click", handlePowerOff);
    $powerOnBtn.addEventListener("click", handlePowerOn);

    // Log viewer
    $logsBtn.addEventListener("click", openLogViewer);
    $logsClose.addEventListener("click", () => $logsOverlay.classList.add("hidden"));
    $logSelect.addEventListener("change", loadSelectedLog);

    // FW Info
    $fwInfoBtn.addEventListener("click", openFwInfo);
    $fwInfoClose.addEventListener("click", () => $fwInfoOverlay.classList.add("hidden"));

    // Tab close protection
    window.addEventListener("beforeunload", (e) => {
      if (state.connected) { e.preventDefault(); e.returnValue = ""; }
    });
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
      if (p.commands.apu)  $cmdApu.value  = p.commands.apu.join("\n");
      if (p.commands.xsdb) $cmdXsdb.value = p.commands.xsdb.join("\n");
    }
    if (p.macros) state.macros = p.macros;
    if (p.watchPatterns) $watchPatterns.value = p.watchPatterns;
    if (p.idracHost) $idracHost.value = p.idracHost;
    if (p.idracUser) $idracUser.value = p.idracUser;
    if (p.idracPass) $idracPass.value = deobfuscate(p.idracPass);
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
        apu:  parseCommands($cmdApu.value),
        xsdb: parseCommands($cmdXsdb.value),
      },
      macros: state.macros,
      watchPatterns: $watchPatterns.value.trim(),
      idracHost: $idracHost.value.trim(),
      idracUser: $idracUser.value.trim(),
      idracPass: obfuscate($idracPass.value),
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
    if (d.apu_uart)     $cmdApu.value  = d.apu_uart.commands.join("\n");
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
          if (entry.commands.apu) $cmdApu.value = entry.commands.apu.join("\n");
          if (entry.commands.xsdb) $cmdXsdb.value = entry.commands.xsdb.join("\n");
        }
        if (entry.macros) state.macros = entry.macros;
        if (entry.idracHost) $idracHost.value = entry.idracHost;
        if (entry.idracUser) $idracUser.value = entry.idracUser;
        if (entry.idracPass) $idracPass.value = deobfuscate(entry.idracPass);
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
    const commands = { sec: parseCommands($cmdSec.value), nmc: parseCommands($cmdNmc.value), apu: parseCommands($cmdApu.value), xsdb: parseCommands($cmdXsdb.value) };

    state.watchPatterns = $watchPatterns.value.split(",").map(s => s.trim()).filter(Boolean);

    hideError(); setConnecting(true, "Verifying jump host...");

    try {
      const result = await (await fetch("/api/preflight", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, jumpUser, targetUser, password, jumpHost }),
      })).json();
      if (!result.ok) { showError(result.error); setConnecting(false); return; }
    } catch (err) { showError("Pre-flight failed: " + err.message); setConnecting(false); return; }

    setConnecting(true, "Opening SSH sessions...");

    const idracHost = $idracHost.value.trim();
    const idracUser = $idracUser.value.trim() || "root";
    const idracPass = $idracPass.value;

    state.connParams = { host, jumpHost, jumpUser, targetUser, password, commands, idracHost, idracUser, idracPass };

    try {
      state.history = await (await fetch("/api/history", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, jumpUser, targetUser, jumpHost, commands, macros: state.macros, idracHost, idracUser, idracPass: obfuscate(idracPass) }),
      })).json();
    } catch {}

    $connectScreen.classList.remove("active");
    $termScreen.classList.add("active");
    const via = jumpHost ? ` via ${jumpUser ? jumpUser + "@" : ""}${jumpHost}` : "";
    const idracLabel = idracHost ? ` | iDRAC: ${idracHost}` : "";
    $toolbarHost.textContent = `${targetUser ? targetUser + "@" : ""}${host}${via}${idracLabel}`;

    buildMacroBar();
    await createAllTerminals();
    connectAllTerminals();
    state.connected = true;
    setConnecting(false);
    if (idracHost && idracHost.length > 0) pollPowerStatus();
  }

  function handleDisconnect() {
    for (const name of TERMINAL_DEFS) {
      const t = state.terminals[name];
      if (t) { if (t.ws && t.ws.readyState <= WebSocket.OPEN) t.ws.close(); if (t.term) t.term.dispose(); }
    }
    state.terminals = {}; state.connected = false; state.connParams = null;
    clearInterval(powerPollTimer);
    clearInterval(sshReadyTimer);
    $uploadOverlay.classList.add("hidden"); $searchBar.classList.add("hidden");
    $termScreen.classList.remove("active"); $connectScreen.classList.add("active");
    $statusBar.textContent = "Disconnected"; $macroBar.innerHTML = "";
    loadHistory();
  }

  // -- Macro bar -------------------------------------------------------

  function buildMacroBar() {
    $macroBar.innerHTML = "";

    if (state.connParams && state.connParams.idracHost) {
      const label = document.createElement("span");
      label.className = "macro-group-label"; label.textContent = "POWER";
      $macroBar.appendChild(label);

      const offBtn = document.createElement("button");
      offBtn.className = "macro-btn macro-btn-danger"; offBtn.textContent = "Power Off";
      offBtn.title = "Power off host via iDRAC";
      offBtn.addEventListener("click", handlePowerOff);
      $macroBar.appendChild(offBtn);

      const onBtn = document.createElement("button");
      onBtn.className = "macro-btn macro-btn-success"; onBtn.textContent = "Power On";
      onBtn.title = "Power on host via iDRAC";
      onBtn.addEventListener("click", handlePowerOn);
      $macroBar.appendChild(onBtn);
    }

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

  // -- Resizable grid dividers -----------------------------------------

  function initGridResize() {
    const grid = $("terminal-grid");
    const divV  = $("div-v");
    const divH1 = $("div-h1");
    const divH2 = $("div-h2");

    let colPct = 50, rowPct = 50;

    function applyGrid() {
      grid.style.gridTemplateColumns = `${colPct}fr 5px ${100 - colPct}fr`;
      grid.style.gridTemplateRows    = `${rowPct}fr 5px ${100 - rowPct}fr`;
      fitAllTerminals();
    }

    function setupDrag(el, axis) {
      if (!el) return;
      let dragging = false;
      el.addEventListener("mousedown", (e) => {
        e.preventDefault(); dragging = true; el.classList.add("dragging");
        document.body.style.cursor = axis === "col" ? "col-resize" : "row-resize";
        document.body.style.userSelect = "none";
      });
      document.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        const rect = grid.getBoundingClientRect();
        if (axis === "col") {
          colPct = Math.max(15, Math.min(85, ((e.clientX - rect.left) / rect.width) * 100));
        } else {
          rowPct = Math.max(15, Math.min(85, ((e.clientY - rect.top) / rect.height) * 100));
        }
        applyGrid();
      });
      document.addEventListener("mouseup", () => {
        if (!dragging) return;
        dragging = false; el.classList.remove("dragging");
        document.body.style.cursor = ""; document.body.style.userSelect = "";
        fitAllTerminals();
      });
    }

    setupDrag(divV, "col");
    setupDrag(divH1, "row");
    setupDrag(divH2, "row");
  }

  // -- Terminal creation -----------------------------------------------

  async function createAllTerminals() {
    for (const name of TERMINAL_DEFS) {
      if (state.terminals[name] && state.terminals[name].term) continue;
      const container = $(`term-${name}`);
      container.innerHTML = "";

      const term = new Terminal({
        theme: state.lightTheme ? XTERM_THEME_LIGHT : XTERM_THEME,
        fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", monospace',
        fontSize: state.fontSize, lineHeight: 1.35, cursorBlink: true, cursorStyle: "bar",
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
    connectTerminal("apu",  host, jumpUser, targetUser, password, jumpHost, commands.apu);
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
        stayOnJumpHost: name === "console",
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
        const text = textDecoder.decode(bytes);
        if (name === "xsdb") checkFlashProgress(text);
        if (state.watchPatterns.length > 0) {
          try { checkWatchPatterns(name, text); } catch {}
        }
      }
    };

    ws.onclose = () => { statusDot.className = "status-dot error"; term.writeln("\r\n\x1b[33m[Session closed]\x1b[0m"); updateStatusBar(); };
    ws.onerror = () => { statusDot.className = "status-dot error"; updateStatusBar(); };

    term.onData((data) => {
      if ($broadcastCheckbox.checked) {
        for (const n of TERMINAL_DEFS) {
          const s = state.terminals[n];
          if (s && s.ws && s.ws.readyState === WebSocket.OPEN)
            s.ws.send(JSON.stringify({ type: "input", data }));
        }
      } else {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "input", data }));
      }
    });
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

  function setConnecting(busy, msg) {
    $connectBtn.disabled = busy; $connectBtn.classList.toggle("connecting", busy);
    $connectBtn.innerHTML = busy ? (msg || "Connecting\u2026") : '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6,3 16,9 6,15"/></svg> Connect';
  }

  // -- iDRAC power control ---------------------------------------------

  let powerPollTimer = null;

  function getIdracParams() {
    if (!state.connParams) return null;
    const { idracHost, idracUser, idracPass } = state.connParams;
    if (!idracHost) return null;
    return { idracHost, idracUser: idracUser || "root", idracPass: idracPass || "" };
  }

  async function pollPowerStatus() {
    clearInterval(powerPollTimer);
    await fetchPowerStatus();
    await fetchSshStatus();
    powerPollTimer = setInterval(() => { fetchPowerStatus(); fetchSshStatus(); }, 15000);
  }

  async function fetchPowerStatus() {
    const p = getIdracParams();
    if (!p) { setPowerDisplay("unknown"); return; }
    try {
      const result = await (await fetch("/api/idrac/status", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      })).json();
      if (result.ok) {
        setPowerDisplay(result.power);
        if (result.hostname) {
          const cur = $toolbarHost.textContent;
          const tag = `iDRAC: ${state.connParams.idracHost}`;
          if (cur.includes(tag) && !cur.includes(result.hostname)) {
            $toolbarHost.textContent = cur.replace(tag, `iDRAC: ${result.hostname} (${state.connParams.idracHost})`);
          }
        }
      } else setPowerDisplay("error");
    } catch { setPowerDisplay("error"); }
  }

  function setPowerDisplay(power) {
    $powerDot.className = "power-dot";
    if (power === "On") { $powerDot.classList.add("on"); $powerLabel.textContent = "ON"; }
    else if (power === "Off") { $powerDot.classList.add("off"); $powerLabel.textContent = "OFF"; }
    else { $powerLabel.textContent = "PWR?"; }
  }

  async function fetchSshStatus() {
    if (!state.connParams) { setSshDisplay(false); return; }
    const { host, jumpHost, jumpUser, password } = state.connParams;
    try {
      const result = await (await fetch("/api/ssh-ready", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, jumpHost, jumpUser, password }),
      })).json();
      setSshDisplay(result.ready);
    } catch { setSshDisplay(false); }
  }

  function setSshDisplay(ready) {
    $sshDot.className = "power-dot " + (ready ? "on" : "off");
    $sshLabel.textContent = ready ? "HOST" : "HOST?";
  }

  async function handlePowerOff() {
    const p = getIdracParams();
    if (!p) return;
    if (!confirm("Power OFF the host via iDRAC?")) return;
    $powerOffBtn.disabled = true;
    try {
      const result = await (await fetch("/api/idrac/poweroff", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      })).json();
      if (!result.ok) alert("Power Off failed: " + result.error);
      setSshDisplay(false);
      setTimeout(fetchPowerStatus, 3000);
    } catch (err) { alert("Power Off error: " + err.message); }
    finally { $powerOffBtn.disabled = false; }
  }

  async function handlePowerOn() {
    const p = getIdracParams();
    if (!p) return;
    $powerOnBtn.disabled = true;
    try {
      const result = await (await fetch("/api/idrac/poweron", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      })).json();
      if (!result.ok) alert("Power On failed: " + result.error);
      setTimeout(fetchPowerStatus, 3000);
      startSshReadyWatch();
    } catch (err) { alert("Power On error: " + err.message); }
    finally { $powerOnBtn.disabled = false; }
  }

  let sshReadyTimer = null;

  function startSshReadyWatch() {
    clearInterval(sshReadyTimer);
    if (!state.connParams) return;
    $powerLabel.textContent = "BOOT";
    setSshDisplay(false);
    let attempts = 0;

    sshReadyTimer = setInterval(async () => {
      attempts++;
      if (attempts > 60) { clearInterval(sshReadyTimer); return; }
      const { host, jumpHost, jumpUser, password } = state.connParams;
      try {
        const result = await (await fetch("/api/ssh-ready", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ host, jumpHost, jumpUser, password }),
        })).json();
        if (result.ready) {
          clearInterval(sshReadyTimer);
          setSshDisplay(true);
          fetchPowerStatus();
          try {
            new Notification("KSB Flasher - Host Ready", {
              body: `${host} is now SSH-reachable`,
              tag: "ssh-ready",
            });
          } catch {}
          $statusBar.textContent = "Host SSH ready";
        }
      } catch {}
    }, 10000);
  }

  // -- Log viewer ------------------------------------------------------

  async function openLogViewer() {
    $logsOverlay.classList.remove("hidden");
    $logContent.textContent = "Loading log list...";
    $logSelect.innerHTML = '<option value="">-- Select a log --</option>';
    try {
      const logs = await (await fetch("/api/logs")).json();
      for (const log of logs) {
        const opt = document.createElement("option");
        opt.value = log.name;
        opt.textContent = `${log.name} (${(log.size / 1024).toFixed(1)} KB)`;
        $logSelect.appendChild(opt);
      }
      $logContent.textContent = logs.length ? "Select a log file above" : "No logs found";
    } catch (err) { $logContent.textContent = "Error: " + err.message; }
  }

  async function loadSelectedLog() {
    const name = $logSelect.value;
    if (!name) return;
    $logContent.textContent = "Loading...";
    try {
      const result = await (await fetch(`/api/logs/${encodeURIComponent(name)}`)).json();
      $logContent.textContent = result.content || result.error || "Empty log";
      $logContent.scrollTop = $logContent.scrollHeight;
    } catch (err) { $logContent.textContent = "Error: " + err.message; }
  }

  // -- FW / System Info ------------------------------------------------

  async function openFwInfo() {
    $fwInfoOverlay.classList.remove("hidden");
    $fwInfoContent.textContent = "Loading...";
    const p = getIdracParams();
    if (!p) { $fwInfoContent.textContent = "No iDRAC configured"; return; }
    try {
      const result = await (await fetch("/api/fw-version", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      })).json();
      if (result.ok) {
        $fwInfoContent.textContent = [
          `Hostname:      ${result.hostName}`,
          `Model:         ${result.model}`,
          `Manufacturer:  ${result.manufacturer}`,
          `Serial Number: ${result.serialNumber}`,
          `BIOS Version:  ${result.biosVersion}`,
        ].join("\n");
      } else {
        $fwInfoContent.textContent = "Error: " + (result.error || "Unknown");
      }
    } catch (err) { $fwInfoContent.textContent = "Error: " + err.message; }
  }

  // -- Flash progress tracking -----------------------------------------

  let xsdbOutputBuffer = "";

  function checkFlashProgress(text) {
    const pctMatch = text.match(/(\d+)\s*%/);
    if (pctMatch) {
      const pct = parseInt(pctMatch[1]);
      $statusBar.textContent = `Flash progress: ${pct}%`;
    }
    if (/successfully/i.test(text) || /100\s*%/.test(text)) {
      $statusBar.textContent = "Flash complete";
    }
    if (/error|fail/i.test(text) && !/filter/i.test(text)) {
      $statusBar.textContent = "Flash error detected";
    }

    xsdbOutputBuffer += text;
    if (xsdbOutputBuffer.includes("KSB_DETECT_END")) {
      const lines = xsdbOutputBuffer.split("\n");
      const targets = [];
      for (const line of lines) {
        const m = line.match(/KSB_T:(\d+):(.+)/);
        if (m) targets.push({ id: m[1], name: m[2].trim() });
      }
      xsdbOutputBuffer = "";
      if (targets.length > 0) {
        const info = targets.map(t => `ta ${t.id} = ${t.name}`).join(" | ");
        $statusBar.textContent = `Targets: ${info}`;
      }
    }
    if (xsdbOutputBuffer.length > 10000) xsdbOutputBuffer = xsdbOutputBuffer.slice(-5000);
  }

  // -- Theme toggle ----------------------------------------------------

  function toggleTheme(force) {
    state.lightTheme = force !== undefined ? force : !state.lightTheme;
    document.documentElement.classList.toggle("light", state.lightTheme);
    localStorage.setItem("ksb_theme", state.lightTheme ? "light" : "dark");
    const theme = state.lightTheme ? XTERM_THEME_LIGHT : XTERM_THEME;
    for (const name of TERMINAL_DEFS) {
      const t = state.terminals[name];
      if (t && t.term) t.term.options.theme = theme;
    }
  }

  // -- Font size -------------------------------------------------------

  function changeFontSize(delta) {
    if (delta === 0) state.fontSize = 13;
    else state.fontSize = Math.max(8, Math.min(24, state.fontSize + delta));
    $fontSizeLabel.textContent = state.fontSize;
    for (const name of TERMINAL_DEFS) {
      const t = state.terminals[name];
      if (t && t.term) {
        t.term.options.fontSize = state.fontSize;
        try { t.fitAddon.fit(); } catch {}
      }
    }
  }

  // -- Export / Import config ------------------------------------------

  function exportConfig() {
    const config = {
      jumpHost: $jumpInput.value.trim(),
      host: $hostInput.value.trim(),
      jumpUser: $jumpUserInput.value.trim(),
      targetUser: $targetUserInput.value.trim(),
      commands: { sec: parseCommands($cmdSec.value), nmc: parseCommands($cmdNmc.value), apu: parseCommands($cmdApu.value), xsdb: parseCommands($cmdXsdb.value) },
      macros: state.macros,
      watchPatterns: $watchPatterns.value.trim(),
      idracHost: $idracHost.value.trim(),
      idracUser: $idracUser.value.trim(),
      idracPass: obfuscate($idracPass.value),
      profiles: state.profiles,
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ksb_flasher_config_${$hostInput.value.trim().replace(/\./g, "_") || "export"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importConfig(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const config = JSON.parse(ev.target.result);
        if (config.jumpHost !== undefined) $jumpInput.value = config.jumpHost;
        if (config.host !== undefined) $hostInput.value = config.host;
        if (config.jumpUser !== undefined) $jumpUserInput.value = config.jumpUser;
        if (config.targetUser !== undefined) $targetUserInput.value = config.targetUser;
        if (config.commands) {
          if (config.commands.sec) $cmdSec.value = config.commands.sec.join("\n");
          if (config.commands.nmc) $cmdNmc.value = config.commands.nmc.join("\n");
          if (config.commands.apu) $cmdApu.value = config.commands.apu.join("\n");
          if (config.commands.xsdb) $cmdXsdb.value = config.commands.xsdb.join("\n");
        }
        if (config.macros) state.macros = config.macros;
        if (config.watchPatterns) $watchPatterns.value = config.watchPatterns;
        if (config.idracHost) $idracHost.value = config.idracHost;
        if (config.idracUser) $idracUser.value = config.idracUser;
        if (config.idracPass) $idracPass.value = deobfuscate(config.idracPass);
        if (config.profiles) {
          Object.assign(state.profiles, config.profiles);
          localStorage.setItem(PROFILES_KEY, JSON.stringify(state.profiles));
          renderProfileDropdown();
        }
      } catch { showError("Invalid config JSON file"); }
    };
    reader.readAsText(file);
    $importFile.value = "";
  }

  // -- Helpers ---------------------------------------------------------

  function showError(msg) { $connectError.textContent = msg; $connectError.classList.add("visible"); }
  function hideError()    { $connectError.classList.remove("visible"); $connectError.textContent = ""; }
  function esc(str) { const d = document.createElement("div"); d.textContent = str; return d.innerHTML; }

  function obfuscate(s) { try { return s ? btoa(s) : ""; } catch { return ""; } }
  function deobfuscate(s) { try { return s ? atob(s) : ""; } catch { return s || ""; } }

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
