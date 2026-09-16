# 🏍️ Two-Wheeler Smart Black Box & Accident Detection System
### IIT Varanasi Edition — Web Mobile App & WAMP Database Setup

---

## 🏗 Project Architecture & Files
* **`index.html`**: Rider Mobile Telemetry HUD (Web Bluetooth connect, 3D top-down instrument cluster, smartphone GPS, 20-second safety countdown, cancel button, SOS triggers).
* **`admin.html`**: Incident Investigation & Analytics Portal (Interactive Leaflet map pinning accident locations, historical telemetry logs).
* **`js/bluetooth.js`**: Web Bluetooth Low Energy (BLE) interface communicating directly with ESP32 (`Bike-Blackbox-ESP32`).
* **`js/app.js`**: Main app controller, audio siren synthesizer, text-to-speech, GPS tracker, and WAMP database synchronization.
* **`api/db_config.php`**: MySQL database connection — gitignored (not in this repo). Copy `api/db_config.example.php` to `api/db_config.php` and fill in real values; on Hostinger, edit it directly on the server.
* **`api/log_accident.php`**: REST API to record accident incidents or false alarm cancellations.
* **`api/get_logs.php`**: REST API fetching recent accident records for the investigation dashboard.
* **`database.sql`**: Complete SQL schema for MySQL/MariaDB in WAMP.

---

## 🚀 Quick Setup Instructions (Step-by-Step)

### Step 1: Set Up Database in WAMP Server
0. Copy `api/db_config.example.php` to `api/db_config.php` and fill in your local MySQL credentials (this file is gitignored, so it won't be overwritten by future pulls).
1. Start **WAMP Server** (Ensure the tray icon is **Green**).
2. Open your web browser and go to: `http://localhost/phpmyadmin/`
3. Click on the **SQL** tab at the top.
4. Copy and paste the entire contents of `database.sql` into the text box and click **Go**.
5. You will now see the `two_wheeler_blackbox` database created with the `accident_logs` table!

---

### Step 2: Put the Web App inside WAMP `www` Folder
1. Copy the `web_app` folder into your WAMP web root directory:
   * Default path: `C:\wamp64\www\blackbox` (or `C:\wamp\www\blackbox`)
2. Open your browser and visit:
   * **Rider App:** `http://localhost/blackbox/index.html`
   * **Investigation Portal:** `http://localhost/blackbox/admin.html`

---

### Step 3: Run the App on your Smartphone
1. Connect both your **PC and your Android phone to the same Wi-Fi** network (or mobile hotspot).
2. Find your PC's local IP address (Open Command Prompt and type `ipconfig` -> e.g., `192.168.1.15`).
3. On your phone, open **Google Chrome** and navigate to:
   `http://192.168.1.15/blackbox/index.html`
4. Tap **"? CONNECT BIKE (BLE)"** -> Choose **`Bike-Blackbox-ESP32`** from the Bluetooth popup.
5. Watch the live angles, GPS, and status update in real-time!
