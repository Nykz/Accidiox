/*
  =============================================================================
  AUTONOMOUS TWO-WHEELER BLACKBOX & TELEMATICS (STABLE GSM/GPS EDITION)
  =============================================================================
*/

#include <Wire.h>
#include <HardwareSerial.h>
#include <MPU6050_light.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#define PIN_GSM_RX       16
#define PIN_GSM_TX       17
#define PIN_BTN_UP       32
#define PIN_BTN_CENTER   33
#define PIN_BTN_DOWN     25
#define PIN_BUZZER       18
#define PIN_HAZARD_LED   19

const String EMERGENCY_PHONE = "919876543210";

HardwareSerial gsmSerial(2);
MPU6050 mpu(Wire);
bool mpuInitialized = false;

const float CRASH_ANGLE_THRESHOLD = 55.0;
const float RECOVERY_ANGLE_THRESHOLD = 35.0;
const unsigned long FALL_HOLD_TIME_MS = 1200;

unsigned long fallStartTime = 0;
bool isCrashConfirmed = false;
bool emergencyDispatched = false;
unsigned long crashTriggerTime = 0;
const unsigned long COUNTDOWN_MS = 20000;

#define BUFFER_SIZE 60
struct TelemetrySample {
  float roll;
  float pitch;
  float gForce;
};
TelemetrySample ringBuffer[BUFFER_SIZE];
int bufferIdx = 0;

String currentLat = "25.2677";
String currentLon = "82.9913";

#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

class ServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial.println(F("[BLE] Connected!"));
    };

    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      Serial.println(F("[BLE] Disconnected!"));
    }
};

void initGsmModem();
void sendAutonomousCellularAlert(String lat, String lon);
void sendGsmCommand(String command, int timeoutMs);

unsigned long lastTelemetryStream = 0;
unsigned long lastRingBufferRecord = 0;

void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(PIN_BTN_UP, INPUT_PULLUP);
  pinMode(PIN_BTN_CENTER, INPUT_PULLUP);
  pinMode(PIN_BTN_DOWN, INPUT_PULLUP);

  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_HAZARD_LED, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_HAZARD_LED, LOW);

  Wire.begin(21, 22);
  Wire.setClock(100000);

  byte status = mpu.begin();
  if (status != 0) {
    Serial.println(F("[ERROR] MPU6050 failure."));
    mpuInitialized = false;
  } else {
    Serial.println(F("[IMU] Calibrating. Keep board FLAT on desk..."));
    digitalWrite(PIN_HAZARD_LED, HIGH);
    delay(1000);
    mpu.calcOffsets(true, true);
    digitalWrite(PIN_HAZARD_LED, LOW);
    mpuInitialized = true;
    Serial.println(F("[IMU] Calibration Complete."));
  }

  BLEDevice::init("Bike-Blackbox-ESP32");
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());

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

  digitalWrite(PIN_BUZZER, HIGH); delay(100); digitalWrite(PIN_BUZZER, LOW);
}

void loop() {
  if (mpuInitialized) {
    mpu.update();
  }

  float roll = mpuInitialized ? mpu.getAngleX() : 0.0;
  float pitch = mpuInitialized ? mpu.getAngleY() : 0.0;
  if (isnan(roll)) roll = 0.0;
  if (isnan(pitch)) pitch = 0.0;

  float absRoll = abs(roll);
  float absPitch = abs(pitch);
  float totalTilt = sqrt((absRoll * absRoll) + (absPitch * absPitch));

  float ax = mpuInitialized ? mpu.getAccX() : 0.0;
  float ay = mpuInitialized ? mpu.getAccY() : 0.0;
  float az = mpuInitialized ? mpu.getAccZ() : 1.0;
  float totalGForce = sqrt((ax * ax) + (ay * ay) + (az * az));

  if (millis() - lastRingBufferRecord >= 500) {
    lastRingBufferRecord = millis();
    ringBuffer[bufferIdx].roll = roll;
    ringBuffer[bufferIdx].pitch = pitch;
    ringBuffer[bufferIdx].gForce = totalGForce;
    bufferIdx = (bufferIdx + 1) % BUFFER_SIZE;
  }

  // Continuous Hold Fall Filter (1.2s debounced)
  bool isTilted = (absRoll >= CRASH_ANGLE_THRESHOLD) || 
                  (absPitch >= CRASH_ANGLE_THRESHOLD) || 
                  (totalTilt >= CRASH_ANGLE_THRESHOLD);

  if (isTilted) {
    if (fallStartTime == 0) {
      fallStartTime = millis();
    } else if (millis() - fallStartTime >= FALL_HOLD_TIME_MS) {
      if (!isCrashConfirmed) {
        isCrashConfirmed = true;
        emergencyDispatched = false;
        crashTriggerTime = millis();
      }
    }
  } else {
    fallStartTime = 0;
    if (totalTilt <= RECOVERY_ANGLE_THRESHOLD) {
      isCrashConfirmed = false;
    }
  }

  String systemStatus = "NORMAL";

  if (isCrashConfirmed) {
    systemStatus = "CRASH";
    digitalWrite(PIN_HAZARD_LED, (millis() % 200 < 100) ? HIGH : LOW);
    digitalWrite(PIN_BUZZER, HIGH);

    if (millis() - crashTriggerTime >= COUNTDOWN_MS && !emergencyDispatched) {
      emergencyDispatched = true;
      if (!deviceConnected) {
        sendAutonomousCellularAlert(currentLat, currentLon);
      }
    }
  } else {
    digitalWrite(PIN_HAZARD_LED, LOW);
    digitalWrite(PIN_BUZZER, LOW);
  }

  // Handlebar Buttons
  if (digitalRead(PIN_BTN_UP) == LOW) {
    systemStatus = "BTN_UP";
    delay(150);
  }

  if (digitalRead(PIN_BTN_CENTER) == LOW) {
    if (isCrashConfirmed) {
      isCrashConfirmed = false;
      fallStartTime = 0;
      emergencyDispatched = false;
      digitalWrite(PIN_HAZARD_LED, LOW);
      digitalWrite(PIN_BUZZER, LOW);
      systemStatus = "CANCEL_SAFE";
    } else {
      systemStatus = "BTN_CENTER";
    }
    delay(200);
  }

  if (millis() - lastTelemetryStream >= 100) {
    lastTelemetryStream = millis();

    String blePayload = systemStatus + "," + String(roll, 1) + "," + String(pitch, 1) + "," + String(totalTilt, 1);

    if (deviceConnected) {
      pCharacteristic->setValue(blePayload.c_str());
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

void initGsmModem() {
  sendGsmCommand("AT", 1000);
  sendGsmCommand("ATE0", 1000);
  sendGsmCommand("AT+CMGF=1", 1000);
}

void sendAutonomousCellularAlert(String lat, String lon) {
  String mapsUrl = "https://maps.google.com/?q=" + lat + "," + lon;
  String smsMessage = "EMERGENCY ALERT: Accident detected. Live GPS: " + mapsUrl;

  gsmSerial.print("AT+CMGS=\"");
  gsmSerial.print(EMERGENCY_PHONE);
  gsmSerial.println("\"");
  delay(300);
  gsmSerial.print(smsMessage);
  gsmSerial.write(26);
  delay(4000);

  gsmSerial.print("ATD");
  gsmSerial.print(EMERGENCY_PHONE);
  gsmSerial.println(";");
  delay(15000);
  gsmSerial.println("ATH");
}

void sendGsmCommand(String command, int timeoutMs) {
  gsmSerial.println(command);
  unsigned long start = millis();
  while (millis() - start < timeoutMs) {
    while (gsmSerial.available()) {
      Serial.write(gsmSerial.read());
    }
  }
}
