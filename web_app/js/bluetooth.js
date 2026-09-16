// Web Bluetooth Manager for ESP32 Smart Blackbox
class BleBlackboxManager {
  constructor(onDataCallback, onStatusChangeCallback, onReconnectingCallback) {
    this.serviceUUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b".toLowerCase();
    this.charUUID    = "beb5483e-36e1-4688-b7f5-ea07361b26a8".toLowerCase();

    this.device = null;
    this.characteristic = null;
    this.isConnected = false;
    this.userInitiatedDisconnect = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 6;
    this.reconnectTimer = null;

    this.onData = onDataCallback;
    this.onStatusChange = onStatusChangeCallback;
    this.onReconnecting = onReconnectingCallback || (() => {});
  }

  isSupported() {
    return navigator.bluetooth !== undefined;
  }

  // Scan & Connect to ESP32 (requires a user gesture — first-time pairing only)
  async connect() {
    if (!this.isSupported()) {
      alert("Web Bluetooth is not supported on this browser. Please use Google Chrome on Android, Windows, or Mac.");
      return;
    }

    try {
      console.log("[BLE] Requesting Bluetooth Device...");
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: "Bike-Blackbox" }],
        optionalServices: [this.serviceUUID]
      });

      this.userInitiatedDisconnect = false;
      await this._bindToDevice(device);
    } catch (error) {
      console.error("[BLE Error]", error);
      this.isConnected = false;
      this.onStatusChange(false, error.message);
    }
  }

  // Silently reconnect to a previously-paired device without showing the
  // chooser again — used on every page load and after an unexpected drop.
  // Web Bluetooth allows gatt.connect() on an already-authorized device
  // without a fresh user gesture, only the very first pairing needs one.
  async tryAutoReconnect() {
    if (!this.isSupported() || !navigator.bluetooth.getDevices) return false;
    if (this.isConnected) return true;

    try {
      const knownDevices = await navigator.bluetooth.getDevices();
      const target = knownDevices.find((d) => d.name && d.name.startsWith("Bike-Blackbox"));
      if (!target) return false;

      console.log("[BLE] Known device found, reconnecting silently...");
      this.userInitiatedDisconnect = false;
      await this._bindToDevice(target);
      return true;
    } catch (error) {
      console.warn("[BLE] Auto-reconnect failed:", error.message);
      return false;
    }
  }

  async _bindToDevice(device) {
    this.device = device;
    this.device.addEventListener("gattserverdisconnected", () => this._handleUnexpectedDisconnect());

    console.log("[BLE] Connecting to GATT Server...");
    const server = await this.device.gatt.connect();

    console.log("[BLE] Getting Primary Service...");
    const service = await server.getPrimaryService(this.serviceUUID);

    console.log("[BLE] Getting Characteristic...");
    this.characteristic = await service.getCharacteristic(this.charUUID);

    await this.characteristic.startNotifications();
    this.characteristic.addEventListener("characteristicvaluechanged", (event) => this.handleValueChange(event));

    this.isConnected = true;
    this.reconnectAttempts = 0;
    this.onStatusChange(true, this.device.name || "Bike-Blackbox-ESP32");
    console.log("[BLE] Connected & Subscribed to Telemetry!");
  }

  // Handle incoming stream data: "STATUS,ROLL,PITCH,TILT"
  handleValueChange(event) {
    const value = event.target.value;
    const decoder = new TextDecoder("utf-8");
    const rawString = decoder.decode(value).trim();

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

  // Disconnect manually (rider tapped Disconnect) — no auto-reconnect after this
  async disconnect() {
    this.userInitiatedDisconnect = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.device && this.device.gatt.connected) {
      await this.device.gatt.disconnect();
    }
    this.isConnected = false;
    this.onStatusChange(false, "Disconnected");
    console.log("[BLE] Device Disconnected (manual)");
  }

  // The link dropped on its own (out of range, phone screen sleep, page
  // navigation, interference) — keep retrying with backoff instead of just
  // giving up, since a safety device silently going offline is the one
  // thing this app can't allow.
  _handleUnexpectedDisconnect() {
    this.isConnected = false;

    if (this.userInitiatedDisconnect) {
      this.onStatusChange(false, "Disconnected");
      return;
    }

    console.warn("[BLE] Unexpected disconnect — attempting to reconnect...");
    this.onReconnecting(true);
    this._scheduleReconnect();
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn("[BLE] Gave up reconnecting after", this.reconnectAttempts, "attempts.");
      this.onReconnecting(false);
      this.onStatusChange(false, "Disconnected");
      return;
    }

    const delayMs = Math.min(1000 * Math.pow(1.6, this.reconnectAttempts), 8000);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(async () => {
      if (this.userInitiatedDisconnect || this.isConnected) return;
      try {
        if (this.device && this.device.gatt) {
          await this._bindToDevice(this.device);
          this.onReconnecting(false);
        } else {
          this._scheduleReconnect();
        }
      } catch (error) {
        console.warn(`[BLE] Reconnect attempt ${this.reconnectAttempts} failed:`, error.message);
        this._scheduleReconnect();
      }
    }, delayMs);
  }
}
