/**
 * firebase-service.js - Firebase Realtime Database Integration Service
 * IoT Sensor Monitoring & Servo Control System
 */

const FirebaseService = {
  isInitialized: false,
  isConnected: false,
  db: null,
  currentListenerRef: null,
  connectionRef: null,

  listeners: {
    reading: [],
    history: [],
    events: [],
    connectionChange: []
  },

  /**
   * Initializes Firebase Realtime Database client
   */
  init() {
    const config = AppConfig.get();

    if (!AppConfig.isFirebaseConfigured()) {
      console.log("Firebase credentials are placeholders. System will run in Demo Mode.");
      this.isInitialized = false;
      return false;
    }

    try {
      if (typeof firebase === "undefined") {
        console.error("Firebase SDK not loaded. Ensure firebase-app-compat.js and firebase-database-compat.js CDN scripts are included.");
        return false;
      }

      // Initialize or get existing app
      let app;
      if (!firebase.apps.length) {
        app = firebase.initializeApp(config.firebase);
      } else {
        app = firebase.app();
      }

      this.db = firebase.database(app);
      this.isInitialized = true;
      this.setupConnectionMonitoring();
      return true;
    } catch (err) {
      console.error("Failed to initialize Firebase app:", err);
      this.isInitialized = false;
      return false;
    }
  },

  /**
   * Monitors the special `.info/connected` Firebase RTDB path
   */
  setupConnectionMonitoring() {
    if (!this.db) return;

    try {
      this.connectionRef = this.db.ref(".info/connected");
      this.connectionRef.on("value", snapshot => {
        const connected = snapshot.val() === true;
        this.isConnected = connected;
        this.notifyConnectionChange(connected);
      });
    } catch (err) {
      console.warn("Could not attach .info/connected listener", err);
    }
  },

  /**
   * Starts listening to current live sensor data for the target device
   */
  subscribeToCurrentReadings(deviceId) {
    if (!this.isInitialized || !this.db) {
      return false;
    }

    const targetDevice = deviceId || AppConfig.get().deviceId;
    const path = `devices/${targetDevice}/current`;

    try {
      // Unsubscribe previous if any
      this.unsubscribe();

      this.currentListenerRef = this.db.ref(path);
      this.currentListenerRef.on(
        "value",
        snapshot => {
          const rawData = snapshot.val();
          if (rawData) {
            const sanitized = SensorCalculations.sanitizeRecord(rawData);
            if (sanitized) {
              this.notifyReading(sanitized);
            }
          }
        },
        error => {
          console.error(`Firebase error reading ${path}:`, error);
          this.notifyConnectionChange(false, error.message);
        }
      );
      return true;
    } catch (err) {
      console.error(`Error subscribing to Firebase path ${path}:`, err);
      return false;
    }
  },

  /**
   * Fetches historical readings for a given time window
   */
  async fetchHistory(deviceId, timeWindowMs = 24 * 60 * 60 * 1000) {
    if (!this.isInitialized || !this.db) {
      return [];
    }

    const targetDevice = deviceId || AppConfig.get().deviceId;
    const path = `devices/${targetDevice}/history`;
    const cutoff = Date.now() - timeWindowMs;

    try {
      // Query records ordered by timestamp
      const snapshot = await this.db.ref(path)
        .orderByChild("timestamp")
        .startAt(cutoff)
        .limitToLast(150)
        .once("value");

      const records = [];
      snapshot.forEach(child => {
        const item = child.val();
        const sanitized = SensorCalculations.sanitizeRecord(item);
        if (sanitized) {
          records.push(sanitized);
        }
      });

      return records;
    } catch (err) {
      console.error(`Error querying Firebase history at ${path}:`, err);
      return [];
    }
  },

  /**
   * Fetches logged events for the device
   */
  async fetchEvents(deviceId, limit = 50) {
    if (!this.isInitialized || !this.db) {
      return [];
    }

    const targetDevice = deviceId || AppConfig.get().deviceId;
    const path = `devices/${targetDevice}/events`;

    try {
      const snapshot = await this.db.ref(path)
        .orderByChild("timestamp")
        .limitToLast(limit)
        .once("value");

      const events = [];
      snapshot.forEach(child => {
        const item = child.val();
        if (item) {
          events.push({
            id: child.key,
            type: item.type || "INFO",
            title: item.title || item.type || "Device Event",
            description: item.description || "No description provided",
            value: item.value || "--",
            timestamp: item.timestamp || Date.now(),
            severity: item.severity || "info"
          });
        }
      });

      // Return reverse sorted (newest first)
      return events.reverse();
    } catch (err) {
      console.error(`Error querying Firebase events at ${path}:`, err);
      return [];
    }
  },

  /**
   * Unsubscribes from active listeners
   */
  unsubscribe() {
    if (this.currentListenerRef) {
      try {
        this.currentListenerRef.off();
      } catch (e) {
        console.warn("Error turning off currentListenerRef", e);
      }
      this.currentListenerRef = null;
    }
  },

  /**
   * Subscriptions for UI consumers
   */
  onReading(cb) { this.listeners.reading.push(cb); },
  onConnectionChange(cb) { this.listeners.connectionChange.push(cb); },

  notifyReading(record) {
    this.listeners.reading.forEach(cb => {
      try { cb(record); } catch (e) { console.error(e); }
    });
  },

  notifyConnectionChange(status, message = "") {
    this.listeners.connectionChange.forEach(cb => {
      try { cb(status, message); } catch (e) { console.error(e); }
    });
  }
};
