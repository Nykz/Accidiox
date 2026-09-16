# KAYA Buildathon 2026 — 10-Slide Presentation Deck

*IIT (BHU) Varanasi | Problem Statement 01: Open Innovation (Hardware Builds)*

> **Project Name:** Smart AI Accidiox (Two-Wheeler Smart Black Box)
> **Theme:** AI-Driven IoT Automotive Safety & Emergency Telematics
> **Format:** Convert these 10 slides into PowerPoint / Canva and export as `TeamID_Buildathon_Deck.pdf`

---

## Slide 1: Title & Overview
- **Title:** SMART AI ACCIDIOX — Universal Two-Wheeler Black Box & Intelligent Emergency Dispatch System
- **Tagline:** *"Ride Smarter. Ride Safer. Democratizing Superbike Safety for Everyday Commuters."*
- **Event:** KAYA 2026, IIT (BHU) Varanasi — Buildathon Track
- **Team Details:** [Your Team Name, Member Names, College/Institution]

## Slide 2: The Problem Statement (The Golden Hour Crisis)
- **The Critical Crisis:** Over 50,000 two-wheeler riders lose their lives annually in India.
- **Delayed Medical Response:** More than 60% of road accident fatalities happen due to lack of immediate trauma response within the "Golden Hour".
- **Market Inequity:** Luxury superbikes (BMW R1250GS / Ducati costing ₹25 Lakhs) have automatic eCall systems, but 99% of mass-market bikes (Splendor, Pulsar, Activa) have zero accident detection.

## Slide 3: Proposed Solution (Smart AI Accidiox)
- An affordable, universal retrofit black box combining **on-device motion intelligence** with **instant cloud/mobile emergency dispatch**.
- **Dual-Tier Architecture:**
  - *Hardware Layer:* High-precision 6-axis IMU (MPU-6050) + ESP32 Microcontroller + Local Audio-Visual Hazard Beacon + 1.3" Handlebar HUD.
  - *Mobile & Cloud Layer:* Bluetooth Low Energy (BLE) Client + Smartphone GPS + Real-time Reverse Geocoding + MySQL Database.

## Slide 4: System & Hardware Architecture
- **Microcontroller:** ESP32 (Dual-Core 240MHz, 4MB Flash, BLE 4.2).
- **Sensor Core:** MPU-6050 (3-Axis Accelerometer + 3-Axis Gyroscope).
- **Communication Bus:** I2C Protocol (SDA: GPIO 21, SCL: GPIO 22) sharing OLED Display (0x3C) and IMU (0x68).
- **Local Indicators:** 1.3" I2C OLED Telemetry HUD, Active Piezo Buzzer (GPIO 18), High-Intensity Strobe Hazard LED (GPIO 19).

## Slide 5: Core Engineering Innovation & Algorithms
- **1. Multi-Sensor Impact & Rollover Fusion:** Triggers on simultaneous detection of G-force deceleration vector (>2.2g) + Lean Rollover angle (>55°).
- **2. 30-Second Pre-Crash Flight Buffer:** Continuous FIFO circular ring buffer in flash memory preserving the 30 seconds of telemetry prior to impact for police investigation.
- **3. False-Alarm Elimination:** 20-second interactive countdown window with voice alert and instant one-tap cancellation.

## Slide 6: Spatial AI Routing & Automatic WhatsApp SOS
- **Reverse Geocoding:** Automatically translates latitude/longitude into human-readable Street, Locality, and City names.
- **Dual Facility AI Discovery:** Queries OpenStreetMap Overpass spatial engine to identify the *Nearest Trauma Hospital* and *Nearest Police Station*.
- **Layman-Friendly Alert:** Auto-dispatches a clean WhatsApp alert to family and emergency services containing live Google Maps link, timestamp, and facility routing.

## Slide 7: Central Incident Investigation Portal (XAMPP / MySQL)
- Centralized web dashboard designed for police authorities, insurance surveyors, and fleet managers.
- **Interactive Geospatial Leaflet Map:** Real-time visualization of accident coordinates across the city.
- **Historical Telemetry Analysis:** Full timeline of tilt angle, impact speed, and timestamps for scientific accident reconstruction.

## Slide 8: Bill of Materials (BOM) & Cost Feasibility
- **ESP32 Dev Module:** ₹420
- **MPU-6050 6-DOF IMU:** ₹140
- **1.3" I2C OLED Screen:** ₹280
- **Buzzer, Strobe LED, & Wiring:** ₹40
- **Custom 3D-Printed Enclosure + Power Supply:** ₹350
- **TOTAL HARDWARE BOM COST: ₹1,230 ($15 USD)** *(vs ₹80,000 commercial OEM equivalents)*.

## Slide 9: Market Adoption Strategy: Why Price-Conscious Indian Consumers Buy It
- **1. Anti-Theft & Towing Alarm:** Solves the #1 daily Indian parking anxiety (motion sensor triggers alarm + phone alert).
- **2. The Handlebar Mini-Navigator:** Replaces dangerous ₹20k phone mounting with a compact 1.3" handlebar navigation HUD, preventing phone snatching, heat shutdown, and rain damage (vs ₹5,000 Royal Enfield Tripper).
- **3. The "Worried Parents" Market:** Parents buying commuter bikes for college-going teenagers willingly purchase the safety add-on for overspeeding alerts and emergency peace of mind.
- **4. Commercial B2B Fleets:** Quick-commerce fleets (Zomato, Swiggy, Zepto, Blinkit) requiring rider safety compliance and insurance cost reductions.

## Slide 10: Conclusion & Future Roadmap
- **Current Status:** Fully functional Level-3 hardware working prototype with Web App and MySQL backend.
- **Next Milestones:**
  - Integration of standalone 4G LTE/GPS module (A7670C) for phone-independent standalone operation.
  - Onboard TinyML anomaly classification model trained via Edge Impulse.
  - Automated post-crash fuel/ignition cutoff relay.
- **Closing:** *"Smart AI Accidiox — Saving lives on Indian roads through affordable, intelligent engineering."*

---
> **Note:** This outline predates the current production firmware ([firmware/esp32_blackbox_industrial](../firmware/esp32_blackbox_industrial)), which removed the handlebar OLED display (see the design-decision notes in [PROJECT_MASTER_DOCUMENTATION.md](../PROJECT_MASTER_DOCUMENTATION.md)). Update the hardware/BOM slides before presenting if you want them to match the current build.
