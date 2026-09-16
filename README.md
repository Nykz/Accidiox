# Accidiox — Smart AI Two-Wheeler Black Box

Industrial-grade crash detection and emergency telematics for two-wheelers.
Built for the **KAYA Buildathon, IIT (BHU) Varanasi** (Problem Statement 01:
Open Innovation).

An ESP32 + MPU-6050 unit mounted on the bike detects a crash using a
zero-drift 3D gravity-vector algorithm, streams live telemetry over
Bluetooth LE to a phone-based web dashboard, runs a 20-second cancel window,
and — if not dismissed — automatically dispatches a WhatsApp SOS with live
GPS location, nearest hospital, and nearest police station to every saved
emergency contact.

Full architecture, algorithms, GATT contract, and pinout are documented in
**[PROJECT_MASTER_DOCUMENTATION.md](PROJECT_MASTER_DOCUMENTATION.md)**.

## Repository layout

| Path | What's in it |
| :--- | :--- |
| [`firmware/esp32_blackbox_industrial`](firmware/esp32_blackbox_industrial) | Production ESP32 firmware — the one to flash. |
| [`firmware/blackbox_gsm_standalone`](firmware/blackbox_gsm_standalone) | Optional autonomous variant with onboard 4G LTE + GPS, works even if the rider's phone is off. |
| [`firmware/legacy_prototypes`](firmware/legacy_prototypes) | Earlier OLED-based prototype iterations, kept for history. |
| [`web_app`](web_app) | The rider's PWA dashboard (`index.html`) + the incident investigation portal (`admin.html`) + PHP/MySQL backend. |
| [`docs`](docs) | Pitch deck outline, video script, and UI screenshots. |
| [`media`](media) | Demo video. |

## Getting started

- **Firmware:** open the `.ino` file in `firmware/esp32_blackbox_industrial` with the Arduino IDE, install the required libraries (see the file header), flash to an ESP32.
- **Web app:** see [`web_app/README.md`](web_app/README.md) for local setup (XAMPP/WAMP) and deployment notes.

## Status

Working hardware + software prototype. Deployment to a live subdomain (for
PWA installability and Android APK packaging) is in progress.
