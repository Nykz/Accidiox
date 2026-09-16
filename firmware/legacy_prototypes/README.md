# Legacy Prototypes

Earlier iterations of the firmware, kept for history. All three still used a
handlebar OLED display, which was later removed from the design (see
[PROJECT_MASTER_DOCUMENTATION.md](../../PROJECT_MASTER_DOCUMENTATION.md),
section 2B) to cut rider distraction, battery drain, and BOM cost.

The current production firmware is
[firmware/esp32_blackbox_industrial](../esp32_blackbox_industrial) — use that
one, not these.

| File | Notes |
| :--- | :--- |
| `mpu6050_oled_esp32_v0.ino` | Earliest prototype — MPU-6050 + OLED only, no BLE telemetry. |
| `esp32_mpu6050_ble_oled_v1.ino` | Added BLE GATT telemetry streaming alongside the OLED. |
| `esp32_mpu6050_ble_oled_v2.ino` | Refined BLE + OLED version, immediately prior to dropping the screen. |
