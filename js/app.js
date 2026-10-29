/**
 * app.js - Main Application Controller
 * IoT Sensor Monitoring & Servo Control System
 */

const App = {
  // State
  currentRecord: null,
  previousRecord: null,
  lastReadingTimestamp: null,
  staleCheckTimer: null,
  activeView: "dashboard",
  activeAnalyticsFilter: "24h",
  activeEventFilter: "all",

  /**
   * Application bootstrap
   */
  init() {
    console.log("Initializing IoT Sensor Monitoring & Servo Control System...");

    // Setup UI navigation
    this.setupNavigation();
    this.setupModal();
    this.setupModeToggle();
    this.setupAnalyticsFilters();
    this.setupEventFilters();
    this.setupCsvExport();

    // Start stale detection periodic check (runs every 1 sec)
    this.startStaleChecker();

    // Start in configured mode
    const config = AppConfig.get();
    if (config.isDemoMode || !AppConfig.isFirebaseConfigured()) {
      this.enableDemoMode();
    } else {
      this.enableLiveMode();
    }

    // Refresh view data
    this.loadViewData(this.activeView);
  },

  /**
   * Sidebar & Tab View Navigation
   */
  setupNavigation() {
    const navItems = document.querySelectorAll(".nav-item[data-view]");
    navItems.forEach(item => {
      item.addEventListener("click", () => {
        const targetView = item.getAttribute("data-view");
        this.switchView(targetView);
        this.closeMobileSidebar();
      });
    });

    // Mobile menu toggle
    const menuBtn = document.getElementById("btn-menu-toggle");
    const sidebar = document.getElementById("app-sidebar");
    const backdrop = document.getElementById("sidebar-backdrop");

    if (menuBtn && sidebar && backdrop) {
      menuBtn.addEventListener("click", () => {
        sidebar.classList.toggle("open");
        backdrop.classList.toggle("open");
      });

      backdrop.addEventListener("click", () => {
        this.closeMobileSidebar();
      });
    }
  },

  closeMobileSidebar() {
    const sidebar = document.getElementById("app-sidebar");
    const backdrop = document.getElementById("sidebar-backdrop");
    if (sidebar) sidebar.classList.remove("open");
    if (backdrop) backdrop.classList.remove("open");
  },

  switchView(viewId) {
    this.activeView = viewId;

    // Update nav active states
    document.querySelectorAll(".nav-item[data-view]").forEach(item => {
      if (item.getAttribute("data-view") === viewId) {
        item.classList.add("active");
      } else {
        item.classList.remove("active");
      }
    });

    // Update view containers
    document.querySelectorAll(".tab-view").forEach(view => {
      if (view.id === `view-${viewId}`) {
        view.classList.add("active");
      } else {
        view.classList.remove("active");
      }
    });

    this.loadViewData(viewId);
  },

  /**
   * Loads specific data when switching views
   */
  async loadViewData(viewId) {
    const timeWindow = this.getTimeWindowMs(this.activeAnalyticsFilter);

    if (viewId === "analytics") {
      const records = await this.getHistory(timeWindow);
      ChartsManager.initAnalyticsCharts(records);
      this.updateAnalyticsCount(records.length);
    } else if (viewId === "details") {
      const records = await this.getHistory(timeWindow);
      this.renderSensorDetails(records);
    } else if (viewId === "servo") {
      const records = await this.getHistory(timeWindow);
      ChartsManager.initServoHistoryChart(records);
      this.renderServoHistoryTable(records);
    } else if (viewId === "events") {
      const events = await this.getEvents();
      this.renderEventsList(events);
    }
  },

  /**
   * Setup Mode Toggle (Demo vs Live)
   */
  setupModeToggle() {
    const toggleBtn = document.getElementById("btn-toggle-mode");
    const bannerSwitchBtn = document.getElementById("btn-banner-switch-mode");

    const handleToggle = () => {
      const config = AppConfig.get();
      if (config.isDemoMode) {
        // Attempt to switch to Live Mode
        if (!AppConfig.isFirebaseConfigured()) {
          this.openModal("tab-settings-firebase");
          this.showToast("Please enter your Firebase configuration to enable Live Mode.", "warning");
          return;
        }
        AppConfig.save({ isDemoMode: false });
        this.enableLiveMode();
      } else {
        // Switch to Demo Mode
        AppConfig.save({ isDemoMode: true });
        this.enableDemoMode();
      }
    };

    if (toggleBtn) toggleBtn.addEventListener("click", handleToggle);
    if (bannerSwitchBtn) bannerSwitchBtn.addEventListener("click", handleToggle);
  },

  /**
   * Enables Demo Mode (Simulated data)
   */
  enableDemoMode() {
    FirebaseService.unsubscribe();
    DemoService.stop();

    // Subscribe to Demo Service updates
    DemoService.onReading(record => this.handleIncomingReading(record));
    DemoService.onEvent(eventObj => this.handleIncomingEvent(eventObj));
    DemoService.start();

    // Update UI Badges & Banners
    this.updateModeUI(true);
    this.showToast("Demo Mode active (simulated readings)", "info");
  },

  /**
   * Enables Live Mode (Firebase RTDB)
   */
  enableLiveMode() {
    DemoService.stop();

    const ok = FirebaseService.init();
    if (!ok) {
      this.showToast("Could not connect to Firebase. Reverting to Demo Mode.", "danger");
      AppConfig.save({ isDemoMode: true });
      this.enableDemoMode();
      return;
    }

    FirebaseService.onReading(record => this.handleIncomingReading(record));
    FirebaseService.onConnectionChange((connected, msg) => {
      this.updateConnectionStatus(connected, msg);
    });

    const subscribed = FirebaseService.subscribeToCurrentReadings();
    if (subscribed) {
      this.updateModeUI(false);
      this.showToast("Live Mode connected to Firebase", "success");
    }
  },

  updateModeUI(isDemo) {
    const badge = document.getElementById("header-mode-badge");
    const demoBanner = document.getElementById("banner-demo");
    const deviceIdEl = document.getElementById("sidebar-device-id");
    const config = AppConfig.get();

    if (deviceIdEl) deviceIdEl.textContent = config.deviceId;

    if (isDemo) {
      if (badge) {
        badge.className = "mode-badge demo-mode";
        badge.innerHTML = `<span class="pulse-dot"></span> DEMO MODE`;
      }
      if (demoBanner) demoBanner.style.display = "flex";
    } else {
      if (badge) {
        badge.className = "mode-badge live-online";
        badge.innerHTML = `<span class="pulse-dot"></span> LIVE MODE`;
      }
      if (demoBanner) demoBanner.style.display = "none";
    }
  },

  /**
   * Handles incoming sensor data packet (from Demo or Live Firebase)
   */
  handleIncomingReading(record) {
    this.previousRecord = this.currentRecord;
    this.currentRecord = record;
    this.lastReadingTimestamp = record.timestamp || Date.now();

    // Update Dashboard UI Cards
    this.updateDashboardCards(record);

    // Update Charts Manager with real-time stream
    ChartsManager.appendRealtimePoint(record);

    // Clear stale warning if it was active
    this.setStaleWarning(false);
  },

  /**
   * Handles incoming event notification
   */
  handleIncomingEvent(eventObj) {
    if (this.activeView === "events") {
      this.loadViewData("events");
    }
    this.showToast(`[${eventObj.title}]: ${eventObj.value}`, eventObj.severity || "info");
  },

  /**
   * Updates all 6 main dashboard cards
   */
  updateDashboardCards(record) {
    if (!record) return;

    // 1. CARD A: TEMPERATURE
    const tempValEl = document.getElementById("val-temp");
    const tempBarEl = document.getElementById("fill-temp");
    const tempTrendEl = document.getElementById("trend-temp");
    const tempTimeEl = document.getElementById("time-temp");

    if (tempValEl) tempValEl.textContent = record.temperatureC.toFixed(1);
    if (tempBarEl) {
      // Map 0°C - 50°C to 0% - 100%
      const pct = Math.max(0, Math.min(100, (record.temperatureC / 50) * 100));
      tempBarEl.style.width = `${pct}%`;
    }
    if (tempTimeEl) tempTimeEl.textContent = SensorCalculations.formatTime(record.timestamp);

    // Calculate temperature trend
    if (tempTrendEl && this.previousRecord) {
      const diff = record.temperatureC - this.previousRecord.temperatureC;
      if (diff > 0.05) {
        tempTrendEl.className = "trend-indicator trend-up";
        tempTrendEl.innerHTML = `▲ +${diff.toFixed(1)}°C`;
      } else if (diff < -0.05) {
        tempTrendEl.className = "trend-indicator trend-down";
        tempTrendEl.innerHTML = `▼ ${diff.toFixed(1)}°C`;
      } else {
        tempTrendEl.className = "trend-indicator trend-steady";
        tempTrendEl.innerHTML = `● Steady`;
      }
    }

    // 2. CARD B: LDR RAW ADC
    const ldrRawValEl = document.getElementById("val-ldr-raw");
    const ldrBarEl = document.getElementById("fill-ldr");
    const ldrVoltEl = document.getElementById("val-ldr-voltage");
    const ldrTimeEl = document.getElementById("time-ldr");

    if (ldrRawValEl) ldrRawValEl.textContent = record.ldrRaw;
    if (ldrBarEl) {
      const pct = Math.max(0, Math.min(100, (record.ldrRaw / 4095) * 100));
      ldrBarEl.style.width = `${pct}%`;
    }
    if (ldrVoltEl) {
      const volt = ((record.ldrRaw / 4095) * 3.3).toFixed(2);
      ldrVoltEl.textContent = `${volt} V`;
    }
    if (ldrTimeEl) ldrTimeEl.textContent = SensorCalculations.formatTime(record.timestamp);

    // 3. CARD C: RELATIVE LIGHT INTENSITY
    const lightPctValEl = document.getElementById("val-light-pct");
    const lightBarEl = document.getElementById("fill-light");
    const lightCondEl = document.getElementById("val-light-condition");
    const lightTimeEl = document.getElementById("time-light");

    if (lightPctValEl) lightPctValEl.textContent = record.lightPercentage;
    if (lightBarEl) lightBarEl.style.width = `${record.lightPercentage}%`;
    if (lightTimeEl) lightTimeEl.textContent = SensorCalculations.formatTime(record.timestamp);

    if (lightCondEl) {
      lightCondEl.textContent = record.lightCondition;
      lightCondEl.className = `condition-pill condition-${record.lightCondition.toLowerCase()}`;
    }

    // 4. CARD D: SERVO 1 COMMANDED ANGLE
    this.updateServoDial(1, record.servo1Angle);

    // 5. CARD E: SERVO 2 COMMANDED ANGLE
    this.updateServoDial(2, record.servo2Angle);

    // 6. CARD F: SOLAR PANEL VOLTAGE
    const lastUpdateHeader = document.getElementById("header-last-update");
    if (lastUpdateHeader) {
      lastUpdateHeader.textContent = `Updated ${SensorCalculations.formatRelativeTime(record.timestamp)}`;
    }

    const solarVoltageEl = document.getElementById("val-solar-voltage");
    const solarVoltageBarEl = document.getElementById("fill-voltage");

    if (solarVoltageEl) solarVoltageEl.textContent = record.solarVoltage.toFixed(2);
    if (solarVoltageBarEl) {
      const voltagePct = Math.max(0, Math.min(100, (record.solarVoltage / 12) * 100));
      solarVoltageBarEl.style.width = `${voltagePct}%`;
    }
  },

  /**
   * Updates visual dial gauge for Servo 1 or Servo 2
   */
  updateServoDial(servoNum, angle) {
    const angleText = document.getElementById(`val-servo${servoNum}-angle`);
    const needle = document.getElementById(`servo${servoNum}-needle`);
    const progress = document.getElementById(`servo${servoNum}-progress`);
    const deltaTag = document.getElementById(`servo${servoNum}-delta`);

    if (angleText) angleText.textContent = `${angle}°`;

    // Rotate needle from -90deg (0°) to +90deg (180°)
    if (needle) {
      const rotateDeg = (angle - 90);
      needle.setAttribute("transform", `rotate(${rotateDeg} 100 95)`);
    }

    // Update gauge arc stroke-dashoffset (semicircle circumference is ~220px)
    if (progress) {
      const maxOffset = 220;
      const progressOffset = maxOffset - (angle / 180) * maxOffset;
      progress.style.strokeDashoffset = progressOffset;
    }

    // Compute angle delta from previous reading
    if (deltaTag && this.previousRecord) {
      const prev = servoNum === 1 ? this.previousRecord.servo1Angle : this.previousRecord.servo2Angle;
      const delta = angle - prev;
      if (delta !== 0) {
        deltaTag.textContent = `Δ ${delta > 0 ? "+" : ""}${delta}°`;
      } else {
        deltaTag.textContent = `Δ 0°`;
      }
    }
  },

  /**
   * Periodic check to verify if live data has become stale
   */
  startStaleChecker() {
    this.staleCheckTimer = setInterval(() => {
      if (!this.lastReadingTimestamp) return;

      const config = AppConfig.get();
      const elapsedSeconds = Math.round((Date.now() - this.lastReadingTimestamp) / 1000);

      // Update header relative time readout continuously
      const lastUpdateHeader = document.getElementById("header-last-update");
      if (lastUpdateHeader) {
        lastUpdateHeader.textContent = `Updated ${SensorCalculations.formatRelativeTime(this.lastReadingTimestamp)}`;
      }

      // Check for stale condition in Live Mode
      if (!config.isDemoMode && elapsedSeconds > config.staleTimeoutSeconds) {
        this.setStaleWarning(true, elapsedSeconds);
      }
    }, 1000);
  },

  setStaleWarning(isStale, elapsedSeconds = 0) {
    const banner = document.getElementById("banner-stale");
    const bannerMsg = document.getElementById("banner-stale-message");
    const badge = document.getElementById("header-mode-badge");

    if (isStale) {
      if (banner) banner.classList.add("visible");
      if (bannerMsg) {
        bannerMsg.textContent = `Data is stale: No new readings received from ESP32 in ${elapsedSeconds}s. Displaying last known sensor readings.`;
      }
      if (badge) {
        badge.className = "mode-badge live-stale";
        badge.innerHTML = `<span class="pulse-dot"></span> LIVE (STALE)`;
      }
    } else {
      if (banner) banner.classList.remove("visible");
      const config = AppConfig.get();
      if (!config.isDemoMode && badge) {
        badge.className = "mode-badge live-online";
        badge.innerHTML = `<span class="pulse-dot"></span> LIVE MODE`;
      }
    }
  },

  updateConnectionStatus(connected, message = "") {
    const badge = document.getElementById("header-mode-badge");
    if (!AppConfig.get().isDemoMode) {
      if (connected) {
        badge.className = "mode-badge live-online";
        badge.innerHTML = `<span class="pulse-dot"></span> LIVE ONLINE`;
      } else {
        badge.className = "mode-badge live-offline";
        badge.innerHTML = `<span class="pulse-dot"></span> LIVE OFFLINE`;
        if (message) {
          this.showToast(`Firebase Notice: ${message}`, "warning");
        }
      }
    }
  },

  /**
   * Analytics Filter Buttons
   */
  setupAnalyticsFilters() {
    const filterBtns = document.querySelectorAll(".filter-btn[data-filter]");
    filterBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        filterBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.activeAnalyticsFilter = btn.getAttribute("data-filter");
        this.loadViewData("analytics");
      });
    });

    const refreshBtn = document.getElementById("btn-refresh-analytics");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => {
        this.loadViewData("analytics");
        this.showToast("Refreshed analytics charts", "info");
      });
    }
  },

  getTimeWindowMs(filterKey) {
    switch (filterKey) {
      case "1h": return 1 * 60 * 60 * 1000;
      case "6h": return 6 * 60 * 60 * 1000;
      case "24h": return 24 * 60 * 60 * 1000;
      case "7d": return 7 * 24 * 60 * 60 * 1000;
      default: return 24 * 60 * 60 * 1000;
    }
  },

  updateAnalyticsCount(count) {
    const el = document.getElementById("analytics-records-count");
    if (el) el.textContent = `Showing ${count} records`;
  },

  /**
   * Renders Page 3: Sensor Details Deep Dive & Statistics
   */
  renderSensorDetails(records = []) {
    if (!records.length) return;

    // LM35 Statistics
    const temps = records.map(r => r.temperatureC);
    const minTemp = Math.min(...temps);
    const maxTemp = Math.max(...temps);
    const avgTemp = (temps.reduce((a, b) => a + b, 0) / temps.length);

    document.getElementById("detail-lm35-current").textContent = `${this.currentRecord?.temperatureC ?? "--"} °C`;
    document.getElementById("detail-lm35-min").textContent = `${minTemp.toFixed(1)} °C`;
    document.getElementById("detail-lm35-max").textContent = `${maxTemp.toFixed(1)} °C`;
    document.getElementById("detail-lm35-avg").textContent = `${avgTemp.toFixed(1)} °C`;

    // LDR Statistics
    const raws = records.map(r => r.ldrRaw);
    const minRaw = Math.min(...raws);
    const maxRaw = Math.max(...raws);
    const avgRaw = Math.round(raws.reduce((a, b) => a + b, 0) / raws.length);

    document.getElementById("detail-ldr-current").textContent = `${this.currentRecord?.ldrRaw ?? "--"}`;
    document.getElementById("detail-ldr-min").textContent = `${minRaw}`;
    document.getElementById("detail-ldr-max").textContent = `${maxRaw}`;
    document.getElementById("detail-ldr-avg").textContent = `${avgRaw}`;
  },

  /**
   * Renders Page 4: Servo History Table
   */
  renderServoHistoryTable(records = []) {
    const tbody = document.getElementById("servo-history-tbody");
    if (!tbody) return;

    if (!records.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 2rem; color: var(--text-muted);">No servo movement records found for this period.</td></tr>`;
      return;
    }

    // Sort descending by timestamp
    const sorted = [...records].reverse().slice(0, 50);

    let html = "";
    sorted.forEach((r, idx) => {
      const prev = sorted[idx + 1];
      const delta1 = prev ? r.servo1Angle - prev.servo1Angle : 0;
      const deltaStr = delta1 !== 0 ? `${delta1 > 0 ? "+" : ""}${delta1}°` : "0°";

      html += `
        <tr>
          <td class="tabular-nums">${SensorCalculations.formatDateTime(r.timestamp)}</td>
          <td><strong style="color: #a78bfa;">${r.servo1Angle}°</strong></td>
          <td><strong style="color: #f472b6;">${r.servo2Angle}°</strong></td>
          <td class="tabular-nums">${r.ldrRaw}</td>
          <td class="tabular-nums">${r.lightPercentage}%</td>
          <td><span class="condition-pill condition-${r.lightCondition.toLowerCase()}">${r.lightCondition}</span></td>
          <td><span class="servo-delta-tag">${deltaStr}</span></td>
        </tr>
      `;
    });

    tbody.innerHTML = html;

    // Update summary counters
    const countEl = document.getElementById("servo-total-movements");
    if (countEl) countEl.textContent = records.length;
  },

  /**
   * Renders Page 5: Event Logs
   */
  setupEventFilters() {
    const filterBtns = document.querySelectorAll(".event-filter-btn");
    filterBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        filterBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.activeEventFilter = btn.getAttribute("data-category");
        this.loadViewData("events");
      });
    });
  },

  renderEventsList(events = []) {
    const listEl = document.getElementById("events-list-container");
    const emptyEl = document.getElementById("events-empty-state");
    if (!listEl) return;

    // Filter by active category
    let filtered = events;
    if (this.activeEventFilter !== "all") {
      filtered = events.filter(e => {
        if (this.activeEventFilter === "light") return e.type.includes("LIGHT");
        if (this.activeEventFilter === "servo") return e.type.includes("SERVO");
        if (this.activeEventFilter === "threshold") return e.type.includes("THRESHOLD") || e.type.includes("TEMP");
        if (this.activeEventFilter === "system") return e.type.includes("DEVICE") || e.type.includes("SYSTEM");
        return true;
      });
    }

    if (!filtered.length) {
      listEl.innerHTML = "";
      if (emptyEl) emptyEl.style.display = "flex";
      return;
    }

    if (emptyEl) emptyEl.style.display = "none";

    let html = "";
    filtered.forEach(evt => {
      let iconSvg = "";
      let iconBg = "";

      if (evt.type.includes("LIGHT")) {
        iconBg = "rgba(245, 158, 11, 0.15)";
        iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`;
      } else if (evt.type.includes("SERVO")) {
        iconBg = "rgba(139, 92, 246, 0.15)";
        iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>`;
      } else {
        iconBg = "rgba(239, 68, 68, 0.15)";
        iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
      }

      html += `
        <div class="event-item">
          <div class="event-left">
            <div class="event-icon-badge" style="background: ${iconBg};">
              <div style="width: 20px; height: 20px;">${iconSvg}</div>
            </div>
            <div>
              <div class="event-title">${evt.title}</div>
              <div class="event-desc">${evt.description}</div>
            </div>
          </div>
          <div class="event-right">
            <span class="event-timestamp">${SensorCalculations.formatDateTime(evt.timestamp)}</span>
            <span class="event-value-pill">${evt.value}</span>
          </div>
        </div>
      `;
    });

    listEl.innerHTML = html;
  },

  /**
   * Helper to retrieve history from Demo or Firebase
   */
  async getHistory(timeWindowMs) {
    const config = AppConfig.get();
    if (config.isDemoMode) {
      return DemoService.getHistory(timeWindowMs);
    } else {
      return await FirebaseService.fetchHistory(config.deviceId, timeWindowMs);
    }
  },

  /**
   * Helper to retrieve events from Demo or Firebase
   */
  async getEvents() {
    const config = AppConfig.get();
    if (config.isDemoMode) {
      return DemoService.getEvents();
    } else {
      return await FirebaseService.fetchEvents(config.deviceId);
    }
  },

  /**
   * Settings & Calibration Modal Handlers
   */
  setupModal() {
    const modal = document.getElementById("settings-modal");
    const openBtns = [document.getElementById("btn-open-settings"), document.getElementById("btn-header-settings")];
    const closeBtn = document.getElementById("btn-close-modal");
    const saveBtn = document.getElementById("btn-save-settings");
    const resetBtn = document.getElementById("btn-reset-defaults");

    openBtns.forEach(btn => {
      if (btn) btn.addEventListener("click", () => this.openModal("tab-settings-general"));
    });

    if (closeBtn) {
      closeBtn.addEventListener("click", () => this.closeModal());
    }

    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) this.closeModal();
      });
    }

    // Modal internal tabs
    const modalTabBtns = document.querySelectorAll(".modal-tab-btn");
    modalTabBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const tabTarget = btn.getAttribute("data-tab");
        modalTabBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        document.querySelectorAll(".modal-tab-content").forEach(c => {
          c.style.display = c.id === tabTarget ? "flex" : "none";
        });
      });
    });

    // Save Settings
    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        this.saveModalSettings();
        this.closeModal();
        this.showToast("Settings saved successfully!", "success");
      });
    }

    // Reset Defaults
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        if (confirm("Reset all settings to default configuration?")) {
          AppConfig.resetToDefaults();
          this.populateModalInputs();
          this.showToast("Configuration reset to defaults.", "info");
        }
      });
    }
  },

  openModal(defaultTabId = "tab-settings-general") {
    const modal = document.getElementById("settings-modal");
    if (!modal) return;
    this.populateModalInputs();

    // Activate default tab
    const tabBtn = document.querySelector(`.modal-tab-btn[data-tab="${defaultTabId}"]`);
    if (tabBtn) tabBtn.click();

    modal.classList.add("active");
  },

  closeModal() {
    const modal = document.getElementById("settings-modal");
    if (modal) modal.classList.remove("active");
  },

  populateModalInputs() {
    const config = AppConfig.get();

    // Firebase tab
    document.getElementById("cfg-fb-apikey").value = config.firebase.apiKey || "";
    document.getElementById("cfg-fb-authdomain").value = config.firebase.authDomain || "";
    document.getElementById("cfg-fb-dburl").value = config.firebase.databaseURL || "";
    document.getElementById("cfg-fb-projectid").value = config.firebase.projectId || "";
    document.getElementById("cfg-fb-deviceid").value = config.deviceId || "ESP32_001";

    // Calibration tab
    document.getElementById("cfg-lm35-vref").value = config.calibration.lm35.vrefVoltage;
    document.getElementById("cfg-lm35-offset").value = config.calibration.lm35.tempOffsetC;
    document.getElementById("cfg-ldr-dark").value = config.calibration.ldr.darkAdcValue;
    document.getElementById("cfg-ldr-bright").value = config.calibration.ldr.brightAdcValue;
    document.getElementById("cfg-ldr-invert").checked = config.calibration.ldr.invertPolarity;
    document.getElementById("cfg-stale-timeout").value = config.staleTimeoutSeconds;
  },

  saveModalSettings() {
    const newConfig = {
      deviceId: document.getElementById("cfg-fb-deviceid").value.trim() || "ESP32_001",
      staleTimeoutSeconds: Number(document.getElementById("cfg-stale-timeout").value) || 60,
      firebase: {
        apiKey: document.getElementById("cfg-fb-apikey").value.trim(),
        authDomain: document.getElementById("cfg-fb-authdomain").value.trim(),
        databaseURL: document.getElementById("cfg-fb-dburl").value.trim(),
        projectId: document.getElementById("cfg-fb-projectid").value.trim()
      },
      calibration: {
        lm35: {
          vrefVoltage: Number(document.getElementById("cfg-lm35-vref").value) || 3.3,
          tempOffsetC: Number(document.getElementById("cfg-lm35-offset").value) || 0.0
        },
        ldr: {
          darkAdcValue: Number(document.getElementById("cfg-ldr-dark").value) || 3800,
          brightAdcValue: Number(document.getElementById("cfg-ldr-bright").value) || 350,
          invertPolarity: document.getElementById("cfg-ldr-invert").checked
        }
      }
    };

    AppConfig.save(newConfig);

    // If in Live Mode, re-initialize Firebase
    if (!AppConfig.get().isDemoMode) {
      this.enableLiveMode();
    }
  },

  /**
   * CSV Data Export for College Project Reports
   */
  setupCsvExport() {
    const exportBtn = document.getElementById("btn-export-csv");
    if (exportBtn) {
      exportBtn.addEventListener("click", async () => {
        const records = await this.getHistory(24 * 60 * 60 * 1000);
        if (!records.length) {
          this.showToast("No records available to export", "warning");
          return;
        }

        let csv = "Timestamp_ISO,Timestamp_Unix,Temperature_C,LDR_Raw_ADC,Light_Percentage,Light_Condition,Servo1_Commanded_Deg,Servo2_Commanded_Deg\n";
        records.forEach(r => {
          csv += `"${new Date(r.timestamp).toISOString()}",${r.timestamp},${r.temperatureC},${r.ldrRaw},${r.lightPercentage},"${r.lightCondition}",${r.servo1Angle},${r.servo2Angle}\n`;
        });

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `IoT_Sensor_Telemetry_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        this.showToast("Telemetry CSV exported successfully!", "success");
      });
    }
  },

  /**
   * UI Toast Notifications
   */
  showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    let iconColor = "#00d2ff";
    if (type === "success") iconColor = "#10b981";
    if (type === "warning") iconColor = "#f59e0b";
    if (type === "danger") iconColor = "#ef4444";

    toast.innerHTML = `
      <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${iconColor};"></span>
      <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(10px)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }
};

// Bootstrap when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  App.init();
});
