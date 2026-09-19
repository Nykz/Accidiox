// Accidiox Telematics Application Controller (Reliable Emergency Dispatch Edition)

const CONTACTS_STORAGE_KEY = "accidiox_emergency_contacts";

const CONFIG = {
  countdownDuration: 20,
  wampApiUrl: "api/log_accident.php"
};

// Geoapify handles reverse geocoding (location naming) and nearby-place
// search (hospital/police/petrol pump) - replaced the free public
// Nominatim/Overpass endpoints, which were frequently timing out/rate-
// limited and gave coarse location names that missed smaller localities.
// Calls go through our own api/geoapify_proxy.php rather than embedding
// the API key directly in this public, git-tracked file.

let appState = {
  currentLat: null,
  currentLon: null,
  currentLocationName: "Locating area & city...",
  currentSpeed: 0,
  gpsAccuracy: null,
  nearestHospital: "Locating hospital...",
  nearestPolice: "Locating police precinct...",
  nearestPetrol: "Locating petrol pump...",
  nearestHospitalCoords: null,
  nearestPoliceCoords: null,
  nearestPetrolCoords: null,
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
const elPetrolDiag       = document.getElementById("petrolDiag");

const elGpsDiagStatus    = document.getElementById("gpsDiagStatus");
const elBleDiagStatus    = document.getElementById("bleDiagStatus");
const elServerDiagStatus = document.getElementById("serverDiagStatus");

const elEmergencyModal   = document.getElementById("emergencyModal");
const elCountdownNumber  = document.getElementById("countdownNumber");
const elBtnCancelSos     = document.getElementById("btnCancelSos");

const elSosSentModal        = document.getElementById("sosSentModal");
const elSosSentContactsList  = document.getElementById("sosSentContactsList");
const elBtnDismissSosSent   = document.getElementById("btnDismissSosSent");

const elContactsList     = document.getElementById("contactsList");
const elAddContactForm   = document.getElementById("addContactForm");
const elContactNameInput = document.getElementById("contactNameInput");
const elContactPhoneInput = document.getElementById("contactPhoneInput");

document.addEventListener("DOMContentLoaded", () => {
  elBtnConnectMain.addEventListener("click", () => bleManager.connect());
  elBtnDisconnect.addEventListener("click", () => {
    bleManager.disconnect();
    releaseWakeLock();
  });

  requestNotificationPermission();

  // The Wake Lock API is force-released by the OS whenever the app is
  // backgrounded even briefly (switching apps, screen auto-lock kicking
  // in before the ride starts, etc.) — it does NOT come back on its own,
  // so it must be re-requested every time the app becomes visible again
  // while still connected to the bike.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && bleManager.isConnected) {
      requestWakeLock();
    }
  });
  elBtnCancelSos.addEventListener("click", () => cancelEmergency());

  if (elBtnDismissSosSent && elSosSentModal) {
    elBtnDismissSosSent.addEventListener("click", () => {
      elSosSentModal.classList.remove("show");
    });
  }

  loadContacts();
  if (elAddContactForm) {
    elAddContactForm.addEventListener("submit", (e) => {
      e.preventDefault();
      addContact();
    });
  }

  const elBtnRecenterMap = document.getElementById("btnRecenterMap");
  if (elBtnRecenterMap) elBtnRecenterMap.addEventListener("click", () => recenterLiveMap());

  const elBtnCancelRoute = document.getElementById("btnCancelRoute");
  if (elBtnCancelRoute) elBtnCancelRoute.addEventListener("click", () => cancelNavigation());

  document.querySelectorAll(".diag-navigate-btn").forEach((btn) => {
    btn.addEventListener("click", () => openNavChoiceModal(btn.dataset.target));
  });

  const elBtnOpenGoogleMaps = document.getElementById("btnOpenGoogleMaps");
  if (elBtnOpenGoogleMaps) elBtnOpenGoogleMaps.addEventListener("click", () => confirmNavChoice("google"));

  const elBtnStayInApp = document.getElementById("btnStayInApp");
  if (elBtnStayInApp) elBtnStayInApp.addEventListener("click", () => confirmNavChoice("in-app"));

  const elBtnNavChoiceCancel = document.getElementById("btnNavChoiceCancel");
  if (elBtnNavChoiceCancel) elBtnNavChoiceCancel.addEventListener("click", () => closeNavChoiceModal());

  const elBtnCopyLocation = document.getElementById("btnCopyLocation");
  if (elBtnCopyLocation) elBtnCopyLocation.addEventListener("click", copyLocationToClipboard);

  initGeolocation();
  testServerConnection();

  // Silently reconnect to the last-paired device on every load — covers
  // navigating to the Incident Map and back, reopening the app, etc.
  bleManager.tryAutoReconnect();
});

// Bottom-nav view switching (Overview <-> Settings <-> Incident Map), no
// page reload so the BLE connection and ride timer never drop just from
// checking settings or incident history.
function showView(name) {
  const home = document.getElementById("homeView");
  const settings = document.getElementById("settingsView");
  const mapView = document.getElementById("mapView");
  const navOverview = document.getElementById("navOverview");
  const navSettings = document.getElementById("navSettings");
  const navMap = document.getElementById("navMap");
  if (!home || !settings || !mapView) return;

  home.style.display = name === "home" ? "flex" : "none";
  settings.style.display = name === "settings" ? "flex" : "none";
  mapView.style.display = name === "map" ? "flex" : "none";
  navOverview.classList.toggle("active", name === "home");
  navSettings.classList.toggle("active", name === "settings");
  navMap.classList.toggle("active", name === "map");
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });

  // Leaflet renders tiles wrong if it was sized while hidden — fix it up
  // now that the container is visible again.
  if (name === "home" && liveMap) {
    setTimeout(() => liveMap.invalidateSize(), 50);
  }
  if (name === "map") {
    initIncidentMapView();
    setTimeout(() => { if (incidentMap) incidentMap.invalidateSize(); }, 50);
  }
}
window.showView = showView;

// ============== Incident Map View (merged from the old admin.html) ==============
// Kept as an in-page view instead of a separate page navigation - the whole
// point is that switching to it never tears down the live BLE connection,
// ride timer, or GPS state the way loading a different HTML document would.
let incidentMap = null;
let incidentMapInitialized = false;
let incidentMarkers = [];
let incidentLiveMarker = null;
let hasCenteredOnIncidentLive = false;
let incidentPollInterval = null;

function initIncidentMapView() {
  if (incidentMapInitialized) return;
  incidentMapInitialized = true;

  incidentMap = L.map("incidentMap").setView([20.5937, 78.9629], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(incidentMap);

  const elBtnRefreshLogs = document.getElementById("btnRefreshLogs");
  if (elBtnRefreshLogs) elBtnRefreshLogs.addEventListener("click", loadIncidentLogs);

  loadIncidentLogs();
  pollLiveIncidentPosition();
  incidentPollInterval = setInterval(pollLiveIncidentPosition, 6000);
}

function timeAgoLabel(seconds) {
  if (seconds == null) return "Waiting for first update...";
  if (seconds < 60) return `Updated ${seconds}s ago`;
  if (seconds < 3600) return `Updated ${Math.floor(seconds / 60)}m ago`;
  return `Updated ${Math.floor(seconds / 3600)}h ago`;
}

async function pollLiveIncidentPosition() {
  try {
    const res = await fetch("api/get_position.php");
    const json = await res.json();
    const data = json.data;

    const elStatLiveStatus = document.getElementById("statLiveStatus");
    const elStatLastSeen = document.getElementById("statLastSeen");
    const elStatSpeed = document.getElementById("statSpeed");
    const elMapLiveChip = document.getElementById("mapLiveChip");

    if (!data || data.latitude === null || data.seconds_ago > 90) {
      elStatLiveStatus.innerHTML = '<span class="stat-dot idle"></span>No Signal';
      elStatLastSeen.textContent = data ? `Last seen ${timeAgoLabel(data.seconds_ago).replace("Updated ", "")}` : "Waiting for first update...";
      elStatSpeed.textContent = "--";
      elMapLiveChip.className = "live-chip idle";
      elMapLiveChip.innerHTML = '<span class="live-dot"></span>No Live Signal';
      return;
    }

    const isCrash = data.status === "CRASH";
    elStatLiveStatus.innerHTML =
      `<span class="stat-dot ${isCrash ? "" : "live"}" style="${isCrash ? "background:var(--danger)" : ""}"></span>${isCrash ? "Crash Alert" : "Online"}`;
    elStatLastSeen.textContent = timeAgoLabel(data.seconds_ago);
    elStatSpeed.textContent = Math.round(data.speed_kmh);
    elMapLiveChip.className = "live-chip";
    elMapLiveChip.innerHTML = '<span class="live-dot"></span>Live Tracking Active';

    const latlng = [parseFloat(data.latitude), parseFloat(data.longitude)];
    if (!incidentLiveMarker) {
      const icon = L.divIcon({ className: "live-marker-dot", iconSize: [16, 16] });
      incidentLiveMarker = L.marker(latlng, { icon, zIndexOffset: 1000 }).addTo(incidentMap);
      incidentLiveMarker.bindPopup("<b>Live bike position</b>");
    } else {
      incidentLiveMarker.setLatLng(latlng);
    }

    if (!hasCenteredOnIncidentLive) {
      hasCenteredOnIncidentLive = true;
      incidentMap.setView(latlng, 15);
    }
  } catch (err) {
    console.warn("Live position poll failed:", err);
  }
}

async function loadIncidentLogs() {
  const elLogList = document.getElementById("incidentLogList");
  try {
    const response = await fetch("api/get_logs.php");
    const res = await response.json();

    elLogList.innerHTML = "";
    incidentMarkers.forEach((m) => incidentMap.removeLayer(m));
    incidentMarkers = [];

    if (res.data && res.data.length > 0) {
      document.getElementById("statTotalIncidents").textContent = res.data.length;
      const latest = res.data[0];
      document.getElementById("statLastIncident").textContent =
        latest.status === "CONFIRMED_CRASH" ? "Crash Confirmed" : "False Alarm";
      document.getElementById("statLastIncidentSub").textContent = latest.timestamp;

      res.data.forEach((log) => {
        const isCrash = log.status === "CONFIRMED_CRASH";
        const badgeClass = isCrash ? "status-crash" : "status-canceled";
        const badgeText = isCrash ? "Crash Confirmed" : "Canceled (Safe)";

        const card = document.createElement("div");
        card.className = "incident-log-card";
        card.innerHTML = `
          <div class="incident-log-row"><span class="incident-log-row-label">Time</span><span>${log.timestamp}</span></div>
          <div class="incident-log-row"><span class="incident-log-row-label">Status</span><span class="status-badge ${badgeClass}">${badgeText}</span></div>
          <div class="incident-log-row"><span class="incident-log-row-label">Tilt</span><span><b>${log.tilt_angle}&deg;</b></span></div>
          <div class="incident-log-row"><span class="incident-log-row-label">Speed</span><span>${log.speed_kmh} km/h</span></div>
          <div class="incident-log-row"><span class="incident-log-row-label">Location</span><span><a class="map-link" href="https://maps.google.com/?q=${log.latitude},${log.longitude}" target="_blank">${log.latitude ? String(log.latitude).substring(0, 6) : "0"}, ${log.longitude ? String(log.longitude).substring(0, 6) : "0"}</a></span></div>
          <div class="incident-log-row"><span class="incident-log-row-label">Hospital</span><span>${log.nearest_hospital}</span></div>
        `;
        elLogList.appendChild(card);

        if (log.latitude && log.longitude) {
          const marker = L.circleMarker([log.latitude, log.longitude], {
            radius: 8,
            color: isCrash ? "#dc2626" : "#16a34a",
            fillColor: isCrash ? "#dc2626" : "#16a34a",
            fillOpacity: 0.85,
            weight: 2
          }).addTo(incidentMap);
          marker.bindPopup(`
            <b>Incident #${log.id}</b><br/>
            <b>Status:</b> ${log.status}<br/>
            <b>Tilt Angle:</b> ${log.tilt_angle}&deg;<br/>
            <b>Hospital:</b> ${log.nearest_hospital}<br/>
            <small>${log.timestamp}</small>
          `);
          incidentMarkers.push(marker);
        }
      });
    } else {
      document.getElementById("statTotalIncidents").textContent = "0";
      elLogList.innerHTML = '<div class="incident-log-empty">No accidents recorded yet.</div>';
    }
  } catch (err) {
    console.warn("Error fetching logs:", err);
    elLogList.innerHTML = '<div class="incident-log-error">Unable to reach the database.</div>';
  }
}

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

// System notification: a backup alarm channel in case the screen still
// went dark despite the wake lock (e.g. OEM battery-saver overriding it).
// A real Android notification can vibrate and light up the lock screen
// without the page itself needing to be visible or running — unlike the
// in-page modal/siren, which only works while the app is in the foreground.
function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function fireCrashNotification() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.ready.then((reg) => {
    reg.showNotification("Crash Detected — Accidiox", {
      body: "Open the app now to confirm you're safe, or SOS will be sent automatically.",
      icon: "assets/icons/icon-192.png",
      badge: "assets/icons/icon-192.png",
      vibrate: [800, 200, 800, 200, 800],
      tag: "accidiox-crash",
      requireInteraction: true,
      renotify: true
    }).catch((err) => console.warn("[Notification] Failed to show:", err));
  });
}

// Emergency Contacts (persisted locally on this rider's phone & synced with MySQL Database)
async function loadContacts() {
  // 1. Initial immediate load from local storage
  try {
    const stored = JSON.parse(localStorage.getItem(CONTACTS_STORAGE_KEY));
    if (Array.isArray(stored) && stored.length > 0) {
      appState.contacts = stored;
    }
  } catch (e) {
    appState.contacts = [];
  }

  // 2. Fetch latest saved contacts from backend MySQL Database (Hostinger/XAMPP)
  try {
    const res = await fetch("api/contacts.php");
    if (res.ok) {
      const data = await res.json();
      if (data.status === "success" && Array.isArray(data.contacts) && data.contacts.length > 0) {
        appState.contacts = data.contacts;
        localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(appState.contacts));
      } else if (appState.contacts.length > 0) {
        // Database was empty, persist current local contacts to database
        fetch("api/contacts.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contacts: appState.contacts })
        }).catch(err => console.warn("[DB Contacts Init Sync]", err));
      }
    }
  } catch (err) {
    console.warn("[Contacts DB Fetch Failed, using local storage]", err);
  }

  // Auto-normalize any existing stored contacts to include international country code (default 91 for India)
  appState.contacts = appState.contacts.map(c => {
    let p = String(c.phone || "").replace(/[^0-9]/g, "");
    if (p.length === 10) p = "91" + p;
    else if (p.length === 11 && p.startsWith("0")) p = "91" + p.slice(1);
    return { name: c.name || "Emergency Contact", phone: p };
  });

  if (appState.contacts.length === 0) {
    appState.contacts = [{ name: "Primary Contact", phone: "919876543210" }];
    saveContacts();
  }

  renderContacts();
}

function saveContacts() {
  localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(appState.contacts));

  // Persist contacts directly to MySQL database
  fetch("api/contacts.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contacts: appState.contacts })
  }).then(r => r.json()).then(res => {
    console.log("[Contacts DB Sync Success]", res);
  }).catch(err => {
    console.warn("[Contacts DB Sync Error]", err);
  });
}

function addContact() {
  const name = elContactNameInput.value.trim() || "Emergency Contact";
  let phone = elContactPhoneInput.value.replace(/[^0-9]/g, "");

  // Auto-prefix Indian country code '91' if 10-digit mobile number is entered
  if (phone.length === 10) {
    phone = "91" + phone;
  } else if (phone.length === 11 && phone.startsWith("0")) {
    phone = "91" + phone.slice(1);
  }

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
let routeLayer = null;
let destMarker = null;
let routeActive = false;

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
  // Don't fight the rider's view while they're looking at an active route
  // or have manually panned/zoomed away — only auto-follow by default.
  if (!routeActive) {
    liveMap.panTo([lat, lon]);
  }
}

function recenterLiveMap() {
  if (!liveMap || appState.currentLat == null || appState.currentLon == null) return;
  liveMap.setView([appState.currentLat, appState.currentLon], 15);
}

// Text selection is disabled app-wide (see style.css) so long-pressing
// anywhere doesn't trigger Android's native "Copy / Share / Search with
// Google" toolbar - this button is the one place that still needs to
// hand the rider their location, just via a deliberate tap instead.
async function copyLocationToClipboard() {
  const btn = document.getElementById("btnCopyLocation");
  if (appState.currentLat == null || appState.currentLon == null) return;

  const text = `${appState.currentLocationName} — ${appState.currentLat.toFixed(4)}, ${appState.currentLon.toFixed(4)}`;
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    console.warn("[Copy Location] Clipboard write failed:", err);
    return;
  }

  if (btn) {
    btn.classList.add("copied");
    setTimeout(() => btn.classList.remove("copied"), 1500);
  }
}

const NAV_TARGETS = {
  hospital: { nameKey: "nearestHospital", coordsKey: "nearestHospitalCoords" },
  police: { nameKey: "nearestPolice", coordsKey: "nearestPoliceCoords" },
  petrol: { nameKey: "nearestPetrol", coordsKey: "nearestPetrolCoords" }
};

// A small in-app map widget can never match real turn-by-turn navigation
// (live position tracking, rotating heading, voice turns, rerouting) —
// that's a genuinely huge undertaking on its own. Instead of faking a
// worse version of it, this asks the rider to choose between the real
// thing (handing off to the phone's own Google Maps app) or a simple
// static route line that stays inside Accidiox.
let pendingNavTarget = null;

function openNavChoiceModal(targetKey) {
  const target = NAV_TARGETS[targetKey];
  if (!target) return;
  pendingNavTarget = targetKey;

  const elSubtitle = document.getElementById("navChoiceSubtitle");
  if (elSubtitle) elSubtitle.textContent = `Directions to ${appState[target.nameKey]}`;

  const elModal = document.getElementById("navChoiceModal");
  if (elModal) elModal.classList.add("show");
}

function closeNavChoiceModal() {
  pendingNavTarget = null;
  const elModal = document.getElementById("navChoiceModal");
  if (elModal) elModal.classList.remove("show");
}

function confirmNavChoice(choice) {
  const targetKey = pendingNavTarget;
  closeNavChoiceModal();
  if (!targetKey) return;

  const target = NAV_TARGETS[targetKey];
  const dest = appState[target.coordsKey];
  if (!dest) return;

  if (choice === "google") {
    const originPart = (appState.currentLat != null && appState.currentLon != null)
      ? `&origin=${appState.currentLat},${appState.currentLon}`
      : "";
    const url = `https://www.google.com/maps/dir/?api=1${originPart}&destination=${dest.lat},${dest.lon}&travelmode=driving`;
    window.open(url, "_blank");
  } else {
    startNavigation(targetKey);
  }
}

async function startNavigation(targetKey) {
  const target = NAV_TARGETS[targetKey];
  if (!target || !liveMap) return;

  const dest = appState[target.coordsKey];
  if (!dest || appState.currentLat == null || appState.currentLon == null) {
    speakVoice("Location not ready yet, please wait a moment and try again.");
    return;
  }

  const elRouteText = document.getElementById("routeInfoText");
  const elRouteBar = document.getElementById("routeInfoBar");
  if (elRouteText) elRouteText.textContent = "Finding route...";
  if (elRouteBar) elRouteBar.style.display = "flex";

  try {
    const url = `api/geoapify_proxy.php?type=routing&from_lat=${appState.currentLat}&from_lon=${appState.currentLon}&to_lat=${dest.lat}&to_lon=${dest.lon}`;
    const res = await fetch(url);
    const data = await res.json();
    const feature = data.features && data.features[0];
    if (!feature) throw new Error("No route found");

    // GeoJSON MultiLineString: array of line segments, each an array of
    // [lon, lat] points — flatten to one path and swap to Leaflet's [lat, lon].
    const segments = feature.geometry.coordinates;
    const latlngs = segments.flat().map(([lon, lat]) => [lat, lon]);

    if (routeLayer) liveMap.removeLayer(routeLayer);
    if (destMarker) liveMap.removeLayer(destMarker);

    routeLayer = L.polyline(latlngs, { color: "#2563eb", weight: 5, opacity: 0.85 }).addTo(liveMap);
    destMarker = L.marker([dest.lat, dest.lon]).addTo(liveMap);
    liveMap.fitBounds(routeLayer.getBounds(), { padding: [24, 24] });
    routeActive = true;

    const km = (feature.properties.distance / 1000).toFixed(1);
    const mins = Math.round(feature.properties.time / 60);
    if (elRouteText) elRouteText.textContent = `${appState[target.nameKey]} — ${km} km, ${mins} min`;
  } catch (err) {
    console.warn("[Navigation] Route request failed:", err);
    if (elRouteText) elRouteText.textContent = "Unable to get directions";
  }
}

function cancelNavigation() {
  if (routeLayer) { liveMap.removeLayer(routeLayer); routeLayer = null; }
  if (destMarker) { liveMap.removeLayer(destMarker); destMarker = null; }
  routeActive = false;
  const elRouteBar = document.getElementById("routeInfoBar");
  if (elRouteBar) elRouteBar.style.display = "none";
  recenterLiveMap();
}

// Heartbeat so the admin portal can show a genuinely live position
// instead of only past incidents. Throttled — GPS updates can fire much
// more often than the position actually needs reporting to the server.
let lastPositionSync = 0;
function syncLivePosition(lat, lon, speedKmh) {
  const now = Date.now();
  if (now - lastPositionSync < 8000) return;
  lastPositionSync = now;

  fetch("api/update_position.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      latitude: lat,
      longitude: lon,
      speed_kmh: speedKmh,
      status: appState.isEmergencyActive ? "CRASH" : "SAFE"
    })
  }).catch((err) => console.warn("[Position Sync Error]", err));
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
        if (window.__setBikeSpeed) window.__setBikeSpeed(appState.currentSpeed);
        elLocationCoords.textContent = `${appState.currentLat.toFixed(4)} N, ${appState.currentLon.toFixed(4)} E (Accuracy: ${appState.gpsAccuracy}m)`;
        elGpsDiagStatus.textContent = "Active";
        elGpsDiagStatus.className = "diag-value online";

        reverseGeocodeAddress(appState.currentLat, appState.currentLon);
        fetchNearestEmergencyFacilities(appState.currentLat, appState.currentLon);
        updateLiveMap(appState.currentLat, appState.currentLon);
        syncLivePosition(appState.currentLat, appState.currentLon, appState.currentSpeed);
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
    const res = await fetch(`api/geoapify_proxy.php?type=reverse&lat=${lat}&lon=${lon}`);
    const data = await res.json();
    const result = data && data.results && data.results[0];
    if (result) {
      // Prefer the smallest/most local name first (a specific locality like
      // "Panjabari") and fall back to broader ones only if it's missing.
      const locality = result.suburb || result.district || result.neighbourhood || result.neighborhood
        || result.quarter || result.village || "";
      const city = result.city || result.county || "";
      const state = result.state || "";
      const parts = [locality, city, state].filter(Boolean);
      appState.currentLocationName = parts.length > 0
        ? parts.join(", ")
        : (result.formatted || "Current Riding Location");
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

// Geoapify Places API - category is one of "healthcare.hospital",
// "service.police", "service.vehicle.fuel". bias=proximity already sorts
// by distance from the rider, but the haversine re-sort is kept as a
// cheap safety net rather than trusting that blindly.
async function findNearestFacility(lat, lon, category) {
  const url = `api/geoapify_proxy.php?type=places&category=${category}&lat=${lat}&lon=${lon}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9000);
  const res = await fetch(url, { signal: controller.signal });
  clearTimeout(timeoutId);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  if (!data.features || data.features.length === 0) return null;

  let closest = null;
  let closestDist = Infinity;
  for (const feature of data.features) {
    const [flon, flat] = feature.geometry.coordinates;
    const d = distanceKm(lat, lon, flat, flon);
    if (d < closestDist) {
      closestDist = d;
      closest = feature;
    }
  }
  const [closestLon, closestLat] = closest.geometry.coordinates;
  return { name: (closest.properties && closest.properties.name) || null, distanceKm: closestDist, lat: closestLat, lon: closestLon };
}

async function updateNearestFacility(lat, lon, category, stateKey, distanceKey, coordsKey, fallbackName, notFoundText, el) {
  try {
    const found = await findNearestFacility(lat, lon, category);
    if (found) {
      appState[stateKey] = found.name || fallbackName;
      appState[distanceKey] = found.distanceKm;
      appState[coordsKey] = { lat: found.lat, lon: found.lon };
    } else {
      appState[stateKey] = notFoundText;
      appState[distanceKey] = null;
      appState[coordsKey] = null;
    }
  } catch (err) {
    appState[stateKey] = `Unable to locate ${fallbackName.toLowerCase()}`;
    appState[distanceKey] = null;
    appState[coordsKey] = null;
  }
  if (el) {
    el.textContent = appState[distanceKey] != null
      ? `${appState[stateKey]} (${appState[distanceKey].toFixed(1)} km)`
      : appState[stateKey];
  }
}

async function fetchNearestEmergencyFacilities(lat, lon) {
  await updateNearestFacility(lat, lon, "healthcare.hospital", "nearestHospital", "nearestHospitalDistance", "nearestHospitalCoords", "Nearby Hospital", "No hospital found nearby", elHospitalDiag);
  await updateNearestFacility(lat, lon, "service.police", "nearestPolice", "nearestPoliceDistance", "nearestPoliceCoords", "Nearby Police Station", "No police station found nearby", elPoliceDiag);
  await updateNearestFacility(lat, lon, "service.vehicle.fuel", "nearestPetrol", "nearestPetrolDistance", "nearestPetrolCoords", "Nearby Petrol Pump", "No petrol pump found nearby", elPetrolDiag);
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

  // Trust the firmware's own confirmed decision only (cmd === "CRASH"),
  // which already required a sustained, vibration-filtered hold before
  // ever being sent. Independently re-checking the raw tilt number here
  // (e.g. "data.tilt >= 85.0") used to bypass that entire safeguard and
  // fire the alert on a single noisy/transient packet - removed.
  if (cmd === "CRASH" || cmd === "MANUAL_SOS") {
    if (!appState.isEmergencyActive) {
      setSafetyStatus(true);
      if (elHeroHelperText) elHeroHelperText.textContent = "Confirm you're safe, or help is on the way.";
      triggerEmergencyRoutine(data);
    }
  }
  else {
    // Only reset title if emergency is not active
    if (!appState.isEmergencyActive) {
      setSafetyStatus(false);
      if (elHeroHelperText) elHeroHelperText.textContent = "Everything looks normal. No action needed.";
    }
  }
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
    requestWakeLock();
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
  fireCrashNotification();

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

  // The five slots in the approved "crash_alert" WhatsApp template, in
  // order — must match {{1}}..{{5}} as defined in WhatsApp Manager.
  const templateParams = [
    appState.currentLocationName,
    mapsUrl,
    `${nowTime} (${nowDate})`,
    appState.nearestHospital,
    appState.nearestPolice
  ];

  dispatchWhatsAppToContacts(waText, templateParams);
}

// Dispatches WhatsApp SOS alert to all emergency contacts via Meta Cloud API
// and displays a clean in-app confirmation modal (never redirecting out of the app).
async function dispatchWhatsAppToContacts(message, templateParams) {
  if (!appState.contacts || appState.contacts.length === 0) return;

  let autoResults = [];
  let apiErrorMessage = null;

  try {
    const res = await fetch("api/send_whatsapp_sos.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateParams, contacts: appState.contacts })
    });
    const data = await res.json();
    if (data.status === "done" && Array.isArray(data.results)) {
      autoResults = data.results;
    } else if (data.status === "not_configured" || data.status === "error") {
      apiErrorMessage = data.message || "Meta API configuration missing or error";
    }
  } catch (err) {
    console.warn("[WhatsApp SOS] Backend API request failed:", err);
    apiErrorMessage = "Could not connect to backend server";
  }

  showSosSentConfirmation(autoResults, message, apiErrorMessage);
}

function showSosSentConfirmation(results, message, globalError) {
  if (!elSosSentModal || !elSosSentContactsList) return;

  elSosSentContactsList.innerHTML = "";
  const encoded = encodeURIComponent(message || "");

  const elSummary = document.getElementById("sosSentSummary");
  const anySuccess = (results || []).some(r => r.sent === true);

  if (elSummary) {
    if (anySuccess) {
      elSummary.textContent = "Emergency alert was automatically delivered to your emergency contacts via WhatsApp Cloud API.";
    } else if (globalError) {
      elSummary.textContent = `WhatsApp Cloud API Note: ${globalError}`;
    } else {
      elSummary.textContent = "Emergency SOS dispatch completed. If Meta Cloud API delivery fails due to test-mode limits, you can tap 'Send via WhatsApp' below.";
    }
  }

  appState.contacts.forEach((contact) => {
    const res = (results || []).find(r => r.phone === contact.phone || r.phone === `91${contact.phone}`) || {};
    const isSent = res.sent === true;
    const detail = res.detail || (globalError ? globalError : "Meta Sandbox Mode / Delivery Failed");
    const waUrl = `https://api.whatsapp.com/send?phone=${contact.phone}&text=${encoded}`;

    const item = document.createElement("div");
    item.className = "sos-sent-item";
    
    item.innerHTML = `
      <div class="sos-sent-row-header">
        <div class="sos-sent-contact-info">
          <span class="sos-sent-name">${contact.name}</span>
          <span class="sos-sent-phone">+${contact.phone}</span>
        </div>
        <span class="sos-status-tag ${isSent ? 'sent' : 'failed'}">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;">
            ${isSent ? '<polyline points="20 6 9 17 4 12"/>' : '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'}
          </svg>
          ${isSent ? 'Delivered (API)' : 'API Delivery Issue'}
        </span>
      </div>
      ${!isSent ? `
        <div class="sos-error-detail">
          <strong>Reason:</strong> ${detail}
        </div>
        <a href="${waUrl}" target="_blank" class="btn-manual-whatsapp">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          <span>Send via WhatsApp App (1-Tap)</span>
        </a>
      ` : ''}
    `;
    elSosSentContactsList.appendChild(item);
  });

  elSosSentModal.classList.add("show");
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
