/*
  =============================================================
  Two-Wheeler Blackbox - Step 1: Real-Time Angle Measurement
  Hardware: ESP32 + MPU-6050 (IMU) + 1.3" I2C OLED (SH1106)
  =============================================================
*/

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SH110X.h> // Standard for 1.3" OLEDs
#include <MPU6050_light.h>   // Fast, complementary filtered angles

// OLED Display Configuration (1.3 inch is 128x64, uses SH1106 driver)
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
Adafruit_SH1106G display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// MPU6050 Sensor Object
MPU6050 mpu(Wire);

unsigned long lastUpdate = 0;

void setup() {
  Serial.begin(115200);
  delay(500);

  // Initialize I2C Communication on ESP32 (SDA = GPIO 21, SCL = GPIO 22)
  Wire.begin(21, 22);

  // 1. Initialize OLED Display (I2C address: 0x3C)
  if (!display.begin(0x3C, true)) {
    Serial.println(F("[ERROR] OLED Display not found at 0x3C!"));
    while (1);
  }
  
  display.clearDisplay();
  display.setTextColor(SH110X_WHITE);
  display.setTextSize(1);
  display.setCursor(10, 10);
  display.println("BLACKBOX SYSTEM");
  display.setCursor(5, 28);
  display.println("Calibrating MPU...");
  display.setCursor(5, 44);
  display.println("Keep sensor flat!");
  display.display();
  delay(1500);

  // 2. Initialize MPU6050
  byte status = mpu.begin();
  if (status != 0) {
    display.clearDisplay();
    display.setCursor(0, 20);
    display.println("MPU6050 Error!");
    display.setCursor(0, 35);
    display.println("Check SDA/SCL pins");
    display.display();
    while (1);
  }

  // 3. Calibrate Gyro and Accelerometer offsets
  mpu.calcOffsets(true, true);

  display.clearDisplay();
  display.setCursor(15, 25);
  display.println("Calibration Done!");
  display.display();
  delay(1000);
}

void loop() {
  // Update sensor readings continuously
  mpu.update();

  // Refresh screen every 50ms (20 FPS smooth update)
  if (millis() - lastUpdate >= 50) {
    lastUpdate = millis();

    // Read calculated angles
    float pitch = mpu.getAngleX(); // Front / Back lean
    float roll  = mpu.getAngleY(); // Left / Right lean (Crucial for bike fall)
    float yaw   = mpu.getAngleZ(); // Steering yaw

    // Total absolute tilt
    float totalTilt = sqrt((pitch * pitch) + (roll * roll));

    // Serial monitor output
    Serial.print("Pitch: "); Serial.print(pitch, 1);
    Serial.print(" | Roll: "); Serial.print(roll, 1);
    Serial.print(" | Tilt: "); Serial.println(totalTilt, 1);

    // Render on OLED
    display.clearDisplay();

    // Header
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.print("BLACKBOX - ANGLE HUD");
    display.drawLine(0, 9, 127, 9, SH110X_WHITE);

    // Roll (Lean)
    display.setCursor(0, 14);
    display.print("ROLL (Lean): ");
    display.print(roll, 1);
    display.print((char)247);

    // Pitch
    display.setCursor(0, 26);
    display.print("PITCH:       ");
    display.print(pitch, 1);
    display.print((char)247);

    // Total Tilt
    display.setCursor(0, 38);
    display.print("TOTAL TILT:  ");
    display.print(totalTilt, 1);
    display.print((char)247);

    // Dynamic Status Indicator
    display.drawLine(0, 50, 127, 50, SH110X_WHITE);
    display.setCursor(0, 54);
    if (totalTilt >= 60.0) {
      display.print(">>> CRASH / FALL! <<<");
    } else if (totalTilt >= 40.0) {
      display.print("STATUS: DANGEROUS LEAN");
    } else {
      display.print("STATUS: NORMAL");
    }

    display.display();
  }
}
