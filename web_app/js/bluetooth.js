// Web Bluetooth Manager for ESP32 Smart Blackbox
class BleBlackboxManager {
  constructor(onDataCallback, onStatusChangeCallback) {
    this.serviceUUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b".toLowerCase();
    this.charUUID    = "beb5483e-36e1-4688-b7f5-ea07361b26a8".toLowerCase();
    
    this.device = null;
    this.characteristic = null;
    this.isConnected = false;
    
    this.onData = onDataCallback;
    this.onStatusChange = onStatusChangeCallback;
  }

  // Check if browser supports Web Bluetooth
  isSupported() {
    return navigator.bluetooth !== undefined;
  }

  // Scan & Connect to ESP32
  async connect() {
    if (!this.isSupported()) {
      alert("Web Bluetooth is not supported on this browser. Please use Google Chrome on Android, Windows, or Mac.");
      return;
    }

    try {
      console.log("[BLE] Requesting Bluetooth Device...");
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: "Bike-Blackbox" }],
        optionalServices: [this.serviceUUID]
      });

      this.device.addEventListener("gattserverdisconnected", () => this.handleDisconnect());

      console.log("[BLE] Connecting to GATT Server...");
      const server = await this.device.gatt.connect();

      console.log("[BLE] Getting Primary Service...");
      const service = await server.getPrimaryService(this.serviceUUID);

      console.log("[BLE] Getting Characteristic...");
      this.characteristic = await service.getCharacteristic(this.charUUID);

      // Start notifications
      await this.characteristic.startNotifications();
      this.characteristic.addEventListener("characteristicvaluechanged", (event) => this.handleValueChange(event));

      this.isConnected = true;
      this.onStatusChange(true, this.device.name || "Bike-Blackbox-ESP32");
      console.log("[BLE] Connected & Subscribed to Telemetry!");

    } catch (error) {
      console.error("[BLE Error]", error);
      this.isConnected = false;
      this.onStatusChange(false, error.message);
    }
  }

  // Handle incoming stream data: "STATUS,ROLL,PITCH,TILT"
  handleValueChange(event) {
    const value = event.target.value;
    const decoder = new TextDecoder("utf-8");
    const rawString = decoder.decode(value).trim();

    // Parse CSV
    const parts = rawString.split(",");
    if (parts.length >= 4) {
      const telemetry = {
        status: parts[0],
        roll: parseFloat(parts[1]),
        pitch: parseFloat(parts[2]),
        tilt: parseFloat(parts[3]),
        raw: rawString
      };
      this.onData(telemetry);
    }
  }

  // Disconnect manually
  async disconnect() {
    if (this.device && this.device.gatt.connected) {
      await this.device.gatt.disconnect();
    }
    this.handleDisconnect();
  }

  handleDisconnect() {
    this.isConnected = false;
    this.onStatusChange(false, "Disconnected");
    console.log("[BLE] Device Disconnected");
  }
}
