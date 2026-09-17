/*
  =============================================================================
  INDUSTRIAL SMART TWO-WHEELER BLACKBOX (CALIBRATED CRASH + BUTTON TESTER)
  Threshold: 85.0 Degrees (Extreme Fall Only) + Instant Button LED Feedback
  =============================================================================
*/

#include <Wire.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <BluetoothA2DPSink.h>
// Requires the "ESP32-A2DP" library by pschatzmann (Arduino Library
// Manager -> search "ESP32-A2DP" -> Install). This pairs the ESP32 as a
// REAL classic-Bluetooth device (like a pair of earbuds) so these buttons
// can control whatever music app is actually playing on the phone
// (Spotify, YouTube Music, etc.) - a website/PWA can never do that, only a
// true Bluetooth Classic + AVRCP connection can reach into another app's
// playback. It runs alongside the existing BLE telemetry link to the
// Accidiox app via ESP32 dual mode (BTDM) - two independent Bluetooth
// connections sharing the one radio.

// ---------------- Pin Configurations ----------------
#define PIN_BUZZER       4   // Piezo Buzzer Pin
#define PIN_HAZARD_LED   19  // Hazard Strobe LED Pin
#define PIN_BTN_UP       32  // Button 1 (Vol+ / Track Next)
#define PIN_BTN_CENTER   33  // Button 2 (Play/Pause / Cancel SOS)
#define PIN_BTN_DOWN     25  // Button 3 (Vol- / Track Prev)

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

// State Variables
bool isCrashActive = false;
unsigned long lastSerialPrint = 0;
unsigned long lastBleStream = 0;

// ---------------- BLE Setup ----------------
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

// ---------------- Media Remote (Classic BT AVRCP Controller) ----------------
BluetoothA2DPSink a2dp_sink;
bool mediaIsPlaying = false;

const unsigned long BTN_DEBOUNCE_MS = 40;
const unsigned long BTN_DOUBLE_CLICK_WINDOW_MS = 350;

// Up/Down need single-vs-double-click disambiguation (Vol+/Vol- vs
// Next/Prev Track). A single click only resolves once the double-click
// window passes without a second press, so it fires up to ~350ms after
// the tap - that delay is an unavoidable trade-off of this scheme, not a
// bug, and is standard behavior for any single/double-click button.
struct ClickButton {
  bool lastReading = HIGH;
  unsigned long lastChangeTime = 0;
  unsigned long lastReleaseTime = 0;
  bool waitingForSecondClick = false;
};
ClickButton btnUpClick, btnDownClick;

// Returns 0 = nothing yet, 1 = single click resolved, 2 = double click detected
int pollClickButton(ClickButton &btn, int pin) {
  bool reading = digitalRead(pin);
  int result = 0;

  if (reading != btn.lastReading && (millis() - btn.lastChangeTime) > BTN_DEBOUNCE_MS) {
    btn.lastChangeTime = millis();
    btn.lastReading = reading;

    if (reading == LOW) {
      // Press edge: is this the second click of a double-click?
      if (btn.waitingForSecondClick && (millis() - btn.lastReleaseTime) <= BTN_DOUBLE_CLICK_WINDOW_MS) {
        result = 2;
        btn.waitingForSecondClick = false;
      }
    } else {
      // Release edge: start (or restart) the double-click window
      btn.lastReleaseTime = millis();
      btn.waitingForSecondClick = true;
    }
  }

  // Window expired with no second click -> resolve as a single click
  if (btn.waitingForSecondClick && (millis() - btn.lastReleaseTime) > BTN_DOUBLE_CLICK_WINDOW_MS) {
    btn.waitingForSecondClick = false;
    result = 1;
  }

  return result;
}

// Center button only needs a plain debounced press edge (play/pause toggle,
// no double-click ambiguity) - separate from the crash-dismiss check below,
// which uses the raw level read further down so it keeps working exactly
// as before while a crash alarm is active.
struct SimpleButton {
  bool lastReading = HIGH;
  unsigned long lastChangeTime = 0;
};
SimpleButton btnCenterEdge;

bool pollPressEdge(SimpleButton &btn, int pin) {
  bool reading = digitalRead(pin);
  bool pressed = false;
  if (reading != btn.lastReading && (millis() - btn.lastChangeTime) > BTN_DEBOUNCE_MS) {
    btn.lastChangeTime = millis();
    btn.lastReading = reading;
    if (reading == LOW) pressed = true;
  }
  return pressed;
}

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
  Serial.println(F("  TWO-WHEELER BLACKBOX - HIGH-TILT & BUTTONS  "));
  Serial.println(F("  Accident Threshold: > 85.0 Degrees Lean      "));
  Serial.println(F("=============================================="));

  // 1. Initialize Output Actuators
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_HAZARD_LED, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_HAZARD_LED, LOW);

  // 2. Initialize Remote Buttons with Internal Pull-Ups
  pinMode(PIN_BTN_UP, INPUT_PULLUP);
  pinMode(PIN_BTN_CENTER, INPUT_PULLUP);
  pinMode(PIN_BTN_DOWN, INPUT_PULLUP);

  // 3. Startup Confirmation Beep (2 quick beeps)
  digitalWrite(PIN_BUZZER, HIGH); digitalWrite(PIN_HAZARD_LED, HIGH);
  delay(120);
  digitalWrite(PIN_BUZZER, LOW); digitalWrite(PIN_HAZARD_LED, LOW);
  delay(100);
  digitalWrite(PIN_BUZZER, HIGH); digitalWrite(PIN_HAZARD_LED, HIGH);
  delay(120);
  digitalWrite(PIN_BUZZER, LOW); digitalWrite(PIN_HAZARD_LED, LOW);

  // 4. Initialize I2C Bus (ESP32: SDA=21, SCL=22)
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

  // 4.5 Initialize Classic Bluetooth Media Remote (AVRCP). Must be started
  // BEFORE BLEDevice::init() below, with dual mode set first, or the two
  // Bluetooth stacks won't coexist correctly on the same radio.
  a2dp_sink.set_default_bt_mode(ESP_BT_MODE_BTDM);
  a2dp_sink.start("Accidiox Remote");
  Serial.println(F("[MEDIA] Classic BT Remote Ready. Pair \"Accidiox Remote\" in your phone's Bluetooth Settings (separately from the app)."));

  // 5. Initialize BLE Telemetry Server
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

  Serial.println(F("[SYSTEM] Blackbox Armed. Threshold >85 deg. Button Test Ready.\n"));
}

void loop() {
  float totalTilt = 0.0;
  float cur_ax = 0.0, cur_ay = 0.0, cur_az = 0.0;

  if (mpuFound) {
    if (readAccel(cur_ax, cur_ay, cur_az)) {
      float cur_norm = sqrt(cur_ax*cur_ax + cur_ay*cur_ay + cur_az*cur_az);
      if (cur_norm > 0.1) {
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

  // ---------------- Crash Detection Logic ----------------
  // Trigger ONLY when tilt exceeds 85 degrees (extreme crash / flat on ground)
  if (totalTilt >= CRASH_TILT_LIMIT) {
    isCrashActive = true;
  } else if (totalTilt < RECOVERY_LIMIT) {
    // Auto disarm when upright (< 55 degrees)
    isCrashActive = false;
  }

  // ---------------- Button State Reading & Testing ----------------
  bool btnUpPressed     = (digitalRead(PIN_BTN_UP) == LOW);
  bool btnCenterPressed = (digitalRead(PIN_BTN_CENTER) == LOW);
  bool btnDownPressed   = (digitalRead(PIN_BTN_DOWN) == LOW);
  bool anyButtonPressed = (btnUpPressed || btnCenterPressed || btnDownPressed);

  // Determine status payload to send over BLE
  String statusPayload = NORMAL;

  if (isCrashActive) {
    statusPayload = CRASH;
    // Center button dismisses active crash alarm
    if (btnCenterPressed) {
      isCrashActive = false;
      statusPayload = CANCEL_SAFE;
      Serial.println(F("[BUTTON 2] Crash Alarm Dismissed by Rider!"));
    }
  } else {
    // Button testing status and serial logging
    if (btnUpPressed) {
      statusPayload = BTN_UP;
      Serial.println(F("[BUTTON 1 - GPIO 32] PRESSED (Vol+ / Next Track)"));
    } else if (btnCenterPressed) {
      statusPayload = BTN_CENTER;
      Serial.println(F("[BUTTON 2 - GPIO 33] PRESSED (Play/Pause)"));
    } else if (btnDownPressed) {
      statusPayload = BTN_DOWN;
      Serial.println(F("[BUTTON 3 - GPIO 25] PRESSED (Vol- / Prev Track)"));
    }
  }

  // ---------------- Media Remote Button Actions ----------------
  // Independent of the BLE test-payload above so the on-screen button-flash
  // in the app keeps working exactly as before. Suppressed during an active
  // crash so the center button's crash-dismiss above takes priority.
  if (!isCrashActive) {
    int upClick = pollClickButton(btnUpClick, PIN_BTN_UP);
    if (upClick == 1) {
      a2dp_sink.volume_up();
      Serial.println(F("[MEDIA] Volume Up"));
    } else if (upClick == 2) {
      a2dp_sink.next();
      Serial.println(F("[MEDIA] Next Track"));
    }

    int downClick = pollClickButton(btnDownClick, PIN_BTN_DOWN);
    if (downClick == 1) {
      a2dp_sink.volume_down();
      Serial.println(F("[MEDIA] Volume Down"));
    } else if (downClick == 2) {
      a2dp_sink.previous();
      Serial.println(F("[MEDIA] Previous Track"));
    }

    if (pollPressEdge(btnCenterEdge, PIN_BTN_CENTER)) {
      if (mediaIsPlaying) {
        a2dp_sink.pause();
        mediaIsPlaying = false;
        Serial.println(F("[MEDIA] Pause"));
      } else {
        a2dp_sink.play();
        mediaIsPlaying = true;
        Serial.println(F("[MEDIA] Play"));
      }
    }
  }

  // ---------------- Safety Alarm & Button LED Control ----------------
  if (isCrashActive) {
    // Crash alarm: Fast strobe flashing + Continuous Buzzer
    digitalWrite(PIN_HAZARD_LED, (millis() % 200 < 100) ? HIGH : LOW);
    digitalWrite(PIN_BUZZER, HIGH);
  } else if (anyButtonPressed) {
    // BUTTON TEST MODE: When ANY button is pressed, LED turns solid HIGH!
    digitalWrite(PIN_HAZARD_LED, HIGH);
    digitalWrite(PIN_BUZZER, LOW);
  } else {
    // Normal resting state: Both LED and Buzzer OFF
    digitalWrite(PIN_HAZARD_LED, LOW);
    digitalWrite(PIN_BUZZER, LOW);
  }

  // ---------------- Serial Telemetry (Every 300ms) ----------------
  if (millis() - lastSerialPrint >= 300) {
    lastSerialPrint = millis();
    Serial.print(F("Tilt: ")); Serial.print(totalTilt, 1);
    Serial.print(F(" deg | Status: ")); Serial.print(statusPayload);
    Serial.print(F(" | [Btn1(32): ")); Serial.print(btnUpPressed ? ON : OFF);
    Serial.print(F(" Btn2(33): ")); Serial.print(btnCenterPressed ? ON : OFF);
    Serial.print(F(" Btn3(25): ")); Serial.print(btnDownPressed ? ON : OFF);
    Serial.println(F("]"));
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

