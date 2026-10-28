# IoT Sensor Monitoring & Servo Control System

A modern, responsive, dark-navy IoT monitoring dashboard designed for an **ESP32 microcontroller** paired with an **LM35 analog temperature sensor**, an **LDR (Light Dependent Resistor)**, and **two servo motors**.

The website provides real-time telemetry visualization, interactive charts, sensor physics deep dives, commanded servo angle tracking, event logging, and an integrated **Demo Mode** for standalone testing prior to hardware integration.

---

## 1. Project Overview

This project was built for a college IoT mini project. The architecture consists of two cleanly separated layers:

1. **Hardware / Microcontroller Layer (ESP32)**:
   - Reads ambient temperature from an **LM35** analog sensor ($10\text{ mV/°C}$).
   - Reads ambient light intensity from an **LDR** voltage divider.
   - Executes autonomous tracking and positioning logic for **two servo motors**.
   - Serves as the primary controller: all motor-control algorithms stay local to the ESP32.
   - Transmits telemetry packets to the cloud over Wi-Fi.

2. **Web Monitoring Dashboard (HTML5, CSS3, Vanilla JavaScript, Chart.js, Firebase RTDB)**:
   - **Read-Only Monitoring System**: Displays telemetry without remote-control buttons, ensuring the microcontroller maintains safe, uninterrupted autonomous control.
   - **Dual Operating Modes**:
     - **Demo Mode**: Generates physically realistic sensor cycles and commanded movements in browser memory without touching cloud databases.
     - **Live Mode**: Subscribes directly to Firebase Realtime Database for instantaneous live synchronization.
   - **Stale Data Protection**: Visually flags readings if no packets arrive within a configurable threshold (e.g., 60 seconds), preventing outdated readings from being mistaken for live data.

---

## 2. Hardware Component List

| Component | Model / Specification | Purpose |
| :--- | :--- | :--- |
| **Microcontroller** | ESP32-WROOM-32 Dev Module | Core processing, ADC conversion, Wi-Fi telemetry |
| **Temperature Sensor** | LM35 DZ | Precision Centigrade Temperature Sensor ($10\text{ mV/°C}$) |
| **Light Sensor** | LDR (Cadmium Sulfide CdS, 5mm) | Analog Light-Dependent Resistor in voltage divider |
| **Actuators** | 2x Micro Servo Motors (SG90 / MG90S) | Dual-axis movement (Azimuth & Elevation tracking) |
| **Fixed Resistors** | $10\text{ k}\Omega$ (for LDR divider) | Converts LDR resistance changes to measurable voltage |
| **Prototyping** | Half-size Breadboard + Jumper Wires | Solderless hardware interconnections |
| **Power Supply** | 5V USB (or external 5V 2A adapter for servos) | Powers ESP32 and provides servo drive current |

> [!IMPORTANT]
> **Power Supply Tip:** Two hobby servos can draw upwards of $500\text{ mA} - 1\text{ A}$ under motion. Powering the servos from the ESP32 $3.3\text{V}$ pin will cause the ESP32 to brown out and reset. Connect the servo power wires ($V_{CC}$) to an external $5\text{V}$ rail with a common ground connected to the ESP32 GND.

---

## 3. Technology Stack

- **Frontend Core**: Standard HTML5, CSS3, and modern Vanilla JavaScript (ES6+). Zero build steps, zero complex bundlers (no React or Node server required).
- **Charts & Data Visualization**: [Chart.js](https://www.chartjs.org/) v4.4 via CDN.
- **Cloud Database**: [Firebase Realtime Database](https://firebase.google.com/products/realtime-database) via Firebase Compat SDK v10.8 CDN (also compatible with direct HTTPS REST API).
- **Styling Architecture**: Custom Dark Navy Design System utilizing CSS Variables, responsive CSS Grid, and Flexbox.
- **Embedded Firmware**: ESP32 C++ programmed with the **Arduino IDE**.
- **Deployment**: Ready for instant zero-configuration deployment to **Vercel** or **Netlify**.

---

## 4. Project Folder Structure

```text
d:\solar_web\
├── index.html                           # Single-Page Application dashboard shell
├── vercel.json                          # Vercel deployment configuration
├── netlify.toml                         # Netlify deployment configuration
├── README.md                            # Comprehensive project guide & documentation
├── HARDWARE_INTEGRATION.md              # Detailed ESP32 Arduino IDE integration manual
│
├── css/
│   ├── variables.css                    # Visual design system (navy colors, fonts, shadows)
│   └── styles.css                       # Layouts, cards, gauges, tables, and modal dialogs
│
├── js/
│   ├── config.js                        # Configuration store, localStorage persistence & defaults
│   ├── sensor-calculations.js           # LM35 math, LDR percentage calibration, formatters
│   ├── demo-service.js                  # Realistic in-memory telemetry simulation engine
│   ├── firebase-service.js              # Real-time Firebase RTDB synchronization service
│   ├── charts-manager.js                # Chart.js initialization, dual-axis correlation charts
│   └── app.js                           # Master application controller and view router
│
└── firmware/
    └── esp32_sensor_servo_monitor.ino   # Non-blocking, fully commented Arduino sketch
```

---

## 5. Website Architecture & Pages

The dashboard is structured as a Single-Page Application (SPA) with 5 dedicated functional views:

### Page 1: Main Dashboard (`#view-dashboard`)
- **Device Header**: Displays device name (`ESP32_001`), connection status badge, humanized time elapsed ("Updated 3s ago"), and quick mode toggling.
- **Card A (Temperature)**: Centigrade reading from the LM35, scaled progress bar ($0 - 50\text{°C}$), thermal trend indicator ($\blacktriangle$ Rising, $\blacktriangledown$ Falling, $\bullet$ Steady), and latest timestamp.
- **Card B (LDR Raw ADC)**: Displays raw 12-bit ADC count ($0 - 4095$), equivalent analog voltage ($0 - 3.3\text{V}$), and range indicator.
- **Card C (Light Intensity)**: Calibrated relative brightness percentage ($0 - 100\%$), light condition pill (`Dark`, `Moderate`, `Bright`), and calibration notice.
- **Card D (Servo 1 Commanded Angle)**: Custom SVG semi-circular dial gauge with an animated needle pointing between $0\text{°}$ and $180\text{°}$, angle readout, and step delta.
- **Card E (Servo 2 Commanded Angle)**: Custom SVG semi-circular dial gauge with animated needle pointing between $0\text{°}$ and $180\text{°}$ for the secondary axis.
- **Card F (Device Status)**: Link state, transmission protocol, stale timeout configuration, and timestamp.

### Page 2: Sensor Analytics (`#view-analytics`)
- Filter bar for **1 Hour**, **6 Hours**, **24 Hours**, and **7 Days**.
- 5 individual time-series charts (Temperature, LDR Raw, Light %, Servo 1, Servo 2).
- **Combined Correlation Chart**: Full-width dual Y-axis chart correlating ambient light percentage on the Left Y-Axis ($0 - 100\%$) directly against both commanded servo angles on the Right Y-Axis ($0 - 180\text{°}$).

### Page 3: Sensor Details (`#view-details`)
- **LM35 Deep-Dive**: Live min, max, average, and current temperature statistics; mathematical formula breakdown ($V_{out} = 10\text{ mV/°C}$); and ESP32 ADC non-linearity discussion.
- **LDR Deep-Dive**: Live ADC statistics; voltage divider formula; and a scientific disclaimer explaining why photoresistors measure relative brightness rather than calibrated Lux.

### Page 4: Servo Movement History (`#view-servo`)
- Summary counters and hobby servo open-loop PWM explanation.
- Chronological step plot chart of motor transitions.
- Filterable data table displaying timestamps, commanded angles, associated LDR reading, light percentage, condition, and step deltas.
- **Export Telemetry CSV Button**: Downloads recorded telemetry as a `.csv` spreadsheet for college lab reports.

### Page 5: Event Logs (`#view-events`)
- Color-coded chronological audit trail of significant device events:
  - `LIGHT_CONDITION_CHANGED`: Ambient lighting transitions (e.g., Moderate $\rightarrow$ Bright).
  - `SERVO1_COMMANDED_CHANGE`: Commanded angle steps $\ge 15\text{°}$.
  - `TEMP_THRESHOLD_EXCEEDED`: Thermal warning triggers.
  - `DEVICE_ONLINE`: System startup and Wi-Fi link confirmations.

---

## 6. How to Run Locally

Because the project uses standard HTML, CSS, and Vanilla JavaScript, it does not require complex build steps or compiler tools.

### Option A: Using Python (Recommended & Simplest)
1. Open PowerShell or a terminal in the project directory:
   ```powershell
   cd d:\solar_web
   ```
2. Start the built-in HTTP server:
   ```powershell
   python -m http.server 8080
   ```
3. Open your web browser and navigate to:
   ```text
   http://127.0.0.1:8080
   ```

### Option B: Using Node.js
If you prefer Node:
```powershell
npx serve d:\solar_web
```

### Option C: Using VS Code Live Server
1. Open `d:\solar_web` in Visual Studio Code.
2. Install the **Live Server** extension by Ritwick Dey.
3. Right-click `index.html` and select **"Open with Live Server"**.

---

## 7. How Demo Mode Works

When you first load the website, **Demo Mode is enabled by default**:
- The header displays a bright magenta badge: `● DEMO MODE`.
- A top banner indicates that simulated readings are active.
- The `DemoService` simulates realistic ambient light cycles, sinusoidal daily thermal curves, and responsive servo tracking.
- Historical data and state-change events are generated in browser memory.
- **Safety guarantee:** Demo Mode never makes write calls to your Firebase database or misrepresents simulated data as hardware data.

---

## 8. Final Firebase Realtime Database Schema

The database path structure is organized as follows:

```text
devices/
  {deviceId}/               <-- e.g. "ESP32_001"
    current/                <-- Overwritten with the latest live packet (PATCH)
      temperatureC: 28.5    (number, Celsius)
      ldrRaw: 1820          (number, 12-bit ADC count 0-4095)
      lightPercentage: 62   (number, 0-100%)
      lightCondition: "Moderate" (string: "Dark" | "Moderate" | "Bright")
      servo1Angle: 90       (number, 0-180 degrees)
      servo2Angle: 45       (number, 0-180 degrees)
      timestamp: 1792674000 (number, Unix timestamp in seconds or milliseconds)

    history/                <-- Chronological append-only records (POST / push)
      -Nxyz123abc456/
        temperatureC: 28.5
        ldrRaw: 1820
        lightPercentage: 62
        lightCondition: "Moderate"
        servo1Angle: 90
        servo2Angle: 45
        timestamp: 1792674000

    events/                 <-- State change notifications (POST / push)
      -Nxyz789def012/
        type: "LIGHT_CONDITION_CHANGED"
        title: "Light Condition Transition"
        description: "Ambient light transitioned to Bright"
        value: "Bright (74%)"
        severity: "warning"
        timestamp: 1792674000
```

---

## 9. Setting Up Firebase Realtime Database

Follow these steps to set up your free Google Firebase database:

1. **Create a Firebase Project**:
   - Navigate to the [Firebase Console](https://console.firebase.google.com/).
   - Click **Add Project**, enter a name (e.g., `solar-iot-monitor`), and proceed (Google Analytics is optional).

2. **Register the Web Application**:
   - In Project Overview, click the **Web icon** (`</>`).
   - Enter an App Nickname (e.g., `IoT Dashboard`).
   - Copy the `firebaseConfig` object containing `apiKey`, `authDomain`, `projectId`, and `databaseURL`.

3. **Create the Realtime Database**:
   - In the left sidebar, click **Build** $\rightarrow$ **Realtime Database**.
   - Click **Create Database**, select a region (e.g., United States or Singapore), and choose **Start in test mode** for initial testing.

4. **Configure Secure Database Rules**:
   - Click the **Rules** tab in Realtime Database.
   - For this monitoring project, the web dashboard requires **read** permission. The ESP32 requires **write** permission.
   - Apply these rules:
   ```json
   {
     "rules": {
       "devices": {
         "$deviceId": {
           ".read": true,
           ".write": "auth != null || request.auth != null"
         }
       }
     }
   }
   ```
   > [!NOTE]
   > For initial bench testing before configuring authentication tokens on the ESP32, you can temporarily allow writes with a time-limited rule:
   > `".write": "now < 1795000000000"` (adjust timestamp to your semester deadline).

5. **Enter Credentials in the Website**:
   - In the web dashboard, click the **Settings icon** ($\text{⚙}$) in the top right.
   - Enter your `Realtime Database URL`, `API Key`, `Project ID`, and `Device Identifier` (`ESP32_001`).
   - Click **Save Settings**.
   - Click **Switch Mode** to transition from Demo Mode to Live Mode!

---

## 10. Deploying to Vercel or Netlify

The repository includes pre-configured `vercel.json` and `netlify.toml` files.

### Deploying on Vercel:
1. Push your project to GitHub (ensure your personal Wi-Fi password in the Arduino code is **not** committed).
2. Visit [Vercel](https://vercel.com/) and click **Add New** $\rightarrow$ **Project**.
3. Import your GitHub repository.
4. Leave Build Settings blank (it is a static site).
5. Click **Deploy**. Vercel will provide an instant public HTTPS URL (e.g., `https://solar-iot-monitor.vercel.app`).

### Deploying on Netlify:
1. Visit [Netlify](https://www.netlify.com/).
2. Drag and drop the `solar_web` folder directly into the Netlify Drop box, or connect your Git repository.
3. Your dashboard will be live within seconds.

---

## 11. Troubleshooting Common Issues

| Issue | Root Cause | Solution |
| :--- | :--- | :--- |
| **"Live Mode: Could not connect to Firebase"** | Database URL or API Key missing or invalid | Open Settings ($\text{⚙}$) and check that the Database URL starts with `https://` and matches your Firebase console. |
| **"Data is stale" warning banner appears** | ESP32 is powered off or lost Wi-Fi | Check ESP32 Serial Monitor ($115200$ baud) to verify that the ESP32 is connected to your Wi-Fi router. |
| **Servo Jitter or ESP32 resets unexpectedly** | Servos drawing too much current from ESP32 board | Power servos from an external $5\text{V}$ power supply. Tie ESP32 GND and external power GND together. |
| **LDR readings do not change** | Incorrect ADC pin or wiring mistake in voltage divider | Use ADC1 pins (GPIO 32, 33, 34, 35, 36, 39). Ensure fixed resistor is $10\text{ k}\Omega$. |
| **Temperature reads 0°C or erratic values** | LM35 pin connected to ADC2 | ADC2 cannot be used when Wi-Fi is active. Move LM35 pin to GPIO 34 or 35 (ADC1). |

---

## 12. License & Author Information

- Developed as a College IoT Mini Project.
- Designed for academic and demonstration purposes.
- Free to modify, adapt, and expand for further research.
