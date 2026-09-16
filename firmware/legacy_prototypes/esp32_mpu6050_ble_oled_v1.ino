/*
  =============================================================================
  Two-Wheeler Blackbox - Step 3: MPU-6050 + OLED + BLE (55-Degree Fall Detection)
  Board: ESP32 Dev Module
  Libraries Required:
    - MPU6050_light (by rfetick)
    - Adafruit_SH110X (by Adafruit)
    - Adafruit_GFX (by Adafruit)
  =============================================================================
*/

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SH110X.h>
#include <MPU6050_light.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ---------------- OLED Setup ----------------
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
Adafruit_SH1106G display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// ---------------- MPU-6050 Setup ----------------
MPU6050 mpu(Wire);

// ---------------- Threshold Configuration ----------------
// Trigger crash if bike tilts 55 degrees or more in ANY direction
const float CRASH_ANGLE_THRESHOLD = 55.0; 

// ---------------- BLE UUID Definitions ----------------
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial.println("[BLE] Phone Connected!");
    };

    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      Serial.println("[BLE] Phone Disconnected!");
    }
};

unsigned long lastUpdate = 0;

void setup() {
  Serial.begin(115200);
  delay(500);

  Wire.begin(21, 22);

  // 1. Initialize OLED Screen
  if (!display.begin(0x3C, true)) {
    Serial.println(F("[ERROR] OLED not detected!"));
    while (1);
  }
  display.clearDisplay();
  display.setTextColor(SH110X_WHITE);
  display.setTextSize(1);
  display.setCursor(10, 15);
  display.println("SMART BLACKBOX");
  display.setCursor(10, 35);
  display.println("Starting BLE & MPU...");
  display.display();
  delay(1200);

  // 2. Initialize MPU-6050
  byte status = mpu.begin();
  if (status != 0) {
    display.clearDisplay();
    display.setCursor(0, 25);
    display.println("MPU6050 Error!");
    display.display();
    while (1);
  }
  
  display.clearDisplay();
  display.setCursor(10, 20);
  display.println("Calibrating MPU...");
  display.setCursor(10, 38);
  display.println("KEEP SENSOR FLAT!");
  display.display();

  // Calibrate gyro & accel offsets (Sensor MUST be flat on table)
  mpu.calcOffsets(true, true);

  // 3. Initialize BLE
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

  display.clearDisplay();
  display.setCursor(15, 25);
  display.println("Ready & Calibrated!");
  display.display();
  delay(1000);
}

void loop() {
  mpu.update();

  if (millis() - lastUpdate >= 100) {
    lastUpdate = millis();

    // Read Roll (Left/Right lean) and Pitch (Front/Back tilt)
    float roll  = mpu.getAngleX(); // Side lean
    float pitch = mpu.getAngleY(); // Front/back tilt
    
    // Absolute lean angle values
    float absRoll  = abs(roll);
    float absPitch = abs(pitch);

    // Calculate maximum tilt across all directions
    float totalTilt = sqrt((absRoll * absRoll) + (absPitch * absPitch));

    // Check if lean angle has crossed the 55 degree safety threshold
    bool isCrash = (absRoll >= CRASH_ANGLE_THRESHOLD) || 
                   (absPitch >= CRASH_ANGLE_THRESHOLD) || 
                   (totalTilt >= CRASH_ANGLE_THRESHOLD);

    String statusStr = isCrash ? "CRASH" : "NORMAL";

    // Prepare CSV Telemetry Packet: "STATUS,ROLL,PITCH,TILT"
    String bleData = statusStr + "," + String(roll, 1) + "," + String(pitch, 1) + "," + String(totalTilt, 1);

    // Broadcast over BLE
    if (deviceConnected) {
      pCharacteristic->setValue(bleData.c_str());
      pCharacteristic->notify();
    }

    // Handle reconnect
    if (!deviceConnected && oldDeviceConnected) {
        delay(500);
        pServer->startAdvertising();
        oldDeviceConnected = deviceConnected;
    }
    if (deviceConnected && !oldDeviceConnected) {
        oldDeviceConnected = deviceConnected;
    }

    // ---------------- Update OLED Display ----------------
    display.clearDisplay();
    display.setTextSize(1);
    
    // Header Bar
    display.setCursor(0, 0);
    display.print("BLACKBOX");
    display.setCursor(75, 0);
    display.print(deviceConnected ? "[BT:CONNECTED]" : "[BT:SEARCH]");
    display.drawLine(0, 9, 127, 9, SH110X_WHITE);

    // Live Angle Readings
    display.setCursor(0, 13);
    display.print("ROLL (Lean): "); 
    display.print(roll, 1); 
    display.print((char)247);

    display.setCursor(0, 24);
    display.print("PITCH:       "); 
    display.print(pitch, 1); 
    display.print((char)247);

    display.setCursor(0, 35);
    display.print("TOTAL TILT:  "); 
    display.print(totalTilt, 1); 
    display.print((char)247);

    // Visual Alert Bar
    display.drawLine(0, 46, 127, 46, SH110X_WHITE);
    
    if (isCrash) {
      // Flashing Crash Box
      display.fillRect(0, 48, 128, 16, SH110X_WHITE);
      display.setTextColor(SH110X_BLACK); // Inverted text
      display.setCursor(6, 52);
      display.print(">>> CRASH DETECTED <<<");
      display.setTextColor(SH110X_WHITE); // Reset text color
    } else if (totalTilt >= 35.0) {
      display.setCursor(0, 52);
      display.print("STATUS: SHARP LEAN");
    } else {
      display.setCursor(0, 52);
      display.print("STATUS: SAFE RIDING");
    }

    display.display();
  }
}
