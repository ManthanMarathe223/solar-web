# Hardware Integration Guide: ESP32 to Firebase Realtime Database

This guide explains how to merge the cloud telemetry structure with your existing Arduino IDE project for the ESP32 microcontroller, LM35 temperature sensor, LDR light sensor, and two servo motors.

---

## 1. Safety and Security Notice

> [!WARNING]
> **Private Credentials Protection:**
> Never commit your Wi-Fi password or Firebase database secret to GitHub or any public code repository.
> In your Arduino IDE project, keep your credentials in a separate `secrets.h` header file and add `secrets.h` to your `.gitignore` file.

---

## 2. Required Arduino IDE Libraries

Before uploading your sketch to the ESP32, install these libraries using the **Arduino IDE Library Manager** (`Sketch` $\rightarrow$ `Include Library` $\rightarrow$ `Manage Libraries...` or `Ctrl + Shift + I`):

1. **ESP32Servo** (by Kevin Harrington or John K. Bennett)
   - *Purpose*: Provides hardware PWM servo pulse generation for the ESP32 without timer conflicts.
   - *Search term*: `ESP32Servo`
2. **ArduinoJson** (by Benoit Blanchon, Version 6.x or 7.x)
   - *Purpose*: Efficient serialization of sensor telemetry into JSON packets.
   - *Search term*: `ArduinoJson`
3. **WiFi & WiFiClientSecure** (Built into the official ESP32 Arduino Board Package)
   - *Purpose*: Establishes Wi-Fi connectivity and secure HTTPS connections to Firebase.

---

## 3. ESP32 Pin Selection Rules (ADC1 vs ADC2)

This is the single most common source of failure in ESP32 IoT projects:

```
+----------------------------------------------------------------------------+
|                          CRITICAL ESP32 ADC RULE                           |
+----------------------------------------------------------------------------+
|  The ESP32 has two separate Analog-to-Digital Converters:                  |
|                                                                            |
|  1. ADC1 (Pins 32, 33, 34, 35, 36/VP, 39/VN)                               |
|     --> CAN be read at ANY time, even while Wi-Fi is actively streaming.   |
|                                                                            |
|  2. ADC2 (Pins 0, 2, 4, 12, 13, 14, 15, 25, 26, 27)                        |
|     --> SHARED with the Wi-Fi hardware peripheral.                         |
|     --> CANNOT be read when Wi-Fi is running! analogRead() will return     |
|         0 or garbage values whenever Wi-Fi is active.                      |
+----------------------------------------------------------------------------+
```

### Recommended Safe Pin Assignments:
- **LM35 Vout (Analog Input)**: `GPIO 34` (ADC1 Channel 6, Input-only)
- **LDR Voltage Divider (Analog Input)**: `GPIO 35` (ADC1 Channel 7, Input-only)
- **Servo Motor 1 Signal (PWM)**: `GPIO 18` (Digital Output)
- **Servo Motor 2 Signal (PWM)**: `GPIO 19` (Digital Output)

---

## 4. Breadboard Wiring Diagram & Schematic

### A. LM35 Temperature Sensor Wiring
Looking at the **flat front face** of the LM35 (leads pointing downwards):
- **Pin 1 (Left)**: $V_{CC} \rightarrow$ Connect to ESP32 $3.3\text{V}$ or $5\text{V}$ pin.
- **Pin 2 (Center)**: $V_{OUT} \rightarrow$ Connect to ESP32 `GPIO 34`.
- **Pin 3 (Right)**: $\text{GND} \rightarrow$ Connect to ESP32 `GND`.

### B. LDR (Light Dependent Resistor) Voltage Divider
- One leg of the LDR connects to $3.3\text{V}$.
- The other leg of the LDR connects to `GPIO 35` **AND** to one leg of a $10\text{ k}\Omega$ resistor.
- The other leg of the $10\text{ k}\Omega$ resistor connects to `GND`.

### C. Servo Motors (SG90 / MG90S)
- **Brown Wire**: Ground $\rightarrow$ Connect to Common `GND`.
- **Red Wire**: Power ($5\text{V}$) $\rightarrow$ Connect to external $5\text{V}$ power rail.
- **Orange Wire (Servo 1)**: Signal $\rightarrow$ Connect to ESP32 `GPIO 18`.
- **Orange Wire (Servo 2)**: Signal $\rightarrow$ Connect to ESP32 `GPIO 19`.

---

## 5. Telemetry JSON Fields Contract

The web dashboard and the ESP32 must agree on the exact JSON property names. Ensure your Arduino code uses these identical keys:

| Field Name | Data Type | Expected Range | Description |
| :--- | :--- | :--- | :--- |
| `temperatureC` | `float` (1 dec) | $-10.0$ to $100.0$ | Ambient temperature in Celsius from LM35 |
| `ldrRaw` | `integer` | $0$ to $4095$ | Raw 12-bit ADC reading from LDR divider |
| `lightPercentage` | `integer` | $0$ to $100$ | Relative brightness percentage |
| `lightCondition` | `string` | `"Dark"`, `"Moderate"`, `"Bright"` | Qualitative classification |
| `servo1Angle` | `integer` | $0$ to $180$ | Commanded target angle for Servo 1 |
| `servo2Angle` | `integer` | $0$ to $180$ | Commanded target angle for Servo 2 |
| `timestamp` | `unsigned long` | Unix epoch (seconds) | Timestamp provided by NTP `configTime()` |

---

## 6. How the ESP32 Communicates with Firebase

To keep your Arduino sketch simple, robust, and free of massive third-party library dependencies, the provided sketch in `firmware/esp32_sensor_servo_monitor.ino` communicates with Firebase using the **Firebase Realtime Database REST API**:

### 1. Current Live Reading (Updated every 3 seconds)
Sends an **HTTP PATCH** to:
```text
https://<FIREBASE_HOST>/devices/<DEVICE_ID>/current.json
```
Payload:
```json
{
  "temperatureC": 28.4,
  "ldrRaw": 1780,
  "lightPercentage": 64,
  "lightCondition": "Moderate",
  "servo1Angle": 90,
  "servo2Angle": 45,
  "timestamp": 1792674000
}
```

### 2. Historical Record (Logged every 30 seconds)
Sends an **HTTP POST** to:
```text
https://<FIREBASE_HOST>/devices/<DEVICE_ID>/history.json
```
Firebase automatically assigns a unique time-ordered push key (e.g., `-O1ab2cd3ef...`).

### 3. Meaningful Event Logs (Event-triggered)
Sends an **HTTP POST** to:
```text
https://<FIREBASE_HOST>/devices/<DEVICE_ID>/events.json
```
Fired only when:
- Ambient light changes category (e.g., Dark $\rightarrow$ Moderate).
- Servo commanded angle shifts by $\ge 15\text{°}$.
- Temperature crosses a configured threshold.
- The device boots up and joins the network.

---

## 7. Step-by-Step Hardware Integration Plan

### PHASE 1: Verify the Website Locally
1. Run `python -m http.server 8080` in `d:\solar_web`.
2. Open `http://127.0.0.1:8080` in your web browser.
3. Observe that Demo Mode is active, simulated readings are updating smoothly, dial gauges animate, and charts render historical data.
4. Export the sample CSV to confirm data export functionality.

### PHASE 2: Configure Firebase Realtime Database
1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com/).
2. Create a Realtime Database in test mode.
3. Note your Database URL (e.g., `https://my-iot-proj-default-rtdb.firebaseio.com`).
4. In the web dashboard, open Settings ($\text{⚙}$) and input your database URL and API key.
5. In the Firebase console, create a test record under `devices/ESP32_001/current`:
   ```json
   {
     "temperatureC": 29.1,
     "ldrRaw": 1600,
     "lightPercentage": 60,
     "lightCondition": "Moderate",
     "servo1Angle": 110,
     "servo2Angle": 50,
     "timestamp": 1792674100
   }
   ```
6. Switch the website to **Live Mode**. The dashboard should immediately update to reflect your test record.

### PHASE 3: Inspect and Merge Your Existing Arduino Code
1. Open your existing Arduino sketch.
2. Locate where you read the LM35 sensor:
   - Make sure it uses an **ADC1 pin** (e.g., GPIO 34).
   - Use multi-sample averaging (10 reads) to smooth out ADC noise.
3. Locate where you read the LDR sensor:
   - Ensure the voltage divider output is connected to an **ADC1 pin** (e.g., GPIO 35).
4. Preserve your existing servo control logic:
   - Keep your calculation that computes the target angles from light sensor inputs.
   - Record the calculated angle into variables `commandedServo1Angle` and `commandedServo2Angle`.
5. Incorporate non-blocking timers using `millis()` (see `firmware/esp32_sensor_servo_monitor.ino`) so that network uploads never stall the servo movement loop.

### PHASE 4: Connect the Physical ESP32
1. Flash the sketch from `firmware/esp32_sensor_servo_monitor.ino` to the ESP32.
2. Open the Arduino Serial Monitor at **115200 baud**.
3. Verify Wi-Fi connection output:
   ```text
   Connecting to Wi-Fi: MyHomeNetwork.....
   [Wi-Fi] Connected! Local IP: 192.168.1.45
   [Cloud] Logged device event: Device Online
   ```
4. Verify that live readings are logged to the Serial Monitor every 3 seconds.
5. Check your web dashboard: the status badge should turn green (`● LIVE MODE`) and the live temperature, LDR raw counts, light percentage, and servo dial gauges should update in real time.

### PHASE 5: Verify Historical Records & Events
1. Leave the ESP32 running for 2–3 minutes.
2. Switch to the **Sensor Analytics** tab on the website.
3. Switch between **1 Hour** and **24 Hours** filters to confirm that actual historical data points from Firebase are rendered on all 6 charts.
4. Cover the LDR with your hand or shine a flashlight onto it.
5. Verify that the **Event Logs** tab records a `LIGHT_CONDITION_CHANGED` entry.
6. Verify that the **Combined Correlation Chart** illustrates the servos responding to the sudden light change.

### PHASE 6: Deploy to Vercel or Netlify
1. Deploy the `solar_web` folder to Vercel or Netlify as detailed in `README.md`.
2. Open the resulting public URL on your smartphone or another computer.
3. Confirm that telemetry continues to update live over the public internet while the ESP32 is powered on.

---

## 8. Common Hardware Errors & How to Fix Them

| Symptom | Cause | Solution |
| :--- | :--- | :--- |
| **LM35 reading jumps wildly or reads 0°C** | 1. Connected to ADC2 pin.<br>2. Floating ground wire.<br>3. Soldered backwards. | 1. Move to GPIO 34 or 35 (ADC1).<br>2. Check that the ESP32 GND and sensor GND are firmly tied together.<br>3. Check the LM35 pinout: looking at the flat face, pins are $V_{CC}$, $V_{OUT}$, $\text{GND}$ from left to right. |
| **ESP32 reboots continuously when servos start moving** | Servos draw peak current exceeding the USB power rail capacity. | Power the servos from an external $5\text{V}$ power source ($2\text{A}$). Never draw heavy motor current directly from the ESP32 $3.3\text{V}$ pin! |
| **LDR percentage is 0% in bright light and 100% in the dark** | LDR and $10\text{ k}\Omega$ resistor are swapped in the divider. | In the website Settings modal, check **"Invert Polarity"**, or swap the positions of the LDR and fixed resistor on the breadboard. |
| **Wi-Fi keeps dropping or fails to connect** | Weak $2.4\text{ GHz}$ signal or attempting to connect to a $5\text{ GHz}$ network. | ESP32 only supports $2.4\text{ GHz}$ Wi-Fi bands. Ensure your router or mobile hotspot is broadcasting on $2.4\text{ GHz}$. |
