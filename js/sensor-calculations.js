/**
 * sensor-calculations.js - Sensor Physics, Calibration & Validation Utilities
 * IoT Sensor Monitoring & Servo Control System
 */

const SensorCalculations = {
  /**
   * Calculates temperature in Celsius from ESP32 raw ADC reading
   * 
   * Formula:
   * Voltage (V) = (rawADC / adcResolution) * vrefVoltage
   * Voltage (mV) = Voltage (V) * 1000
   * Temp (°C) = (Voltage (mV) / scaleMvPerC) + tempOffsetC
   * 
   * Note on ESP32 ADC:
   * ESP32 ADC is non-linear below ~100mV and above ~3.1V (with 11dB attenuation).
   * For precision, hardware calibration or an external ADC can be used.
   */
  calculateTemperatureFromADC(rawAdc, options = {}) {
    const config = AppConfig.get().calibration.lm35;
    const vref = options.vrefVoltage ?? config.vrefVoltage;
    const resolution = options.adcResolution ?? config.adcResolution;
    const scale = options.scaleMvPerC ?? config.scaleMvPerC;
    const offset = options.tempOffsetC ?? config.tempOffsetC;

    const clampedAdc = Math.max(0, Math.min(resolution, Number(rawAdc) || 0));
    const voltageVolts = (clampedAdc / resolution) * vref;
    const voltageMilliVolts = voltageVolts * 1000;
    const temperatureC = (voltageMilliVolts / scale) + offset;

    return {
      temperatureC: Number(temperatureC.toFixed(1)),
      voltageVolts: Number(voltageVolts.toFixed(3)),
      voltageMilliVolts: Number(voltageMilliVolts.toFixed(1))
    };
  },

  /**
   * Converts raw LDR ADC reading to calibrated relative brightness percentage.
   * 
   * IMPORTANT:
   * This is relative brightness (0% - 100%), NOT absolute illuminance in Lux.
   * CdS photoresistors have non-linear spectral responses and temperature coefficients.
   */
  calculateLdrPercentage(rawAdc, options = {}) {
    const config = AppConfig.get().calibration.ldr;
    const darkVal = options.darkAdcValue ?? config.darkAdcValue;
    const brightVal = options.brightAdcValue ?? config.brightAdcValue;
    const invert = options.invertPolarity ?? config.invertPolarity;
    const resolution = options.adcResolution ?? config.adcResolution;

    const raw = Math.max(0, Math.min(resolution, Number(rawAdc) || 0));

    let percentage = 0;
    if (invert) {
      // Direct polarity: Higher ADC count = Brighter light
      if (brightVal !== darkVal) {
        percentage = ((raw - darkVal) / (brightVal - darkVal)) * 100;
      }
    } else {
      // Inverted / standard pull-down divider: Lower ADC count = Brighter light
      if (darkVal !== brightVal) {
        percentage = ((darkVal - raw) / (darkVal - brightVal)) * 100;
      }
    }

    // Clamp between 0% and 100%
    const clampedPercent = Math.max(0, Math.min(100, Math.round(percentage)));

    // Categorize condition
    const condition = this.getLightCondition(clampedPercent);

    return {
      percentage: clampedPercent,
      condition: condition,
      rawAdc: raw
    };
  },

  /**
   * Categorizes light percentage into Dark, Moderate, or Bright condition
   */
  getLightCondition(percentage) {
    const config = AppConfig.get().calibration.ldr;
    const darkThresh = config.darkThresholdPercent;
    const brightThresh = config.brightThresholdPercent;

    if (percentage <= darkThresh) {
      return "Dark";
    } else if (percentage >= brightThresh) {
      return "Bright";
    } else {
      return "Moderate";
    }
  },

  /**
   * Clamps and validates servo angle (0 to 180 degrees)
   */
  clampServoAngle(angle) {
    const config = AppConfig.get().calibration.servos;
    const num = Number(angle);
    if (isNaN(num)) return 90; // Default center position
    return Math.max(config.minAngle, Math.min(config.maxAngle, Math.round(num)));
  },

  /**
   * Validates and sanitizes an incoming telemetry record from ESP32 or Demo
   */
  sanitizeRecord(record) {
    if (!record || typeof record !== "object") {
      return null;
    }

    // Extract or compute fields safely
    const rawAdc = Number(record.ldrRaw) || 0;
    const ldrCalc = this.calculateLdrPercentage(rawAdc);

    // If device sent calculated percentage/condition, respect it if valid; otherwise use frontend calibrated
    const lightPercentage = typeof record.lightPercentage === "number" 
      ? Math.max(0, Math.min(100, Math.round(record.lightPercentage)))
      : ldrCalc.percentage;

    const lightCondition = record.lightCondition || this.getLightCondition(lightPercentage);

    // Temperature
    let temperatureC = Number(record.temperatureC);
    if (isNaN(temperatureC)) {
      temperatureC = 25.0; // Fallback
    } else {
      temperatureC = Number(temperatureC.toFixed(1));
    }

    let solarVoltage = Number(record.solarVoltage);
    if (!Number.isFinite(solarVoltage)) {
      solarVoltage = 0.0;
    }

    // Servo commanded angles (0 - 180)
    const servo1Angle = this.clampServoAngle(record.servo1Angle);
    const servo2Angle = this.clampServoAngle(record.servo2Angle);

    // Timestamp normalization (seconds or milliseconds)
    let timestamp = Number(record.timestamp);
    if (!timestamp || isNaN(timestamp)) {
      timestamp = Date.now();
    } else if (timestamp < 10000000000) {
      // In Unix seconds, convert to milliseconds
      timestamp = timestamp * 1000;
    }

    return {
      temperatureC,
      ldrRaw: rawAdc,
      lightPercentage,
      lightCondition,
      solarVoltage,
      servo1Angle,
      servo2Angle,
      timestamp,
      rawRecord: record
    };
  },

  /**
   * Formats a Unix timestamp into a readable date-time string
   */
  formatDateTime(timestampMs) {
    if (!timestampMs) return "--";
    const date = new Date(timestampMs);
    if (isNaN(date.getTime())) return "--";

    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
  },

  /**
   * Formats a time-only string (HH:MM:SS)
   */
  formatTime(timestampMs) {
    if (!timestampMs) return "--:--:--";
    const date = new Date(timestampMs);
    if (isNaN(date.getTime())) return "--:--:--";

    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
  },

  /**
   * Human relative time (e.g. "3 seconds ago", "2 minutes ago")
   */
  formatRelativeTime(timestampMs) {
    if (!timestampMs) return "Never";
    const now = Date.now();
    const diffSeconds = Math.max(0, Math.round((now - timestampMs) / 1000));

    if (diffSeconds < 2) return "Just now";
    if (diffSeconds < 60) return `${diffSeconds}s ago`;

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }
};
