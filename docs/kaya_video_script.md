# KAYA 2026 — Buildathon Submission Script

*IIT (BHU) Varanasi | Swatantrata Bhavan | Problem Statement 01: Open Innovation (Hardware Builds)*

> **Project Title:** Smart AI Accidiox — Two-Wheeler Black Box & Intelligent Emergency Dispatch System
> **Target Category:** Buildathon (Hardware Track)
> **Video Time Limit:** Strictly Under 5 Minutes (1080p, YouTube Unlisted / Google Drive)

---

## 1. 5-Minute Video Recording Timeline & Breakdown

| Timestamp | Visual Scene (What to Film) | Spoken Script (What You Should Say) | Judge Impact Goal |
| :--- | :--- | :--- | :--- |
| **0:00 – 0:45** (45 sec) | You speaking facing the camera confidently with bike backdrop or title slide. | "Hello judges! In India, over 50,000 two-wheeler riders lose their lives every year in road accidents. Over 60% of these fatalities occur due to delayed emergency response during the critical Golden Hour. While luxury superbikes costing ₹25 Lakhs feature automatic emergency call systems, 99% of everyday commuter motorcycles on Indian roads have zero accident detection. We built **Smart AI Accidiox** — an affordable, universal smart black box that brings luxury-grade accident telemetry and automated emergency dispatch to every motorcycle." | Grabs emotional attention with real data and highlights the market gap. |
| **0:45 – 1:30** (45 sec) | Close-up of the breadboard/PCB showing ESP32, MPU-6050, 1.3" OLED, Buzzer, and LEDs. | "Our hardware unit consists of an ESP32 microcontroller interfaced with an MPU-6050 6-axis IMU over an I2C bus. It runs an intelligent multi-sensor fusion algorithm combining G-force impact acceleration with 3D rollover tilt angle. It features an aviation-style 30-second circular ring buffer that freezes pre-crash telemetry in flash memory, and streams live data via Bluetooth Low Energy to our responsive mobile web application." | Demonstrates strong embedded engineering and sensor architecture. |
| **1:30 – 3:15** (105 sec) | **Live Physical Demo:** Split screen showing the physical hardware in your hand and the phone screen running the HUD. | "Let's see a live demonstration: 1. We open our Web App in Chrome and tap 'Connect Device'. It pairs instantly with our ESP32 over BLE. 2. The OLED and mobile HUD display real-time speed, live location, and tilt angles. 3. Now, when an accident occurs and the bike tilts beyond 55 degrees or suffers an impact spike: the hardware triggers the hazard strobe LED and buzzer alarm, and the app launches a **20-second safety window** with loud voice alerts. 4. If the rider is unhurt, they tap 'I Am Safe' to abort false alarms. 5. If the rider is incapacitated and the timer expires, the system automatically launches WhatsApp, dispatching a distress alert with the exact street name, Google Maps link, and the nearest verified Hospital and Police Station." | **Winning Moment:** Proves the prototype is 100% functional in real time. |
| **3:15 – 4:15** (60 sec) | Screen recording of the Admin Investigation Portal (`admin.html`) showing the Leaflet incident map and MySQL logs. | "All incidents are automatically synchronized with our local and cloud database server. Police authorities, emergency services, and fleet managers can access our central Investigation Portal. Here, all crash coordinates are plotted on an interactive Leaflet map, displaying historical telemetry, impact speed, and timestamps for accident reconstruction and insurance validation." | Proves complete end-to-end full-stack IoT integration (Hardware + Mobile + Cloud/Database). |
| **4:15 – 5:00** (45 sec) | Slide displaying the Bill of Materials (BOM) cost table and business scaling strategy. | "Our total hardware Bill of Materials cost is under **₹1,500 ($18)**, making it extremely cost-effective for both aftermarket retail consumers and commercial delivery fleets like Zomato, Swiggy, and Blinkit. With Smart AI Accidiox, we are democratizing road safety for millions of two-wheeler riders. Thank you!" | Shows business viability, scalability, and strong closing. |

---

## 2. Complete Bill of Materials (BOM) Table

*(Include this in your PDF submission and video slide.)*

| Component Name | Specification / Description | Quantity | Approx Cost (INR) |
| :--- | :--- | :--- | :--- |
| ESP32 Dev Module | 32-bit Dual Core, 240MHz, BLE 4.2 & Wi-Fi | 1 | ₹420 |
| MPU-6050 Module | 6-Axis Accelerometer + Gyroscope IMU (I2C) | 1 | ₹140 |
| 1.3" I2C OLED Display | 128x64 pixels, SH1106 Driver | 1 | ₹280 |
| Piezo Buzzer & LED Strobe | 5V Active Buzzer + High-Intensity White LED | 1 set | ₹40 |
| Enclosure & Power Unit | 3D Printed Case + 3.7V Li-ion Battery / Buck Converter | 1 | ₹350 |
| **TOTAL HARDWARE BOM COST** | | | **₹1,230 (~$15)** |

---

## 3. Key Tips for High Scoring at KAYA IIT Varanasi

- **1. Good Lighting & Clear Audio:** Use a lapel mic or clean phone mic. Ensure there is no background fan noise.
- **2. Real Demonstrations Beat Animations:** Keep the camera focused on the live sensor movement and phone screen.
- **3. Mention the "20-Second False-Alarm Window":** Judges love to ask about false alarms. Emphasizing the 20s cancel button proves real-world design maturity.
- **4. Host on YouTube as 'Unlisted':** Set the video visibility to **Unlisted** so only people with the link can view it without any login barriers.

---
> **Note:** This script predates the current production firmware ([firmware/esp32_blackbox_industrial](../firmware/esp32_blackbox_industrial)), which removed the handlebar OLED display. Update the hardware demo beats before filming if you want the narration to match the current build.
