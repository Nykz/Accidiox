/*
  =============================================================================
  ACCIDIOX TWO-WHEELER BLACKBOX (CALIBRATED CRASH DETECTOR)
  Threshold: 85.0 Degrees (Extreme Fall Only), Sustained-Hold Confirmed
  Hardware: ESP32 + MPU-6050 + Buzzer + Hazard LED - nothing else.
  =============================================================================
*/

#include <Wire.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
// BLE only, used purely for crash telemetry to the Accidiox app. There are
// no buttons and no Classic Bluetooth/media-remote on this build - alarm
// cancellation happens entirely from the app's own "I Am Safe" button,
// which works independent of the hardware.

// ---------------- Pin Configurations ----------------
#define PIN_BUZZER       4   // Piezo Buzzer Pin
#define PIN_HAZARD_LED   19  // Hazard Strobe LED Pin

// ---------------- MPU-6050 I2C Registers ----------------
#define MPU_ADDR 0x68
bool mpuFound = false;

// ---------------- Reference Rest Gravity Vector (Auto-Calibrated) ----------------
float rest_ax = 0.0, rest_ay = 1.0, rest_az = 0.0;
bool calibrated = false;

// ---------------- Thresholds (Increased by +20 deg to 85 deg) ----------------
// Trigger accident ONLY on extreme tilt / ground crash (> 85.0 degrees deviation)
const float CRASH_TILT_LIMIT = 85.0;
const float RECOVERY_LIMIT   = 55.0; // Auto-disarm when returned upright (< 55 degrees)

// ---------------- Anti-Vibration / False-Trigger Filtering ----------------
// Two independent guards stop a bump, pothole, or hard-braking deceleration
// from ever reaching the buzzer/LED - the goal is to only ever fire on an
// actual fall, never on a transient:
//   1) Magnitude gate - a sample is only trusted for tilt if its total
//      magnitude is close to 1g (pure gravity). Any sample containing a
//      large *linear* acceleration component (a bump, or the deceleration
//      from hard braking) reads far from 1g and is simply ignored for that
//      loop tick, so totalTilt just keeps its last trusted value.
//   2) Sustained-hold confirmation - even a trusted high-tilt sample must
//      stay above CRASH_TILT_LIMIT continuously for CRASH_CONFIRM_MS
//      before the alarm actually fires. This is the deliberate physics
//      argument: hard braking or a pothole can only distort the computed
//      angle for as long as that deceleration event itself lasts, which is
//      at most 1-2 seconds even for emergency braking - it cannot possibly
//      hold the reading above threshold continuously for a full 5-10
//      seconds, because the bike is still upright and moving the instant
//      the event ends. A real fall, on the other hand, leaves the bike
//      physically lying on the ground, so the tilt reading trivially stays
//      pinned above threshold for as long as CRASH_CONFIRM_MS demands.
//      A short CRASH_DIP_GRACE_MS tolerance is layered on top so that a
//      single noisy sample dipping the reading below threshold for a
//      moment (e.g. engine vibration while the bike is down) doesn't reset
//      an otherwise-genuine, in-progress confirmation back to zero.
const float ACCEL_MAG_MIN_G = 0.7;
const float ACCEL_MAG_MAX_G = 1.3;
const unsigned long CRASH_CONFIRM_MS = 10000;  // 10s continuous hold to confirm genuine accident/fall
const unsigned long CRASH_DIP_GRACE_MS = 600;
bool crashCandidateActive = false;
unsigned long crashCandidateStartTime = 0;
unsigned long lastAboveThresholdTime = 0;

// State Variables
bool isCrashActive = false;
float totalTilt = 0.0; // persists across loop ticks so a rejected (gated) sample doesn't snap this back to 0
unsigned long lastSerialPrint = 0;
unsigned long lastBleStream = 0;

// ---------------- BLE Setup ----------------
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

// ---------------- BLE Status Payload Strings ----------------
// Must match web_app/js/app.js handleTelemetry()'s cmd comparison exactly
// (cmd === "CRASH"). Everything else (including cancellation) is handled
// app-side, so the hardware only ever needs to report NORMAL or CRASH.
#define NORMAL "NORMAL"
#define CRASH  "CRASH"

BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial.println(F("[BLE] Mobile Dashboard Connected!"));
    };

    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      Serial.println(F("[BLE] Mobile Dashboard Disconnected!"));
    }
};

bool initMPU() {
  Wire.beginTransmission(MPU_ADDR);
  if (Wire.endTransmission() != 0) {
    return false;
  }
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B);
  Wire.write(0x00);
  Wire.endTransmission(true);
  return true;
}

bool readAccel(float &ax, float &ay, float &az) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(MPU_ADDR, 6) != 6) return false;
  
  int16_t rawX = (Wire.read() << 8) | Wire.read();
  int16_t rawY = (Wire.read() << 8) | Wire.read();
  int16_t rawZ = (Wire.read() << 8) | Wire.read();
  
  ax = (float)rawX / 16384.0;
  ay = (float)rawY / 16384.0;
  az = (float)rawZ / 16384.0;
  return true;
}

void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println(F("\n=============================================="));
  Serial.println(F("  ACCIDIOX TWO-WHEELER BLACKBOX - CRASH SENSOR  "));
  Serial.println(F("  Accident Threshold: > 85.0 Degrees Lean      "));
  Serial.println(F("=============================================="));

  // 1. Initialize Output Actuators
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_HAZARD_LED, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_HAZARD_LED, LOW);

  // 2. Startup Confirmation Beep (2 quick beeps)
  digitalWrite(PIN_BUZZER, HIGH); digitalWrite(PIN_HAZARD_LED, HIGH);
  delay(120);
  digitalWrite(PIN_BUZZER, LOW); digitalWrite(PIN_HAZARD_LED, LOW);
  delay(100);
  digitalWrite(PIN_BUZZER, HIGH); digitalWrite(PIN_HAZARD_LED, HIGH);
  delay(120);
  digitalWrite(PIN_BUZZER, LOW); digitalWrite(PIN_HAZARD_LED, LOW);

  // 3. Initialize I2C Bus (ESP32: SDA=21, SCL=22)
  Wire.begin(21, 22);
  Wire.setClock(100000);

  if (initMPU()) {
    mpuFound = true;
    Serial.println(F("[IMU] MPU-6050 Detected. Calibrating normal resting posture..."));
    
    // Lock the baseline gravity vector
    float sumX = 0, sumY = 0, sumZ = 0;
    int samples = 0;
    for (int i = 0; i < 50; i++) {
      float tx, ty, tz;
      if (readAccel(tx, ty, tz)) {
        sumX += tx; sumY += ty; sumZ += tz;
        samples++;
      }
      delay(10);
    }
    if (samples > 0) {
      float norm = sqrt(sumX*sumX + sumY*sumY + sumZ*sumZ);
      if (norm > 0.1) {
        rest_ax = sumX / norm;
        rest_ay = sumY / norm;
        rest_az = sumZ / norm;
        calibrated = true;
        Serial.println(F("[IMU] Rest Position Locked at 0.0 deg."));
      }
    }
  } else {
    mpuFound = false;
    Serial.println(F("[ERROR] MPU-6050 NOT DETECTED! Check SDA=GPIO21, SCL=GPIO22."));
  }

  // 4. Initialize BLE Telemetry Server
  BLEDevice::init("Bike-Blackbox-ESP32");
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);
  pCharacteristic = pService->createCharacteristic(
                      CHARACTERISTIC_UUID,
                      BLECharacteristic::PROPERTY_READ   |
                      BLECharacteristic::PROPERTY_NOTIFY
                    );
  pCharacteristic->addDescriptor(new BLE2902());
  pService->start();

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();

  Serial.println(F("[SYSTEM] Blackbox Armed. Threshold >85 deg.\n"));
}

void loop() {
  float cur_ax = 0.0, cur_ay = 0.0, cur_az = 0.0;

  if (mpuFound) {
    if (readAccel(cur_ax, cur_ay, cur_az)) {
      float cur_norm = sqrt(cur_ax*cur_ax + cur_ay*cur_ay + cur_az*cur_az);

      // Only trust this sample for tilt if it's close to pure 1g gravity.
      // A tap/vibration/bump sample reads far from 1g and is ignored here -
      // totalTilt simply retains whatever it was on the last trusted sample.
      if (cur_norm > ACCEL_MAG_MIN_G && cur_norm < ACCEL_MAG_MAX_G) {
        float u_ax = cur_ax / cur_norm;
        float u_ay = cur_ay / cur_norm;
        float u_az = cur_az / cur_norm;

        float dot = (u_ax * rest_ax) + (u_ay * rest_ay) + (u_az * rest_az);
        if (dot > 1.0) dot = 1.0;
        if (dot < -1.0) dot = -1.0;

        totalTilt = acos(dot) * 57.2957795;
        if (isnan(totalTilt)) totalTilt = 0.0;
      }
    }
  } else {
    static unsigned long lastRetry = 0;
    if (millis() - lastRetry > 2000) {
      lastRetry = millis();
      if (initMPU()) {
        mpuFound = true;
        Serial.println(F("[IMU] MPU-6050 Re-detected!"));
      }
    }
  }

  // ---------------- Crash Detection Logic (sustained-hold confirmed) ----------------
  // Trigger ONLY when tilt exceeds 85 degrees AND stays there continuously
  // (with a small noise-dip grace allowance) for CRASH_CONFIRM_MS - this is
  // what actually rejects momentary bumps, speed breakers, and hard-braking
  // deceleration from ever reaching the alarm, while still confirming a
  // real fall within the requested 5-10 second window.
  if (totalTilt >= CRASH_TILT_LIMIT) {
    lastAboveThresholdTime = millis();
    if (!crashCandidateActive) {
      crashCandidateActive = true;
      crashCandidateStartTime = millis();
    } else if (millis() - crashCandidateStartTime >= CRASH_CONFIRM_MS) {
      isCrashActive = true;
    }
  } else {
    // Only cancel the in-progress candidate once it's been below threshold
    // continuously for longer than the grace period - a single noisy
    // sample shouldn't throw away several seconds of genuine hold.
    if (crashCandidateActive && (millis() - lastAboveThresholdTime > CRASH_DIP_GRACE_MS)) {
      crashCandidateActive = false;
    }
    if (totalTilt < RECOVERY_LIMIT) {
      // Auto disarm when upright (< 55 degrees)
      isCrashActive = false;
    }
  }

  // Status payload to send over BLE - just NORMAL or CRASH now. Alarm
  // cancellation is handled entirely by the app's "I Am Safe" button.
  String statusPayload = isCrashActive ? CRASH : NORMAL;

  // ---------------- Safety Alarm Control ----------------
  if (isCrashActive) {
    // Pulsed Crash Alarm: 350ms warning beep every 2 seconds (2000ms cycle)
    // with 1650ms pause, replacing the continuous buzzer.
    bool isBeepActive = (millis() % 2000 < 350);
    digitalWrite(PIN_HAZARD_LED, isBeepActive ? HIGH : LOW);
    digitalWrite(PIN_BUZZER, isBeepActive ? HIGH : LOW);
  } else {
    // Normal resting state: Both LED and Buzzer OFF
    digitalWrite(PIN_HAZARD_LED, LOW);
    digitalWrite(PIN_BUZZER, LOW);
  }

  // ---------------- Serial Telemetry (Every 300ms) ----------------
  if (millis() - lastSerialPrint >= 300) {
    lastSerialPrint = millis();
    Serial.print(F("Tilt: ")); Serial.print(totalTilt, 1);
    Serial.print(F(" deg | Status: ")); Serial.println(statusPayload);
  }

  // ---------------- BLE Telemetry Broadcast (Every 100ms) ----------------
  if (millis() - lastBleStream >= 100) {
    lastBleStream = millis();

    String bleData = statusPayload + "," + String(totalTilt, 1) + "," + String(totalTilt, 1) + "," + String(totalTilt, 1);

    if (deviceConnected) {
      pCharacteristic->setValue(bleData.c_str());
      pCharacteristic->notify();
    }

    if (!deviceConnected && oldDeviceConnected) {
      delay(500);
      pServer->startAdvertising();
      oldDeviceConnected = deviceConnected;
    }
    if (deviceConnected && !oldDeviceConnected) {
      oldDeviceConnected = deviceConnected;
    }
  }
}

