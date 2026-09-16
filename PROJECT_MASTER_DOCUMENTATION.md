# =============================================================================
# PROJECT MASTER SPECIFICATION & ARCHITECTURE DOCUMENT
# Project Name: Smart AI Two-Wheeler Black Box & Life-Saving Telematics (Accidiox)
# Event: KAYA Buildathon, IIT (BHU) Varanasi (Problem Statement 01: Open Innovation)
# =============================================================================

## 1. EXECUTIVE SUMMARY & PROBLEM STATEMENT
Every year, over 70,000 two-wheeler riders lose their lives in India due to delayed medical intervention after severe road accidents (the critical Golden Hour). Unlike modern 4-wheelers equipped with eCall and airbag telemetry, standard two-wheelers lack automated crash detection and emergency dispatch systems.

Smart AI Accidiox is an industrial-grade, aerospace-inspired Two-Wheeler Black Box and Telematics System. It continuously analyzes 3D motion kinematics, detects rollovers and crashes (>85° true ground fall), provides a 20-second false-alarm cancellation safety window, and automatically dispatches rich emergency alerts containing live GPS coordinates, reverse-geocoded road addresses, and nearest hospital/police contacts to emergency services and family contacts.

---

## 2. SYSTEM ARCHITECTURE & COMPONENTS USED

### A. HARDWARE COMPONENTS (ON-BIKE ECU)
1. Microcontroller: ESP32 Dev Module (Dual-core 240MHz, 2.4GHz Wi-Fi & Bluetooth 4.2 BLE)
2. Motion & Kinematics Sensor: MPU-6050 6-Axis Inertial Measurement Unit (I2C interface on GPIO 21 SDA, GPIO 22 SCL)
3. Audible Alarm Actuator: Active Piezo Buzzer (Dedicated DC drive on GPIO 4)
4. Visual Strobe Actuator: High-Intensity Hazard Red LED (Driven via GPIO 19 with current limiting resistor)
5. Handlebar Remote Control: 3-Button Switch Array with Internal Pull-Ups:
   - Button 1 (GPIO 32): Volume Up / Next Media Track
   - Button 2 (GPIO 33): Play/Pause / Dismiss & Cancel Crash Alarm
   - Button 3 (GPIO 25): Volume Down / Previous Media Track / Manual SOS
6. Standalone 4G Cellular Option (Self-Contained Module):
   - SIMCOM A7670C / SIM7600 4G LTE GNSS module connected via ESP32 Hardware Serial 2 (GPIO 16 RX, GPIO 17 TX) for autonomous SMS & calling when the rider's phone is powered off.

### B. WHAT WE ARE NOT USING (DESIGN DECISIONS)
- NO Power-Draining On-Handlebar OLED / LCD Screen: Screen display was removed from the handlebar to eliminate rider distraction, prevent battery drain, and lower commercial manufacturing costs. Visual feedback is managed via the smartphone dashboard and the 3 tactile handlebar buttons.
- NO Unstable Gyro Drift Algorithms: We do not rely on standard integrated gyro angles (which suffer from zero-rate drift over time). We use an aerospace 3D Gravity Vector Dot Product algorithm with 100% zero drift.

---

## 3. FIRMWARE & SENSING ALGORITHMS (ESP32)

### A. 3D Vector Dot Product Rollover Detection (0° to 180° Monotonic)
- Formula: theta = arccos(u_current . u_rest) * (180 / PI)
- Boot Auto-Calibration: On power-up, the firmware samples the resting gravity vector (rest_ax, rest_ay, rest_az) and sets that position to 0.0°.
- Omnidirectional Lean Detection: Measures deviation continuously from 0.0° up to 180.0° without quadrant wrapping or sudden signal drop-offs.
- Crash Threshold: Triggered strictly when tilt deviation >= 85.0° (flat on the ground fall).
- Auto Recovery: Disarms automatically back to NORMAL when the vehicle is returned upright (< 55.0°).

### B. BLE GATT Telemetry Server
- Service UUID: 4fafc201-1fb5-459e-8fcc-c5c9c331914b
- Characteristic UUID: beb5483e-36e1-4688-b7f5-ea07361b26a8 (Read + Notify)
- Payload Format (CSV every 100ms): STATUS,ROLL,PITCH,TILT
  - Examples: NORMAL,0.0,0.0,0.0 | CRASH,88.2,88.2,88.2 | BTN_UP,0.0,0.0,0.0

---

## 4. SOFTWARE & TELEMATICS WEB DASHBOARD

### A. Core Technologies
- Frontend: Modern Vanilla HTML5, CSS3 (Automotive Dark Glassmorphism, Zero Emojis, Tier-1 OEM Styling), Vanilla JavaScript (ES6+).
- Connectivity: Web Bluetooth API (GATT Client with automatic reconnect).
- Geolocation & Reverse-Geocoding:
  - HTML5 Geolocation API (High-Accuracy GPS coordinates).
  - OpenStreetMap Nominatim API: Resolves lat/lon into human-readable street, district, and city names.
  - Overpass API: Queries nearby hospitals, trauma centers, and police stations in real-time.
- Audio Synthesis: Web Audio API (Multi-frequency siren oscillator that sounds through phone speakers).
- Backend & Storage: PHP REST APIs + MySQL Database running locally on XAMPP (Port 3307, database: 	wo_wheeler_blackbox).
- Administrative Portal: dmin.html with interactive Leaflet.js map for fleet incident investigation.

### B. 20-Second Safety Rescue Protocol
1. Instant Trigger: When ESP32 broadcasts CRASH (or tilt >= 85.0°), the mobile dashboard triggers the emergency state.
2. 20-Second Countdown HUD: A high-visibility countdown modal appears and the emergency audio siren sounds.
3. False Alarm Dismissal: The rider can tap Cancel Emergency on screen or press Button 2 (GPIO 33) on the handlebar remote.
4. Auto-Dispatch: If the timer reaches 0 (rider is unconscious), the system formats and triggers an SOS dispatch via WhatsApp / SMS containing:
   - Alert Header & Rider Identification.
   - Exact Google Maps Pin Link (https://maps.google.com/?q=LAT,LON).
   - Street Address & Landmark.
   - Crash Speed & Kinematics.
   - Direct Contact for the Nearest Emergency Hospital.

---

## 5. PINOUT & WIRING MATRIX

| Component | ESP32 GPIO | Interface / Mode | Notes |
| :--- | :--- | :--- | :--- |
| MPU-6050 SDA | GPIO 21 | I2C Data | 100kHz standard bus clock |
| MPU-6050 SCL | GPIO 22 | I2C Clock | 100kHz standard bus clock |
| Active Buzzer | GPIO 4 | Digital Output | Direct DC drive (HIGH = Sound ON) |
| Hazard Red LED | GPIO 19 | Digital Output | High-frequency strobe (200ms period) |
| Remote Button 1 | GPIO 32 | INPUT_PULLUP | Connected to GND (Vol+ / Next) |
| Remote Button 2 | GPIO 33 | INPUT_PULLUP | Connected to GND (Play/Pause / Cancel) |
| Remote Button 3 | GPIO 25 | INPUT_PULLUP | Connected to GND (Vol- / Prev / SOS) |
| Power Supply | VIN / 3V3 / GND | Power | 5V USB / 3.3V LDO regulator |
| Standalone 4G GSM | GPIO 16 (RX2), 17 (TX2) | UART (115200 baud) | SIM7600 / A7670C (Optional Autonomous) |

---

## 6. COMPLETE FILE TREE & DIRECTORY STRUCTURE
- esp32_blackbox_industrial/esp32_blackbox_industrial.ino: Production ESP32 firmware with zero-drift 3D vector math, 85° crash threshold, and 3-button handling.
- lackbox_gsm_standalone/: Autonomous 4G LTE + GPS firmware for phone-independent dispatch.
- web_app/ (Deployed to C:\xampp\htdocs\blackbox\):
  - index.html: Clean automotive telematics cockpit dashboard.
  - dmin.html: Incident Investigation Portal with Leaflet.js interactive maps.
  - css/style.css: Professional automotive dark UI styling.
  - js/bluetooth.js: Web Bluetooth GATT connection manager with auto-reconnect.
  - js/app.js: Telematics controller, Nominatim geocoder, emergency countdown, and REST sync.
  - pi/db_config.php, pi/log_accident.php, pi/get_logs.php: Backend logging endpoints.
  - database.sql: MySQL schema.
- KAYA_IIT_Varanasi_10_Slide_Deck.doc: Presentation slide deck outline.
- KAYA_IIT_Varanasi_Video_Script.doc: 5-minute video pitch and demonstration script.
- PROJECT_MASTER_DOCUMENTATION.md: This comprehensive specification document.

=============================================================================