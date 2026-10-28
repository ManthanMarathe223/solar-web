/**
 * ============================================================================
 * ESP32 SENSOR MONITORING & AUTONOMOUS SERVO CONTROL FIRMWARE
 * College IoT Mini Project - Telemetry Transmission to Firebase RTDB
 * ============================================================================
 * 
 * Hardware Setup:
 * - Microcontroller: ESP32 Dev Module
 * - Temperature Sensor: LM35 (Linear Centigrade Analog Sensor)
 * - Light Sensor: LDR (Light Dependent Resistor in Voltage Divider)
 * - Actuators: 2x 5V Hobby Servos (SG90 / MG90S / MG996R)
 * 
 * CRITICAL ESP32 HARDWARE NOTE (ADC1 vs ADC2):
 * On the ESP32, ADC2 (GPIO 0, 2, 4, 12, 13, 14, 15, 25, 26, 27) CANNOT be used 
 * when Wi-Fi is active. Always connect LM35 and LDR to ADC1 pins:
 * Recommended ADC1 Pins: GPIO 32, 33, 34, 35, 36 (VP), 39 (VN).
 * 
 * Required Arduino Libraries (Install via Arduino Library Manager):
 * 1. ESP32 Servo by Kevin Harrington (or ESP32Servo by John K. Bennett)
 * 2. Firebase ESP32 Client by Mobizt (or standard HTTPClient)
 * 3. ArduinoJson by Benoit Blanchon (v6 or v7)
 * ============================================================================
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <ESP32Servo.h>
#include <ArduinoJson.h>

// ============================================================================
// 1. CONFIGURATION PLACEHOLDERS (Fill these in with your real credentials)
// ============================================================================

// Wi-Fi Credentials (NEVER share or commit these to public git repositories)
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Firebase Realtime Database Settings
// Example Database URL: "https://my-project-default-rtdb.firebaseio.com"
const char* FIREBASE_HOST = "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com";
const char* FIREBASE_AUTH = "YOUR_FIREBASE_DATABASE_SECRET_OR_WEB_API_KEY";

// Device Identifier (Matches website config)
const char* DEVICE_ID     = "ESP32_001";

// ============================================================================
// 2. GPIO PIN ASSIGNMENTS (Verify with your physical breadboard wiring)
// ============================================================================
// Use ADC1 pins for analog sensors to prevent Wi-Fi conflict:
const int PIN_LM35   = 34; // ADC1_CH6 (Input only pin, ideal for analog sensors)
const int PIN_LDR    = 35; // ADC1_CH7 (Input only pin, ideal for analog sensors)

// PWM Servo Pins:
const int PIN_SERVO1 = 18; // GPIO 18 (Primary / Azimuth axis)
const int PIN_SERVO2 = 19; // GPIO 19 (Secondary / Elevation axis)

// ============================================================================
// 3. SENSOR CALIBRATION CONSTANTS
// ============================================================================
const float ESP32_VREF_MV     = 3300.0; // 3.3V supply in millivolts
const float LM35_MV_PER_C     = 10.0;   // LM35 scale: 10 mV / °C
const int   ADC_RESOLUTION    = 4095;   // 12-bit ADC (0 to 4095)

// LDR Calibration (Adjust based on your ambient dark & bright readings)
const int   LDR_DARK_ADC      = 3800;   // ADC value when sensor is completely shadowed
const int   LDR_BRIGHT_ADC    = 350;    // ADC value in bright light
const bool  LDR_INVERT        = false;  // False = lower ADC is brighter (standard pull-down)

// Servo Objects
Servo servo1;
Servo servo2;

// ============================================================================
// 4. TIMING & NON-BLOCKING SCHEDULING (millis)
// ============================================================================
unsigned long lastLocalLoopMs      = 0;
const unsigned long LOCAL_LOOP_INTERVAL_MS = 50;  // 20 Hz fast sensor & servo control loop

unsigned long lastCurrentUploadMs  = 0;
const unsigned long CURRENT_UPLOAD_INTERVAL_MS = 3000; // Push latest reading every 3 sec

unsigned long lastHistoryUploadMs  = 0;
const unsigned long HISTORY_UPLOAD_INTERVAL_MS = 30000; // Save history log every 30 sec

// Sensor and Servo State Variables
float currentTemperatureC  = 25.0;
int   currentLdrRaw        = 2000;
int   currentLightPercent  = 50;
String currentLightCondition = "Moderate";
int   commandedServo1Angle = 90;
int   commandedServo2Angle = 45;

int   previousServo1Angle  = 90;
int   previousServo2Angle  = 45;
String previousCondition  = "Moderate";

// ============================================================================
// 5. HELPER: AVERAGE MULTI-SAMPLE ANALOG READ
// ============================================================================
int readAveragedAdc(int pin, int samples = 10) {
  long sum = 0;
  for (int i = 0; i < samples; i++) {
    sum += analogRead(pin);
    delayMicroseconds(100);
  }
  return (int)(sum / samples);
}

// ============================================================================
// 6. SENSOR CONVERSIONS
// ============================================================================
float calculateTemperature(int rawAdc) {
  // Convert ADC count to voltage in mV
  float voltageMv = ((float)rawAdc / (float)ADC_RESOLUTION) * ESP32_VREF_MV;
  // Convert mV to Celsius (10 mV per °C)
  float tempC = voltageMv / LM35_MV_PER_C;
  return tempC;
}

int calculateLightPercentage(int rawAdc) {
  float pct = 0.0;
  if (LDR_INVERT) {
    if (LDR_BRIGHT_ADC != LDR_DARK_ADC) {
      pct = ((float)(rawAdc - LDR_DARK_ADC) / (float)(LDR_BRIGHT_ADC - LDR_DARK_ADC)) * 100.0;
    }
  } else {
    if (LDR_DARK_ADC != LDR_BRIGHT_ADC) {
      pct = ((float)(LDR_DARK_ADC - rawAdc) / (float)(LDR_DARK_ADC - LDR_BRIGHT_ADC)) * 100.0;
    }
  }
  return constrain((int)round(pct), 0, 100);
}

String getLightCondition(int percentage) {
  if (percentage <= 30) return "Dark";
  if (percentage >= 70) return "Bright";
  return "Moderate";
}

// ============================================================================
// 7. AUTONOMOUS SERVO CONTROL LOGIC (RETAINED LOCALLY ON ESP32)
// ============================================================================
void executeAutonomousServoLogic(int lightPct) {
  // Example light tracking mapping:
  // In your project, replace or fine-tune this with your existing algorithm.
  // Servo 1 (Azimuth / Horizontal): moves between 30° and 150° based on light tracking
  commandedServo1Angle = map(lightPct, 0, 100, 30, 150);
  commandedServo1Angle = constrain(commandedServo1Angle, 0, 180);

  // Servo 2 (Elevation / Tilt): tilts upward towards bright light (20° to 85°)
  commandedServo2Angle = map(lightPct, 0, 100, 20, 85);
  commandedServo2Angle = constrain(commandedServo2Angle, 0, 180);

  // Send PWM command to servo motors
  servo1.write(commandedServo1Angle);
  servo2.write(commandedServo2Angle);
}

// ============================================================================
// 8. FIREBASE REST API TRANSMISSION (Clean, standard HTTPS REST without bloat)
// ============================================================================
void sendHttpPatch(const String& path, const String& jsonPayload) {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure(); // Skip SSL certificate verification for mini project convenience

  // Parse hostname from FIREBASE_HOST
  String host = FIREBASE_HOST;
  host.replace("https://", "");
  host.replace("http://", "");
  if (host.endsWith("/")) host.remove(host.length() - 1);

  if (!client.connect(host.c_str(), 443)) {
    Serial.println("[Firebase] HTTPS Connection failed");
    return;
  }

  String url = path + ".json";
  if (strlen(FIREBASE_AUTH) > 0 && String(FIREBASE_AUTH) != "YOUR_FIREBASE_DATABASE_SECRET_OR_WEB_API_KEY") {
    url += "?auth=" + String(FIREBASE_AUTH);
  }

  client.println("PATCH " + url + " HTTP/1.1");
  client.println("Host: " + host);
  client.println("Content-Type: application/json");
  client.println("Connection: close");
  client.print("Content-Length: ");
  client.println(jsonPayload.length());
  client.println();
  client.println(jsonPayload);

  // Read response status
  while (client.connected()) {
    String line = client.readStringUntil('\n');
    if (line == "\r") break;
  }
}

void sendHttpPost(const String& path, const String& jsonPayload) {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();

  String host = FIREBASE_HOST;
  host.replace("https://", "");
  host.replace("http://", "");
  if (host.endsWith("/")) host.remove(host.length() - 1);

  if (!client.connect(host.c_str(), 443)) return;

  String url = path + ".json";
  if (strlen(FIREBASE_AUTH) > 0 && String(FIREBASE_AUTH) != "YOUR_FIREBASE_DATABASE_SECRET_OR_WEB_API_KEY") {
    url += "?auth=" + String(FIREBASE_AUTH);
  }

  client.println("POST " + url + " HTTP/1.1");
  client.println("Host: " + host);
  client.println("Content-Type: application/json");
  client.println("Connection: close");
  client.print("Content-Length: ");
  client.println(jsonPayload.length());
  client.println();
  client.println(jsonPayload);
}

// ============================================================================
// 9. TELEMETRY CLOUD PUBLISHERS
// ============================================================================
void publishCurrentReading() {
  StaticJsonDocument<256> doc;
  doc["temperatureC"]    = serialized(String(currentTemperatureC, 1));
  doc["ldrRaw"]          = currentLdrRaw;
  doc["lightPercentage"] = currentLightPercent;
  doc["lightCondition"]  = currentLightCondition;
  doc["servo1Angle"]     = commandedServo1Angle;
  doc["servo2Angle"]     = commandedServo2Angle;
  doc["timestamp"]       = (unsigned long)(time(nullptr)); // Epoch time (or millis offset)

  String jsonStr;
  serializeJson(doc, jsonStr);

  String currentPath = "/devices/" + String(DEVICE_ID) + "/current";
  sendHttpPatch(currentPath, jsonStr);
  Serial.printf("[Cloud] Updated current telemetry: Temp=%.1f°C, LDR=%d, Light=%d%%, S1=%d°, S2=%d°\n",
                currentTemperatureC, currentLdrRaw, currentLightPercent, commandedServo1Angle, commandedServo2Angle);
}

void publishHistoricalRecord() {
  StaticJsonDocument<256> doc;
  doc["temperatureC"]    = serialized(String(currentTemperatureC, 1));
  doc["ldrRaw"]          = currentLdrRaw;
  doc["lightPercentage"] = currentLightPercent;
  doc["lightCondition"]  = currentLightCondition;
  doc["servo1Angle"]     = commandedServo1Angle;
  doc["servo2Angle"]     = commandedServo2Angle;
  doc["timestamp"]       = (unsigned long)(time(nullptr));

  String jsonStr;
  serializeJson(doc, jsonStr);

  String historyPath = "/devices/" + String(DEVICE_ID) + "/history";
  sendHttpPost(historyPath, jsonStr);
  Serial.println("[Cloud] Logged historical record.");
}

void publishEvent(const String& type, const String& title, const String& description, const String& value, const String& severity) {
  StaticJsonDocument<256> doc;
  doc["type"]        = type;
  doc["title"]       = title;
  doc["description"] = description;
  doc["value"]       = value;
  doc["severity"]    = severity;
  doc["timestamp"]   = (unsigned long)(time(nullptr));

  String jsonStr;
  serializeJson(doc, jsonStr);

  String eventPath = "/devices/" + String(DEVICE_ID) + "/events";
  sendHttpPost(eventPath, jsonStr);
  Serial.println("[Cloud] Logged device event: " + title);
}

// ============================================================================
// 10. SETUP & INITIALIZATION
// ============================================================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n--- ESP32 IoT Sensor & Servo Control System Initializing ---");

  // Configure ADC resolution
  analogReadResolution(12); // 12-bit (0 - 4095)

  // Attach Servos
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  servo1.setPeriodHertz(50); // Standard 50Hz servo
  servo2.setPeriodHertz(50);
  servo1.attach(PIN_SERVO1, 500, 2400); // Standard microsecond pulse bounds
  servo2.attach(PIN_SERVO2, 500, 2400);

  // Set default initial servo position (e.g. Center 90° & 45°)
  servo1.write(90);
  servo2.write(45);

  // Initialize Wi-Fi connection in Station Mode (Non-blocking retry)
  Serial.printf("Connecting to Wi-Fi: %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[Wi-Fi] Connected! Local IP: %s\n", WiFi.localIP().toString().c_str());
    // Configure NTP time for accurate timestamps
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
    publishEvent("DEVICE_ONLINE", "Device Online", "ESP32 powered on and connected to Wi-Fi", "Online", "info");
  } else {
    Serial.println("\n[Wi-Fi] Not connected. Proceeding with local autonomous control.");
  }
}

// ============================================================================
// 11. MAIN LOOP (NON-BLOCKING)
// ============================================================================
void loop() {
  unsigned long currentMs = millis();

  // Task 1: Fast Local Sensor Reading & Servo Control (Every 50 ms)
  // This continues even if Wi-Fi is lost, ensuring servos operate smoothly.
  if (currentMs - lastLocalLoopMs >= LOCAL_LOOP_INTERVAL_MS) {
    lastLocalLoopMs = currentMs;

    // Read Sensors
    currentLdrRaw = readAveragedAdc(PIN_LDR, 8);
    int rawLm35Adc = readAveragedAdc(PIN_LM35, 10);

    // Compute Physical Values
    currentTemperatureC = calculateTemperature(rawLm35Adc);
    currentLightPercent = calculateLightPercentage(currentLdrRaw);
    currentLightCondition = getLightCondition(currentLightPercent);

    // Execute Autonomous Servo Control
    executeAutonomousServoLogic(currentLightPercent);

    // Detect Meaningful State Transitions for Event Logging
    if (currentLightCondition != previousCondition) {
      publishEvent("LIGHT_CONDITION_CHANGED", 
                   "Light Condition Transition", 
                   "Ambient light changed from " + previousCondition + " to " + currentLightCondition, 
                   currentLightCondition + " (" + String(currentLightPercent) + "%)", 
                   currentLightCondition == "Bright" ? "warning" : "info");
      previousCondition = currentLightCondition;
    }

    if (abs(commandedServo1Angle - previousServo1Angle) >= 20) {
      publishEvent("SERVO1_COMMANDED_CHANGE", 
                   "Servo 1 Repositioned", 
                   "Azimuth angle commanded to " + String(commandedServo1Angle) + "°", 
                   String(commandedServo1Angle) + "°", 
                   "info");
      previousServo1Angle = commandedServo1Angle;
    }
  }

  // Task 2: Publish Current Telemetry to Firebase RTDB (Every 3 seconds)
  if (WiFi.status() == WL_CONNECTED && (currentMs - lastCurrentUploadMs >= CURRENT_UPLOAD_INTERVAL_MS)) {
    lastCurrentUploadMs = currentMs;
    publishCurrentReading();
  }

  // Task 3: Publish Historical Record to Firebase RTDB (Every 30 seconds)
  if (WiFi.status() == WL_CONNECTED && (currentMs - lastHistoryUploadMs >= HISTORY_UPLOAD_INTERVAL_MS)) {
    lastHistoryUploadMs = currentMs;
    publishHistoricalRecord();
  }
}
