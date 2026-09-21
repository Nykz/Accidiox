/*
  =============================================================================
  ACCIDIOX TWO-WHEELER BLACKBOX (CALIBRATED CRASH DETECTOR)
  Hardware: ESP32 + MPU-6050 (I2C) + Piezo Buzzer (D4) + Hazard LED (D19)
  Features:
    - 85° Ground-Roll Crash Limit (Rejects bumps/braking)
    - 10-Second Continuous Fall Confirmation
    - 2-Second Periodic Warning Buzzer Pulse (350ms ON / 1650ms OFF)
    - BLE Telemetry Stream to Accidiox Mobile App
  =============================================================================
*/

#include <Wire.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ---------------- Pin Configurations ----------------
#define PIN_BUZZER       4   // Piezo Buzzer Pin (GPIO 4)
#define PIN_HAZARD_LED   19  // Hazard Strobe LED Pin (GPIO 19)

// ---------------- MPU-6050 I2C Registers ----------------
#define MPU_ADDR 0x68
bool mpuFound = false;

// ---------------- Calibrated Baseline Gravity Vector ----------------
float rest_ax = 0.0, rest_ay = 1.0, rest_az = 0.0;
bool calibrated = false;

// ---------------- Thresholds ----------------
const float CRASH_TILT_LIMIT = 85.0; // Trigger accident ONLY on ground rollover (>85°)
const float RECOVERY_LIMIT   = 55.0; // Auto-disarm when bike is lifted (<55°)

// ---------------- Filtering & 10s Continuous Confirmation ----------------
const float ACCEL_MAG_MIN_G = 0.7;
const float ACCEL_MAG_MAX_G = 1.3;
const unsigned long CRASH_CONFIRM_MS = 10000;  // 10s continuous hold required
const unsigned long CRASH_DIP_GRACE_MS = 600;

bool crashCandidateActive = false;
unsigned long crashCandidateStartTime = 0;
unsigned long lastAboveThresholdTime = 0;

// State Variables
bool isCrashActive = false;
float totalTilt = 0.0;
unsigned long lastSerialPrint = 0;
unsigned long lastBleStream = 0;

// ---------------- BLE UUIDs ----------------
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

#define NORMAL "NORMAL"
#define CRASH  "CRASH"

BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial.println(F("[BLE] Mobile App Connected!"));
    };

    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      Serial.println(F("[BLE] Mobile App Disconnected!"));
    }
};

bool initMPU() {
  Wire.beginTransmission(MPU_ADDR);
  if (Wire.endTransmission() != 0) return false;
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B);
  Wire.write(0x00); // Wake MPU-6050
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
  Serial.println(F("  ACCIDIOX TWO-WHEELER BLACKBOX - ESP32 FIRMWARE"));
  Serial.println(F("  Accident Threshold: > 85.0 Degrees (10s Hold) "));
  Serial.println(F("=============================================="));

  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_HAZARD_LED, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_HAZARD_LED, LOW);

  // Startup 2-Beep Confirmation
  digitalWrite(PIN_BUZZER, HIGH); digitalWrite(PIN_HAZARD_LED, HIGH);
  delay(120);
  digitalWrite(PIN_BUZZER, LOW); digitalWrite(PIN_HAZARD_LED, LOW);
  delay(100);
  digitalWrite(PIN_BUZZER, HIGH); digitalWrite(PIN_HAZARD_LED, HIGH);
  delay(120);
  digitalWrite(PIN_BUZZER, LOW); digitalWrite(PIN_HAZARD_LED, LOW);

  // I2C Bus Init (SDA = GPIO 21, SCL = GPIO 22)
  Wire.begin(21, 22);
  Wire.setClock(100000);

  if (initMPU()) {
    mpuFound = true;
    Serial.println(F("[IMU] MPU-6050 detected. Calibrating resting posture..."));
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
        Serial.println(F("[IMU] Rest Position Calibrated to 0.0 deg."));
      }
    }
  } else {
    mpuFound = false;
    Serial.println(F("[ERROR] MPU-6050 NOT DETECTED! Check SDA=GPIO21, SCL=GPIO22."));
  }

  // BLE Telemetry Server Setup
  BLEDevice::init("Bike-Blackbox-ESP32");
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);
  pCharacteristic = pService->createCharacteristic(
                      CHARACTERISTIC_UUID,
                      BLECharacteristic::PROPERTY_READ |
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

  Serial.println(F("[SYSTEM] Blackbox Armed & Broadcasting BLE.\n"));
}

void loop() {
  float cur_ax = 0.0, cur_ay = 0.0, cur_az = 0.0;

  if (mpuFound) {
    if (readAccel(cur_ax, cur_ay, cur_az)) {
      float cur_norm = sqrt(cur_ax*cur_ax + cur_ay*cur_ay + cur_az*cur_az);

      // Magnitude Gate: Only trust pure 1g gravity samples (rejects potholes & bumps)
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
        Serial.println(F("[IMU] MPU-6050 Re-connected!"));
      }
    }
  }

  // 10-Second Continuous Fall Confirmation Logic
  if (totalTilt >= CRASH_TILT_LIMIT) {
    lastAboveThresholdTime = millis();
    if (!crashCandidateActive) {
      crashCandidateActive = true;
      crashCandidateStartTime = millis();
    } else if (millis() - crashCandidateStartTime >= CRASH_CONFIRM_MS) {
      isCrashActive = true;
    }
  } else {
    if (crashCandidateActive && (millis() - lastAboveThresholdTime > CRASH_DIP_GRACE_MS)) {
      crashCandidateActive = false; // Reset if tilt returned before 10s
    }
    if (totalTilt < RECOVERY_LIMIT) {
      isCrashActive = false; // Auto-disarm when bike is lifted upright
    }
  }

  String statusPayload = isCrashActive ? CRASH : NORMAL;

  // 2-Second Periodic Buzzer Pulse (350ms warning beep every 2000ms)
  if (isCrashActive) {
    bool isBeepActive = (millis() % 2000 < 350);
    digitalWrite(PIN_HAZARD_LED, isBeepActive ? HIGH : LOW);
    digitalWrite(PIN_BUZZER, isBeepActive ? HIGH : LOW);
  } else {
    digitalWrite(PIN_HAZARD_LED, LOW);
    digitalWrite(PIN_BUZZER, LOW);
  }

  // Serial Diagnostic Stream (Every 300ms)
  if (millis() - lastSerialPrint >= 300) {
    lastSerialPrint = millis();
    Serial.print(F("Tilt: ")); Serial.print(totalTilt, 1);
    Serial.print(F(" deg | Status: ")); Serial.println(statusPayload);
  }

  // BLE Broadcast Stream (Every 100ms)
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