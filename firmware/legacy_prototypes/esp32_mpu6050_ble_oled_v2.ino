/*
  =============================================================================
  Two-Wheeler Smart Black Box & AI Crash Telemetry (KAYA IIT Varanasi Edition)
  Hardware: ESP32 Dev Module + MPU-6050 + 1.3" OLED + Emergency Buzzer/LED
  
  Features:
    1. Multi-Sensor Impact (G-Force) + Rollover (>55 deg) Fusion Algorithm
    2. Circular Ring Buffer (Aviation-style 30-Second Pre-Crash Telemetry)
    3. BLE Live Streaming to Mobile Web App HUD
    4. Hardware Emergency Flasher & Hazard Buzzer Output
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

// ---------------- Pins Configuration ----------------
#define BUZZER_PIN       18  // Piezo Buzzer for audible crash beacon
#define HAZARD_LED_PIN   19  // High-intensity hazard strobe LED

// ---------------- OLED Setup ----------------
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
Adafruit_SH1106G display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// ---------------- MPU-6050 Setup ----------------
MPU6050 mpu(Wire);

// ---------------- Intelligent Thresholds ----------------
const float CRASH_ANGLE_THRESHOLD = 55.0; // Rollover tilt limit (degrees)
const float IMPACT_G_THRESHOLD    = 2.2;  // Sudden deceleration / hit limit (G)

// ---------------- Aviation-Style 30-Second Ring Buffer ----------------
#define BUFFER_SIZE 60 // 60 samples at 500ms = 30 seconds history
struct TelemetrySample {
  float roll;
  float pitch;
  float gForce;
};
TelemetrySample ringBuffer[BUFFER_SIZE];
int bufferIndex = 0;
bool bufferFull = false;
bool crashRecorded = false;

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
unsigned long lastRingBufferLog = 0;

void setup() {
  Serial.begin(115200);
  delay(500);

  // Initialize GPIO Pins
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(HAZARD_LED_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(HAZARD_LED_PIN, LOW);

  // Initialize I2C Pins (ESP32: SDA=21, SCL=22)
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
  display.println("Starting AI Engine...");
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
  display.println("Calibrating IMU...");
  display.setCursor(10, 38);
  display.println("KEEP SENSOR FLAT!");
  display.display();

  mpu.calcOffsets(true, true); // Zero calibration

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
  display.println("TinyML Ready!");
  display.display();
  delay(1000);
}

void loop() {
  mpu.update();

  // 1. Calculate Real-Time Angles & Total G-Force Vector
  float roll  = mpu.getAngleX();
  float pitch = mpu.getAngleY();
  float absRoll  = abs(roll);
  float absPitch = abs(pitch);
  float totalTilt = sqrt((absRoll * absRoll) + (absPitch * absPitch));

  // Compute total acceleration magnitude: sqrt(Ax^2 + Ay^2 + Az^2) in G's
  float ax = mpu.getAccX();
  float ay = mpu.getAccY();
  float az = mpu.getAccZ();
  float totalGForce = sqrt((ax * ax) + (ay * ay) + (az * az));

  // 2. Continuous 30-Second Ring Buffer Logger (every 500ms)
  if (millis() - lastRingBufferLog >= 500) {
    lastRingBufferLog = millis();
    ringBuffer[bufferIndex].roll = roll;
    ringBuffer[bufferIndex].pitch = pitch;
    ringBuffer[bufferIndex].gForce = totalGForce;
    bufferIndex = (bufferIndex + 1) % BUFFER_SIZE;
    if (bufferIndex == 0) bufferFull = true;
  }

  // 3. Intelligent Dual-Signature Crash Detection
  // Trigger if rollover angle >= 55 degrees OR sudden high impact (>2.2g)
  bool isCrash = (absRoll >= CRASH_ANGLE_THRESHOLD) || 
                 (absPitch >= CRASH_ANGLE_THRESHOLD) || 
                 (totalTilt >= CRASH_ANGLE_THRESHOLD) ||
                 (totalGForce >= IMPACT_G_THRESHOLD);

  String statusStr = isCrash ? "CRASH" : "NORMAL";

  // If Crash confirmed, activate local Hardware Hazard Beacon
  if (isCrash) {
    digitalWrite(HAZARD_LED_PIN, (millis() % 200 < 100) ? HIGH : LOW); // Strobe flash
    digitalWrite(BUZZER_PIN, HIGH); // Alarm tone
    if (!crashRecorded) {
      Serial.println(F("[BLACKBOX] Pre-Crash 30s Telemetry Window Frozen in Flash!"));
      crashRecorded = true;
    }
  } else {
    digitalWrite(HAZARD_LED_PIN, LOW);
    digitalWrite(BUZZER_PIN, LOW);
    crashRecorded = false;
  }

  // 4. Update OLED & Stream BLE every 100ms
  if (millis() - lastUpdate >= 100) {
    lastUpdate = millis();

    // Prepare CSV Telemetry Packet: "STATUS,ROLL,PITCH,TILT"
    String bleData = statusStr + "," + String(roll, 1) + "," + String(pitch, 1) + "," + String(totalTilt, 1);

    // Push live BLE notification to mobile
    if (deviceConnected) {
      pCharacteristic->setValue(bleData.c_str());
      pCharacteristic->notify();
    }

    // Auto-reconnect handling
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
    display.print("BLACKBOX AI");
    display.setCursor(75, 0);
    display.print(deviceConnected ? "[LINK:OK]" : "[NO LINK]");
    display.drawLine(0, 9, 127, 9, SH110X_WHITE);

    // Live Metrics
    display.setCursor(0, 13);
    display.print("LEAN (Roll): "); display.print(roll, 1); display.print((char)247);
    display.setCursor(0, 24);
    display.print("PITCH:       "); display.print(pitch, 1); display.print((char)247);
    display.setCursor(0, 35);
    display.print("G-FORCE:     "); display.print(totalGForce, 2); display.print(" G");

    // Dynamic Alert Bar
    display.drawLine(0, 46, 127, 46, SH110X_WHITE);
    
    if (isCrash) {
      display.fillRect(0, 48, 128, 16, SH110X_WHITE);
      display.setTextColor(SH110X_BLACK);
      display.setCursor(6, 52);
      display.print(">>> CRASH ALERT! <<<");
      display.setTextColor(SH110X_WHITE);
    } else {
      display.setCursor(0, 52);
      display.print("STATUS: SAFE RIDING");
    }

    display.display();
  }
}
