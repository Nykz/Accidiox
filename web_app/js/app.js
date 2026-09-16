// Accidiox Telematics Application Controller (Reliable Emergency Dispatch Edition)

const CONTACTS_STORAGE_KEY = "accidiox_emergency_contacts";

const CONFIG = {
  countdownDuration: 20,
  wampApiUrl: "api/log_accident.php"
};

let appState = {
  currentLat: null,
  currentLon: null,
  currentLocationName: "Locating area & city...",
  currentSpeed: 0,
  gpsAccuracy: null,
  nearestHospital: "Locating hospital...",
  nearestPolice: "Locating police precinct...",
  isEmergencyActive: false,
  countdownTimer: null,
  remainingSeconds: 20,
  rideSeconds: 0,
  rideTimerInterval: null,
  audioContext: null,
  sirenInterval: null,
  wakeLock: null,
  contacts: []
};

// BLE Client Instance
const bleManager = new BleBlackboxManager(
  (telemetry) => handleTelemetry(telemetry),
  (isConnected, info) => handleConnectionState(isConnected, info),
  (isReconnecting) => handleReconnecting(isReconnecting)
);

// DOM Elements
const elBtnConnectMain   = document.getElementById("btnConnectMain");
const elBtnDisconnect    = document.getElementById("btnDisconnect");
const elHeaderBadge      = document.getElementById("headerBadge");
const elHeaderBadgeText  = document.getElementById("headerBadgeText");
const elHeaderBadgeSlash = document.getElementById("headerBadgeSlash");
const elDeviceStatusText = document.getElementById("deviceStatusText");

const elHeroHelperText   = document.getElementById("heroHelperText");
const elClusterStatusBadge = document.getElementById("clusterStatusBadge");
const elClusterStatusText  = document.getElementById("clusterStatusText");
const elSpeedValue       = document.getElementById("clusterSpeedValue");
const elRideTime         = document.getElementById("rideTime");
const elRollValue        = document.getElementById("rollValue");
const elPitchValue       = document.getElementById("pitchValue");
const elLocationName     = document.getElementById("locationName");
const elLocationCoords   = document.getElementById("locationCoords");
const elHospitalDiag     = document.getElementById("hospitalDiag");
const elPoliceDiag       = document.getElementById("policeDiag");

const elGpsDiagStatus    = document.getElementById("gpsDiagStatus");
const elBleDiagStatus    = document.getElementById("bleDiagStatus");
const elServerDiagStatus = document.getElementById("serverDiagStatus");

const elEmergencyModal   = document.getElementById("emergencyModal");
const elCountdownNumber  = document.getElementById("countdownNumber");
const elBtnCancelSos     = document.getElementById("btnCancelSos");

const elContactsList     = document.getElementById("contactsList");
const elAddContactForm   = document.getElementById("addContactForm");
const elContactNameInput = document.getElementById("contactNameInput");
const elContactPhoneInput = document.getElementById("contactPhoneInput");

const elUiBtn1           = document.getElementById("uiBtn1");
const elUiBtn2           = document.getElementById("uiBtn2");
const elUiBtn3           = document.getElementById("uiBtn3");

document.addEventListener("DOMContentLoaded", () => {
  elBtnConnectMain.addEventListener("click", () => {
    bleManager.connect();
    requestWakeLock();
  });
  elBtnDisconnect.addEventListener("click", () => {
    bleManager.disconnect();
    releaseWakeLock();
  });
  elBtnCancelSos.addEventListener("click", () => cancelEmergency());

  loadContacts();
  if (elAddContactForm) {
    elAddContactForm.addEventListener("submit", (e) => {
      e.preventDefault();
      addContact();
    });
  }

  // Interactive buttons on screen
  if (elUiBtn1) elUiBtn1.addEventListener("click", () => flashBtnUi(elUiBtn1));
  if (elUiBtn2) elUiBtn2.addEventListener("click", () => { flashBtnUi(elUiBtn2); if (appState.isEmergencyActive) cancelEmergency(); });
  if (elUiBtn3) elUiBtn3.addEventListener("click", () => { flashBtnUi(elUiBtn3); triggerEmergencyRoutine({ tilt: 60, roll: 55, pitch: 10 }); });

  initGeolocation();
  testServerConnection();

  // Silently reconnect to the last-paired device on every load — covers
  // navigating to the Incident Map and back, reopening the app, etc.
  bleManager.tryAutoReconnect();
});

// Bottom-nav view switching (Overview <-> Settings), no page reload so the
// BLE connection never drops just from checking settings.
function showView(name) {
  const home = document.getElementById("homeView");
  const settings = document.getElementById("settingsView");
  const navOverview = document.getElementById("navOverview");
  const navSettings = document.getElementById("navSettings");
  if (!home || !settings) return;

  const showSettings = name === "settings";
  home.style.display = showSettings ? "none" : "flex";
  settings.style.display = showSettings ? "flex" : "none";
  navOverview.classList.toggle("active", !showSettings);
  navSettings.classList.toggle("active", showSettings);
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });

  // Leaflet renders tiles wrong if it was sized while hidden — fix it up
  // now that the container is visible again.
  if (!showSettings && liveMap) {
    setTimeout(() => liveMap.invalidateSize(), 50);
  }
}
window.showView = showView;

// Screen WakeLock
async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      appState.wakeLock = await navigator.wakeLock.request("screen");
      console.log("[WakeLock] Active.");
    }
  } catch (err) {
    console.warn("[WakeLock] Error:", err.message);
  }
}

function releaseWakeLock() {
  if (appState.wakeLock) {
    appState.wakeLock.release();
    appState.wakeLock = null;
  }
}

// Emergency Contacts (persisted locally on this rider's phone)
function loadContacts() {
  try {
    const stored = JSON.parse(localStorage.getItem(CONTACTS_STORAGE_KEY));
    appState.contacts = Array.isArray(stored) ? stored : [];
  } catch (e) {
    appState.contacts = [];
  }

  if (appState.contacts.length === 0) {
    appState.contacts = [{ name: "Primary Contact", phone: "919876543210" }];
    saveContacts();
  }

  renderContacts();
}

function saveContacts() {
  localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(appState.contacts));
}

function addContact() {
  const name = elContactNameInput.value.trim() || "Emergency Contact";
  const phone = elContactPhoneInput.value.replace(/[^0-9]/g, "");

  if (phone.length < 10) {
    elContactPhoneInput.focus();
    return;
  }

  appState.contacts.push({ name, phone });
  saveContacts();
  renderContacts();

  elContactNameInput.value = "";
  elContactPhoneInput.value = "";
  elContactNameInput.focus();
}

function removeContact(index) {
  appState.contacts.splice(index, 1);
  saveContacts();
  renderContacts();
}

function renderContacts() {
  if (!elContactsList) return;
  elContactsList.innerHTML = "";

  if (appState.contacts.length === 0) {
    elContactsList.innerHTML = '<div class="contacts-empty">No emergency contacts added yet.</div>';
    return;
  }

  appState.contacts.forEach((contact, index) => {
    const initial = (contact.name || "?").trim().charAt(0).toUpperCase();
    const row = document.createElement("div");
    row.className = "contact-row" + (index === 0 ? " primary" : "");
    row.innerHTML = `
      <div class="contact-avatar">${initial}</div>
      <div class="contact-body">
        <div class="contact-name-row">
          <span class="contact-name">${contact.name}</span>
          ${index === 0 ? '<span class="contact-primary-tag">Primary</span>' : ""}
        </div>
        <div class="contact-phone">+${contact.phone}</div>
      </div>
      <button type="button" class="btn-remove-contact" aria-label="Remove contact">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
      </button>
    `;
    row.querySelector(".btn-remove-contact").addEventListener("click", () => removeContact(index));
    elContactsList.appendChild(row);
  });
}

// 1. Geolocation & Reverse Geocoding
let liveMap = null;
let riderMarker = null;

function initLiveMap(lat, lon) {
  const mapEl = document.getElementById("liveMap");
  if (!mapEl || typeof L === "undefined" || liveMap) return;

  liveMap = L.map("liveMap", { zoomControl: false, attributionControl: true }).setView([lat, lon], 15);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(liveMap);

  const icon = L.divIcon({ className: "rider-marker", iconSize: [18, 18] });
  riderMarker = L.marker([lat, lon], { icon }).addTo(liveMap);
}

function updateLiveMap(lat, lon) {
  if (!liveMap) {
    initLiveMap(lat, lon);
    return;
  }
  riderMarker.setLatLng([lat, lon]);
  liveMap.panTo([lat, lon]);
}

function initGeolocation() {
  if ("geolocation" in navigator) {
    navigator.geolocation.watchPosition(
      (pos) => {
        appState.currentLat = pos.coords.latitude;
        appState.currentLon = pos.coords.longitude;
        appState.currentSpeed = pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 0;
        appState.gpsAccuracy = pos.coords.accuracy ? Math.round(pos.coords.accuracy) : 10;

        elSpeedValue.textContent = appState.currentSpeed;
        elLocationCoords.textContent = `${appState.currentLat.toFixed(4)} N, ${appState.currentLon.toFixed(4)} E (Accuracy: ${appState.gpsAccuracy}m)`;
        elGpsDiagStatus.textContent = "Active";
        elGpsDiagStatus.className = "diag-value online";

        reverseGeocodeAddress(appState.currentLat, appState.currentLon);
        fetchNearestEmergencyFacilities(appState.currentLat, appState.currentLon);
        updateLiveMap(appState.currentLat, appState.currentLon);
      },
      (err) => {
        console.warn("[GPS] Fallback:", err.message);
        appState.currentLat = 25.2677;
        appState.currentLon = 82.9913;
        appState.currentLocationName = "Lanka, Varanasi, Uttar Pradesh";
        elLocationName.textContent = appState.currentLocationName;
        elLocationCoords.textContent = "25.2677 N, 82.9913 E";
        elGpsDiagStatus.textContent = "Active (Varanasi)";
        elGpsDiagStatus.className = "diag-value online";
        fetchNearestEmergencyFacilities(25.2677, 82.9913);
        updateLiveMap(25.2677, 82.9913);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }
}

async function reverseGeocodeAddress(lat, lon) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
    const data = await res.json();
    if (data && data.address) {
      const addr = data.address;
      const locality = addr.suburb || addr.neighbourhood || addr.road || addr.village || addr.county || "";
      const city = addr.city || addr.town || addr.state_district || "";
      const state = addr.state || "";
      const parts = [locality, city, state].filter(Boolean);
      appState.currentLocationName = parts.length > 0 ? parts.join(", ") : data.display_name.split(",").slice(0, 3).join(",");
    } else {
      appState.currentLocationName = "Current Riding Location";
    }
  } catch (e) {
    appState.currentLocationName = "Current Riding Area";
  }
  elLocationName.textContent = appState.currentLocationName;
}

// Haversine distance in km — Overpass's "around" filter does NOT return
// results sorted by distance (it was returning whichever node OSM happened
// to store first within the radius), so we fetch several candidates and
// pick the actual closest one ourselves.
function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function findNearestFacility(lat, lon, amenity) {
  const query = `[out:json];node(around:8000,${lat},${lon})["amenity"="${amenity}"];out 15;`;
  const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
  const data = await res.json();
  if (!data.elements || data.elements.length === 0) return null;

  let closest = null;
  let closestDist = Infinity;
  for (const el of data.elements) {
    const d = distanceKm(lat, lon, el.lat, el.lon);
    if (d < closestDist) {
      closestDist = d;
      closest = el;
    }
  }
  return { name: closest.tags.name || null, distanceKm: closestDist };
}

async function fetchNearestEmergencyFacilities(lat, lon) {
  try {
    const hospital = await findNearestFacility(lat, lon, "hospital");
    if (hospital) {
      appState.nearestHospital = hospital.name || "Nearby Hospital";
      appState.nearestHospitalDistance = hospital.distanceKm;
    } else {
      appState.nearestHospital = "No hospital found nearby";
      appState.nearestHospitalDistance = null;
    }
  } catch (err) {
    appState.nearestHospital = "Unable to locate hospital";
    appState.nearestHospitalDistance = null;
  }
  if (elHospitalDiag) {
    elHospitalDiag.textContent = appState.nearestHospitalDistance != null
      ? `${appState.nearestHospital} (${appState.nearestHospitalDistance.toFixed(1)} km)`
      : appState.nearestHospital;
  }

  try {
    const police = await findNearestFacility(lat, lon, "police");
    if (police) {
      appState.nearestPolice = police.name || "Nearby Police Station";
      appState.nearestPoliceDistance = police.distanceKm;
    } else {
      appState.nearestPolice = "No police station found nearby";
      appState.nearestPoliceDistance = null;
    }
  } catch (err) {
    appState.nearestPolice = "Unable to locate police station";
    appState.nearestPoliceDistance = null;
  }
  if (elPoliceDiag) {
    elPoliceDiag.textContent = appState.nearestPoliceDistance != null
      ? `${appState.nearestPolice} (${appState.nearestPoliceDistance.toFixed(1)} km)`
      : appState.nearestPolice;
  }
}

function setSafetyStatus(isCrash) {
  elClusterStatusText.textContent = isCrash ? "CRASH DETECTED" : "SAFE RIDING";
  elClusterStatusBadge.className = "cluster-status-badge" + (isCrash ? " crash" : " safe");
}

// 2. BLE Telemetry Handler
function handleTelemetry(data) {
  const cmd = data.status;

  if (elRollValue) elRollValue.textContent = `${data.roll}°`;
  if (elPitchValue) elPitchValue.textContent = `${data.pitch}°`;

  // Drive the 3D cluster's bike orientation from the bike's actual sensor
  // readings — it only moves when the real bike does, never decoratively.
  if (window.__setBikeTilt) window.__setBikeTilt(data.roll, data.pitch);

  // Check for Crash or Manual SOS Trigger
  if (cmd === "CRASH" || cmd === "MANUAL_SOS" || data.tilt >= 85.0) {
    if (!appState.isEmergencyActive) {
      setSafetyStatus(true);
      if (elHeroHelperText) elHeroHelperText.textContent = "Confirm you're safe, or help is on the way.";
      triggerEmergencyRoutine(data);
    }
  }
  else if (cmd === "CANCEL_SAFE") {
    flashBtnUi(elUiBtn2);
    if (appState.isEmergencyActive) {
      cancelEmergency();
    }
  }
  else if (cmd === "BTN_UP") {
    flashBtnUi(elUiBtn1);
  }
  else if (cmd === "BTN_CENTER") {
    flashBtnUi(elUiBtn2);
  }
  else if (cmd === "BTN_DOWN") {
    flashBtnUi(elUiBtn3);
  }
  else {
    // Only reset title if emergency is not active
    if (!appState.isEmergencyActive) {
      setSafetyStatus(false);
      if (elHeroHelperText) elHeroHelperText.textContent = "Everything looks normal. No action needed.";
    }
  }
}

function flashBtnUi(btnEl) {
  if (!btnEl) return;
  btnEl.classList.add("active-press");
  setTimeout(() => btnEl.classList.remove("active-press"), 300);
}

// 3. BLE State Handler
function handleConnectionState(isConnected, info) {
  if (isConnected) {
    elHeaderBadge.className = "badge-status connected";
    elHeaderBadgeText.textContent = "Connected";
    elDeviceStatusText.textContent = "Connected to your bike";

    elBtnConnectMain.style.display = "none";
    elBtnDisconnect.style.display = "block";

    elBleDiagStatus.textContent = "Connected";
    elBleDiagStatus.className = "diag-value online";
    if (elHeaderBadgeSlash) elHeaderBadgeSlash.style.display = "none";

    startRideTimer();
  } else {
    elHeaderBadge.className = "badge-status";
    elHeaderBadgeText.textContent = "Disconnected";
    elDeviceStatusText.textContent = "Not connected";

    elBtnConnectMain.style.display = "block";
    elBtnDisconnect.style.display = "none";

    elBleDiagStatus.textContent = "Offline";
    elBleDiagStatus.className = "diag-value offline";
    if (elHeaderBadgeSlash) elHeaderBadgeSlash.style.display = "";

    stopRideTimer();
  }
}

// Shows a "Reconnecting..." state in the header badge while the BLE link
// tries to recover on its own after an unexpected drop.
function handleReconnecting(isReconnecting) {
  if (isReconnecting) {
    elHeaderBadge.className = "badge-status reconnecting";
    elHeaderBadgeText.textContent = "Reconnecting...";
    elDeviceStatusText.textContent = "Link lost — reconnecting automatically";
  }
}

function startRideTimer() {
  if (appState.rideTimerInterval) clearInterval(appState.rideTimerInterval);
  appState.rideSeconds = 0;
  appState.rideTimerInterval = setInterval(() => {
    appState.rideSeconds++;
    const hrs = String(Math.floor(appState.rideSeconds / 3600)).padStart(2, '0');
    const mins = String(Math.floor((appState.rideSeconds % 3600) / 60)).padStart(2, '0');
    const secs = String(appState.rideSeconds % 60).padStart(2, '0');
    elRideTime.textContent = `${hrs}:${mins}:${secs}`;
  }, 1000);
}

function stopRideTimer() {
  if (appState.rideTimerInterval) clearInterval(appState.rideTimerInterval);
}

// 5. Emergency Full-Screen Routine
function triggerEmergencyRoutine(crashData) {
  appState.isEmergencyActive = true;
  appState.remainingSeconds = CONFIG.countdownDuration;

  elEmergencyModal.classList.add("show");
  elCountdownNumber.textContent = `${appState.remainingSeconds}s`;

  startSirenAudio();
  triggerPhoneVibration();
  speakVoice("Warning! Accident detected. Press cancel if safe.");

  if (appState.countdownTimer) clearInterval(appState.countdownTimer);

  appState.countdownTimer = setInterval(() => {
    appState.remainingSeconds--;
    elCountdownNumber.textContent = `${appState.remainingSeconds}s`;
    triggerPhoneVibration();

    if (appState.remainingSeconds <= 0) {
      clearInterval(appState.countdownTimer);
      executeSosDispatch(crashData);
    }
  }, 1000);
}

function triggerPhoneVibration() {
  if ("vibrate" in navigator) {
    navigator.vibrate([800, 200, 800]);
  }
}

// 6. User Taps Cancel
function cancelEmergency() {
  if (appState.countdownTimer) clearInterval(appState.countdownTimer);
  stopSirenAudio();
  if ("vibrate" in navigator) navigator.vibrate(0);

  appState.isEmergencyActive = false;
  elEmergencyModal.classList.remove("show");
  setSafetyStatus(false);
  if (elHeroHelperText) elHeroHelperText.textContent = "Everything looks normal. No action needed.";

  syncToDatabase({
    status: "CANCELED_FALSE_ALARM",
    tilt_angle: 0,
    roll_angle: 0,
    pitch_angle: 0,
    latitude: appState.currentLat,
    longitude: appState.currentLon,
    speed_kmh: appState.currentSpeed,
    nearest_hospital: appState.nearestHospital
  });

  speakVoice("Alert canceled. Rider marked safe.");
}

// 7. Confirmed SOS Dispatch
function executeSosDispatch(crashData) {
  stopSirenAudio();
  if ("vibrate" in navigator) navigator.vibrate(0);
  elEmergencyModal.classList.remove("show");
  appState.isEmergencyActive = false;

  const lat = appState.currentLat || 25.2677;
  const lon = appState.currentLon || 82.9913;
  const mapsUrl = `https://maps.google.com/?q=${lat},${lon}`;
  const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const nowDate = new Date().toLocaleDateString();

  syncToDatabase({
    status: "CONFIRMED_CRASH",
    tilt_angle: crashData.tilt || 60,
    roll_angle: crashData.roll || 55,
    pitch_angle: crashData.pitch || 10,
    latitude: lat,
    longitude: lon,
    speed_kmh: appState.currentSpeed,
    nearest_hospital: appState.nearestHospital
  });

  speakVoice("SOS dispatched. Sending WhatsApp alert to emergency contacts.");

  const waText =
`*EMERGENCY SOS: MOTORCYCLE ACCIDENT DETECTED*

A critical accident has been detected for the rider. Immediate assistance may be needed.

*Location Area:*
${appState.currentLocationName}

*Live Google Maps:*
${mapsUrl}

*Incident Time:*
${nowTime} (${nowDate})

*Nearest Hospital:*
${appState.nearestHospital}

*Nearest Police Station:*
${appState.nearestPolice}

_This alert was generated automatically by the Smart Blackbox Safety System._`;

  dispatchWhatsAppToContacts(waText);
}

// Opens a WhatsApp deep link for every saved emergency contact. Browsers only
// allow one navigation via location.href, so the primary contact gets that
// (most reliable, works even if popups are blocked) and the rest open in new
// tabs; any tab a popup blocker stops is also listed so the rider or a
// bystander at the scene can tap it manually.
function dispatchWhatsAppToContacts(message) {
  if (!appState.contacts || appState.contacts.length === 0) return;

  const encoded = encodeURIComponent(message);
  const buildUrl = (phone) => `https://api.whatsapp.com/send?phone=${phone}&text=${encoded}`;

  appState.contacts.forEach((contact, index) => {
    const url = buildUrl(contact.phone);
    if (index === 0) {
      window.location.href = url;
    } else {
      window.open(url, "_blank");
    }
  });
}

// 8. Database Sync
async function syncToDatabase(payload) {
  try {
    const res = await fetch(CONFIG.wampApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    console.log("[DB Sync]", data);
  } catch (err) {
    console.warn("[DB Sync Error]", err);
  }
}

async function testServerConnection() {
  try {
    const res = await fetch("api/get_logs.php");
    if (res.ok) {
      elServerDiagStatus.textContent = "Online (XAMPP)";
      elServerDiagStatus.className = "diag-value online";
    }
  } catch (e) {
    elServerDiagStatus.textContent = "Local Standby";
  }
}

// 10. Web Audio Siren
function startSirenAudio() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    appState.audioContext = new AudioContext();
    let isHigh = false;
    appState.sirenInterval = setInterval(() => {
      if (!appState.audioContext) return;
      const osc = appState.audioContext.createOscillator();
      const gain = appState.audioContext.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = isHigh ? 880 : 587;
      gain.gain.setValueAtTime(0.3, appState.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, appState.audioContext.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(appState.audioContext.destination);
      osc.start();
      osc.stop(appState.audioContext.currentTime + 0.4);
      isHigh = !isHigh;
    }, 450);
  } catch (e) {}
}

function stopSirenAudio() {
  if (appState.sirenInterval) clearInterval(appState.sirenInterval);
  if (appState.audioContext) {
    appState.audioContext.close();
    appState.audioContext = null;
  }
}

function speakVoice(text) {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    window.speechSynthesis.speak(u);
  }
}
