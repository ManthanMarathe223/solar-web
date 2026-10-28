/**
 * demo-service.js - Realistic Sensor & Servo Simulation Service
 * IoT Sensor Monitoring & Servo Control System
 * 
 * NOTE: This service runs ENTIRELY client-side in browser memory.
 * It NEVER writes simulated data to Firebase or claims to be real hardware.
 */

const DemoService = {
  isRunning: false,
  timerId: null,
  listeners: {
    reading: [],
    event: []
  },

  // State variables for smooth continuous simulation
  currentTemp: 28.2,
  currentLdrRaw: 1850,
  currentServo1: 90,
  currentServo2: 45,
  previousCondition: "Moderate",
  cycleStep: 0,

  // Local in-memory history cache for demo mode
  history: [],
  events: [],

  /**
   * Initializes demo mode and populates realistic historical records
   */
  init() {
    this.generateInitialHistory();
  },

  /**
   * Generates realistic 24-hour historical records for chart & table demonstration
   */
  generateInitialHistory() {
    this.history = [];
    this.events = [];
    const now = Date.now();
    const totalPoints = 60; // 60 data points over the last 24 hours (every ~24 min)
    const stepMs = (24 * 60 * 60 * 1000) / totalPoints;

    let simTemp = 25.5;
    let simLdr = 2200;
    let lastCond = "Moderate";
    let lastS1 = 90;
    let lastS2 = 45;

    for (let i = totalPoints; i >= 1; i--) {
      const recordTime = now - (i * stepMs);

      // Daily solar curve simulation (sinusoidal variation)
      const dayFraction = ((recordTime / 1000) % 86400) / 86400; // 0 to 1
      const solarIntensity = Math.max(0, Math.sin(dayFraction * 2 * Math.PI - Math.PI / 2)); // Peak at midday

      // Temperature warms during the day (24°C to 33°C)
      simTemp = 24.0 + (solarIntensity * 8.5) + ((Math.random() - 0.5) * 0.8);

      // LDR: Lower ADC = Brighter light in typical voltage divider setup
      simLdr = Math.round(3600 - (solarIntensity * 3100) + ((Math.random() - 0.5) * 150));
      simLdr = Math.max(300, Math.min(3950, simLdr));

      // Calculate relative percentage
      const ldrCalc = SensorCalculations.calculateLdrPercentage(simLdr);
      const lightPct = ldrCalc.percentage;
      const cond = ldrCalc.condition;

      // Servo 1 (Azimuth / Horizontal Tracking): sweeps across 30° to 150° during sunlight hours
      let s1Angle = 90;
      if (solarIntensity > 0.05) {
        s1Angle = Math.round(30 + (solarIntensity * 120) + ((Math.random() - 0.5) * 8));
      } else {
        s1Angle = 90; // Rest position at night
      }
      s1Angle = Math.max(0, Math.min(180, s1Angle));

      // Servo 2 (Elevation / Vertical Tilt): tilts upwards towards bright light (15° to 75°)
      let s2Angle = Math.round(15 + (lightPct * 0.6) + ((Math.random() - 0.5) * 4));
      s2Angle = Math.max(0, Math.min(180, s2Angle));

      const record = {
        temperatureC: Number(simTemp.toFixed(1)),
        ldrRaw: simLdr,
        lightPercentage: lightPct,
        lightCondition: cond,
        servo1Angle: s1Angle,
        servo2Angle: s2Angle,
        timestamp: recordTime
      };

      this.history.push(record);

      // Create realistic events on notable state changes
      if (cond !== lastCond && this.events.length < 15) {
        this.events.push({
          id: `demo_evt_${recordTime}`,
          type: "LIGHT_CONDITION_CHANGED",
          title: "Light Condition Transition",
          description: `Light intensity shifted from ${lastCond} to ${cond} (${lightPct}%)`,
          value: `${cond} (${lightPct}%)`,
          timestamp: recordTime,
          severity: cond === "Bright" ? "warning" : "info"
        });
        lastCond = cond;
      }

      if (Math.abs(s1Angle - lastS1) >= 30 && this.events.length < 20) {
        this.events.push({
          id: `demo_evt_s1_${recordTime}`,
          type: "SERVO1_COMMANDED_CHANGE",
          title: "Servo 1 Commanded Repositioning",
          description: `Azimuth tracking updated to ${s1Angle}° (Δ ${s1Angle > lastS1 ? "+" : ""}${s1Angle - lastS1}°)`,
          value: `${s1Angle}°`,
          timestamp: recordTime,
          severity: "info"
        });
        lastS1 = s1Angle;
      }
    }

    // Set current live values to the latest simulated state
    const latest = this.history[this.history.length - 1];
    if (latest) {
      this.currentTemp = latest.temperatureC;
      this.currentLdrRaw = latest.ldrRaw;
      this.currentServo1 = latest.servo1Angle;
      this.currentServo2 = latest.servo2Angle;
      this.previousCondition = latest.lightCondition;
    }
  },

  /**
   * Starts periodic simulation updates
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // Send immediate initial reading
    this.tick();

    const intervalSeconds = AppConfig.get().demoIntervalSeconds || 3;
    this.timerId = setInterval(() => {
      this.tick();
    }, intervalSeconds * 1000);
  },

  /**
   * Stops simulation updates
   */
  stop() {
    this.isRunning = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  },

  /**
   * Executes a single simulation step with realistic dynamic behavior
   */
  tick() {
    this.cycleStep++;

    // Temperature drift (+/- 0.2°C)
    const tempDelta = (Math.random() - 0.48) * 0.3;
    this.currentTemp = Math.max(22.0, Math.min(36.0, Number((this.currentTemp + tempDelta).toFixed(1))));

    // LDR dynamic variation: simulates moving cloud shadows or passing light
    const ldrWobble = Math.sin(this.cycleStep * 0.15) * 800 + ((Math.random() - 0.5) * 120);
    this.currentLdrRaw = Math.max(320, Math.min(3850, Math.round(2000 + ldrWobble)));

    // Calculate light percentage & condition
    const ldrCalc = SensorCalculations.calculateLdrPercentage(this.currentLdrRaw);
    const lightPct = ldrCalc.percentage;
    const cond = ldrCalc.condition;

    // Commanded servo angles responsive to light
    const prevS1 = this.currentServo1;
    const prevS2 = this.currentServo2;

    // Servo 1 tracks light direction: map 0-100% to 30°-150° with slight jitter
    this.currentServo1 = SensorCalculations.clampServoAngle(
      Math.round(30 + (lightPct * 1.2) + ((Math.random() - 0.5) * 4))
    );

    // Servo 2 tilts according to brightness: higher light -> higher tilt (e.g. 25° to 85°)
    this.currentServo2 = SensorCalculations.clampServoAngle(
      Math.round(25 + (lightPct * 0.6) + ((Math.random() - 0.5) * 3))
    );

    const now = Date.now();
    const newRecord = {
      temperatureC: this.currentTemp,
      ldrRaw: this.currentLdrRaw,
      lightPercentage: lightPct,
      lightCondition: cond,
      servo1Angle: this.currentServo1,
      servo2Angle: this.currentServo2,
      timestamp: now,
      isDemo: true
    };

    // Append to demo history (keep max 150 points in memory)
    this.history.push(newRecord);
    if (this.history.length > 150) {
      this.history.shift();
    }

    // Trigger state change events
    if (cond !== this.previousCondition) {
      const eventObj = {
        id: `demo_evt_${now}`,
        type: "LIGHT_CONDITION_CHANGED",
        title: "Light Condition Transition",
        description: `Ambient light transitioned from ${this.previousCondition} to ${cond} (${lightPct}%)`,
        value: `${cond} (${lightPct}%)`,
        timestamp: now,
        severity: cond === "Bright" ? "warning" : "info"
      };
      this.events.unshift(eventObj);
      this.notifyEvent(eventObj);
      this.previousCondition = cond;
    }

    // Commanded servo step event (if large step >= 15°)
    if (Math.abs(this.currentServo1 - prevS1) >= 15) {
      const delta = this.currentServo1 - prevS1;
      const s1Event = {
        id: `demo_evt_s1_${now}`,
        type: "SERVO1_COMMANDED_CHANGE",
        title: "Servo 1 Commanded Repositioning",
        description: `Azimuth axis angle updated to ${this.currentServo1}° (Δ ${delta > 0 ? "+" : ""}${delta}°)`,
        value: `${this.currentServo1}°`,
        timestamp: now,
        severity: "info"
      };
      this.events.unshift(s1Event);
      this.notifyEvent(s1Event);
    }

    // Temperature threshold notification (> 32°C)
    if (this.currentTemp > 32.5 && Math.random() < 0.2) {
      const tempEvent = {
        id: `demo_evt_temp_${now}`,
        type: "TEMP_THRESHOLD_EXCEEDED",
        title: "High Temperature Threshold",
        description: `LM35 reading exceeded 32.5°C threshold (${this.currentTemp}°C)`,
        value: `${this.currentTemp}°C`,
        timestamp: now,
        severity: "warning"
      };
      this.events.unshift(tempEvent);
      this.notifyEvent(tempEvent);
    }

    // Notify all reading listeners
    this.notifyReading(newRecord);
  },

  /**
   * Listener subscription methods
   */
  onReading(callback) {
    this.listeners.reading.push(callback);
  },

  onEvent(callback) {
    this.listeners.event.push(callback);
  },

  notifyReading(record) {
    this.listeners.reading.forEach(cb => {
      try { cb(record); } catch (e) { console.error("Error in demo reading callback", e); }
    });
  },

  notifyEvent(eventObj) {
    this.listeners.event.forEach(cb => {
      try { cb(eventObj); } catch (e) { console.error("Error in demo event callback", e); }
    });
  },

  /**
   * Retrieves historical records for analytics & tables
   */
  getHistory(timeWindowMs = 24 * 60 * 60 * 1000) {
    const cutoff = Date.now() - timeWindowMs;
    return this.history.filter(r => r.timestamp >= cutoff);
  },

  /**
   * Retrieves logged events
   */
  getEvents() {
    return [...this.events];
  }
};

// Initialize initial dataset on script load
DemoService.init();
