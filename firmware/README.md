# Firmware (Arduino / ESP32)

All the on-bike code lives here. It is written in the Arduino language (C++)
and flashed with the Arduino IDE.

## Which file to flash

**[`esp32_blackbox_industrial/esp32_blackbox_industrial.ino`](esp32_blackbox_industrial/esp32_blackbox_industrial.ino)**
— this is the production firmware, the one used in the demo.

It does four things:

1. Reads the MPU-6050 motion sensor over I²C, about 100 times a second.
2. Calibrates the bike's resting gravity vector on power-up, so the code
   works whatever angle the box is mounted at.
3. Declares a crash only when the bike is rolled past **85°** and stays there
   for **10 continuous seconds**, with a 600 ms grace for bounces. A bump, a
   hard brake, or a bike lifted back up (below 55°) is rejected.
4. Streams live telemetry — tilt, roll, pitch, impact, crash state — to the
   rider's phone over Bluetooth Low Energy, and sounds the buzzer and hazard
   LED while the countdown runs.

## Wiring

Full table and schematic: [`docs/hardware/BOM.md`](../docs/hardware/BOM.md).
Short version: MPU-6050 on GPIO 21 (SDA) and GPIO 22 (SCL), buzzer on GPIO 4,
hazard LED on GPIO 19 through a 220 Ω resistor.

## How to flash it

1. Install the Arduino IDE and add the **ESP32 board package**
   (Boards Manager → "esp32" by Espressif).
2. Open the `.ino` file above.
3. Select board **ESP32 Dev Module** and the COM port of your ESP32.
4. Press Upload.
5. Open the Serial Monitor at 115200 baud to watch the calibration and the
   live tilt readings.

The BLE libraries (`BLEDevice`, `BLEServer`, `BLEUtils`, `BLE2902`) and
`Wire` ship with the ESP32 board package, so nothing else needs installing.

## The other folders

| Folder | What it is |
| :--- | :--- |
| [`esp32_blackbox_industrial`](esp32_blackbox_industrial) | **Production firmware. Flash this one.** |
| [`blackbox_gsm_standalone`](blackbox_gsm_standalone) | Next version: adds a 4G modem and its own GPS, so the box can alert on its own even if the rider's phone is dead. Written and documented, not yet field-tested. |
| [`legacy_prototypes`](legacy_prototypes) | Three earlier versions, kept to show how the design evolved. They used a handlebar OLED that was dropped to cut cost and rider distraction. |

## How the firmware talks to the app

The ESP32 advertises as a BLE device named `Bike-Blackbox-ESP32` and pushes a
telemetry string to the rider app, which is a web app running in Chrome on
Android (Web Bluetooth). The phone adds GPS and internet; the box only
detects. The GATT service and characteristic UUIDs are documented in
[`PROJECT_MASTER_DOCUMENTATION.md`](../PROJECT_MASTER_DOCUMENTATION.md).
