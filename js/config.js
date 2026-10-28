/**
 * config.js - Application Configuration & Calibration Store
 * IoT Sensor Monitoring & Servo Control System
 */

const DEFAULT_CONFIG = {
  // Mode Selection: default to Demo Mode for safe initial testing
  isDemoMode: true,
  demoIntervalSeconds: 3,

  // Firebase Realtime Database Configuration (Placeholders)
  firebase: {
  apiKey: "AIzaSyAuxl_kVzQFGcdKPEtdQ5MMEMfI_UxXKLw",
  authDomain: "iot-sensor-monitor-43d06.firebaseapp.com",
  databaseURL: "https://iot-sensor-monitor-43d06-default-rtdb.firebaseio.com",
  projectId: "iot-sensor-monitor-43d06",
  storageBucket: "iot-sensor-monitor-43d06.firebasestorage.app",
  messagingSenderId: "1025130158834",
  appId: "1:1025130158834:web:30cf3847e21ee597f24e6b"
},
  // Target IoT Device identifier in Firebase path: devices/{deviceId}
  deviceId: "ESP32_001",

  // Device health & timeout parameters
  staleTimeoutSeconds: 60, // Flag readings as stale if older than 60 seconds

  // Sensor Calibration Parameters
  calibration: {
    // LM35 Temperature Sensor
    lm35: {
      vrefVoltage: 3.3,           // Reference voltage in Volts (ESP32 nominal 3.3V)
      adcResolution: 4095,         // ESP32 default 12-bit ADC (0 - 4095)
      scaleMvPerC: 10.0,           // LM35 nominal scale: 10 mV / °C (0.01V / °C)
      tempOffsetC: 0.0             // Calibration offset in °C (+/-)
    },

    // LDR (Light Dependent Resistor)
    ldr: {
      adcResolution: 4095,         // ESP32 12-bit ADC range
      darkAdcValue: 3800,          // Raw ADC count corresponding to darkness
      brightAdcValue: 350,         // Raw ADC count corresponding to bright light
      invertPolarity: false,       // False: lower ADC = brighter (pull-down divider); True: higher ADC = brighter
      darkThresholdPercent: 30,    // 0% - 30% -> "Dark"
      brightThresholdPercent: 70   // 70% - 100% -> "Bright" (in-between is "Moderate")
    },

    // Servo Motors (Commanded Range)
    servos: {
      minAngle: 0,
      maxAngle: 180
    }
  }
};

const STORAGE_KEY = "iot_solar_monitor_config_v1";

const AppConfig = {
  current: null,

  /**
   * Initializes and loads configuration from LocalStorage or defaults
   */
  init() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Deep merge with defaults so new fields are never missing
        this.current = this.deepMerge(DEFAULT_CONFIG, parsed);
      } else {
        this.current = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      }
    } catch (err) {
      console.warn("Failed to read config from localStorage, using defaults", err);
      this.current = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    }
    return this.current;
  },

  /**
   * Returns active configuration object
   */
  get() {
    if (!this.current) {
      this.init();
    }
    return this.current;
  },

  /**
   * Persists configuration to LocalStorage
   */
  save(newConfig) {
    this.current = this.deepMerge(this.current, newConfig);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.current));
    } catch (err) {
      console.error("Failed to save config to localStorage", err);
    }
    return this.current;
  },

  /**
   * Resets configuration back to initial defaults
   */
  resetToDefaults() {
    this.current = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    localStorage.removeItem(STORAGE_KEY);
    return this.current;
  },

  /**
   * Checks if Firebase is genuinely configured or still contains placeholders
   */
  isFirebaseConfigured() {
    const fb = this.current?.firebase;
    if (!fb) return false;
    const placeholders = [
      "YOUR_FIREBASE_API_KEY",
      "YOUR_PROJECT_ID",
      "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com"
    ];
    return (
      Boolean(fb.apiKey && fb.databaseURL && fb.projectId) &&
      !placeholders.includes(fb.apiKey) &&
      !placeholders.includes(fb.projectId) &&
      !fb.databaseURL.includes("YOUR_PROJECT_ID")
    );
  },

  /**
   * Deep merge helper utility
   */
  deepMerge(target, source) {
    const output = Object.assign({}, target);
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    return output;
  },

  isObject(item) {
    return item && typeof item === "object" && !Array.isArray(item);
  }
};

// Initialize immediately
AppConfig.init();
