# 🛰️ Standalone Two-Wheeler Blackbox with 4G GSM & GPS
### KAYA Buildathon — IIT (BHU) Varanasi Edition

---

## 📡 System Overview
This is the **Tier-2 Autonomous Standalone Blackbox** designed to operate **100% independently of any smartphone**.

Even if the rider's phone is switched off, out of battery, or destroyed in a crash:
1. The **MPU-6050 6-Axis IMU** detects rollover tilt (>55°) or sudden collision deceleration (>2.2g).
2. The **Onboard GNSS/GPS Engine** acquires satellite coordinates directly from the sky.
3. The **4G LTE Cellular Modem (A7670C / SIM7600 / SIM800L)** dispatches an emergency distress SMS with a live Google Maps link and automatically dials the emergency phone number.
4. The **Aviation-Style 30-Second Ring Buffer** freezes pre-crash telemetry in flash memory for police investigation.
5. The **Handlebar 3-Button Controller** allows instant 1-click false alarm cancellation and manual panic trigger.

---

## 🔌 Hardware Circuit Pinout

```
                  +----------------------------------------+
                  │            ESP32 DEV MODULE            │
                  +----------------------------------------+
                          │                    │
          +------------------------+   +------------------------+
          │  4G GSM / GPS MODEM    │   │      MPU-6050 IMU      │
          │  TX  -> GPIO 16 (RX2)  │   │  SDA -> GPIO 21        │
          │  RX  -> GPIO 17 (TX2)  │   │  SCL -> GPIO 22        │
          │  VCC -> 5V (2A Power)  │   │  VCC -> 3.3V           │
          │  GND -> GND            │   │  GND -> GND            │
          +------------------------+   +------------------------+
                          │                    │
          +------------------------+   +------------------------+
          │  3-BUTTON REMOTE       │   │  SAFETY ALARM BEACON   │
          │  BTN 1 (Vol+) -> 32    │   │  Buzzer (+) -> GPIO 18 │
          │  BTN 2 (Cancel)-> 33   │   │  LED (+)    -> GPIO 19 │
          │  BTN 3 (SOS)  -> 25    │   │  Grounds    -> GND     │
          │  Common       -> GND   │   +------------------------+
          +------------------------+
```

---

## 📦 Bill of Materials (BOM)

| Component | Part Number / Specification | Approx Cost (INR) |
| :--- | :--- | :--- |
| **Microcontroller** | ESP32 Dev Module (WROOM-32, Dual-Core) | ₹420 |
| **Motion IMU** | MPU-6050 6-DOF Accelerometer + Gyroscope | ₹140 |
| **4G Cellular + GPS Modem**| A7670C 4G LTE GNSS Module (or SIM800L) | ₹1,150 |
| **Handlebar Remote** | 3x Tactile Momentary Push Buttons + Housing | ₹80 |
| **Safety Beacon** | 5V Active Piezo Buzzer + High-Intensity White LED | ₹40 |
| **Power Supply** | 12V to 5V Step-Down Buck Converter (LM2596) | ₹90 |
| **Enclosure** | IP65/IP67 Waterproof ABS Project Box | ₹180 |
| **TOTAL BOM COST:** | **Complete Autonomous System** | **₹2,100 (~$25 USD)** |

---

## 💾 How to Flash & Run
1. Open `blackbox_gsm_standalone.ino` in **Arduino IDE**.
2. Install the `MPU6050_light` library from Library Manager.
3. In line 38, update `EMERGENCY_PHONE` with your test mobile number.
4. Connect ESP32 via USB, select **ESP32 Dev Module**, and click **Upload**.
5. When powered, the buzzer will emit a short beep to confirm system arming.
