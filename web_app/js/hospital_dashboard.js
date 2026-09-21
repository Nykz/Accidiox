// Accidiox Dispatch — hospital command console controller.
// Signed in as one hospital. Shows crashes this hospital was alerted to (it
// is one of the 3 nearest), lets it claim one with a real ambulance from its
// fleet, tracks that ambulance live, and closes the case on admission.

const S = window.AccidioxSession;
const ROLE = "hospital";
const API = "api/hospital_dispatch_api.php";
const ROUTE_API = "api/geoapify_proxy.php";
const POLL_MS = 3000;
const SERVICE_RADIUS_KM = 60;
const ROUTE_MAX_KM = 120;
const LIVE_GPS_MAX_AGE_MS = 45000;

const STAGES = ["DISPATCHED", "EN_ROUTE", "AT_SCENE", "PICKED_UP", "ADMITTED"];
const STAGE_LABELS = { DISPATCHED: "Mobilised", EN_ROUTE: "En route", AT_SCENE: "On scene", PICKED_UP: "Picked up", ADMITTED: "Admitted" };
const NEXT_ACTION = { DISPATCHED: "Mark en route", EN_ROUTE: "Mark on scene", AT_SCENE: "Mark patient picked up", PICKED_UP: "Mark admitted to ER" };
const EVENT_TEXT = {
  REPORTED: "Crash confirmed by black box",
  ALERTED: "SOS sent to the 3 nearest hospitals",
  DISPATCHED: "Ambulance dispatched",
  EN_ROUTE: "Ambulance en route",
  AT_SCENE: "Ambulance on scene",
  PICKED_UP: "Patient picked up",
  ADMITTED: "Admitted to emergency department"
};

const account = S.guard(ROLE);

const state = {
  me: null,
  incidents: [],
  hospitals: [],
  fleet: [],
  selectedId: null,
  filter: "all",
  soundOn: loadPref("accidiox.sound", "on") === "on",
  serverOffset: 0,
  online: true,
  loaded: false,
  seenIds: new Set(),
  pendingClaimId: null,
  fitPendingFor: null
};

let map = null;
const incidentMarkers = {};
const hospitalMarkers = {};
const routeCache = new Map();
let routeLayer = null;
let ambulanceMarker = null;
let audioCtx = null;
let lastFitAt = 0;

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  if (!account) return;
  initMap();
  initAccountMenu();
  initControls();
  fetchDispatchData();
  setInterval(fetchDispatchData, POLL_MS);
  setInterval(tick, 1000);
  tick();
});

// ================= Helpers =================
function loadPref(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch (e) { return fallback; }
}
function savePref(key, value) {
  try { localStorage.setItem(key, value); } catch (e) {}
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function icon(name, cls = "ic ic-sm") {
  return `<svg class="${cls}"><use href="#i-${name}"/></svg>`;
}

function hospitalById(id) {
  return state.hospitals.find((h) => h.id === id) || null;
}
function hospitalName(id, fallback) {
  const h = hospitalById(id);
  return h ? h.name : fallback || "Another hospital";
}

// Server timestamps are "Y-m-d H:i:s" in IST. Parse as local time and
// correct with the offset measured on every poll.
function parseTs(ts) {
  if (!ts) return null;
  const m = String(ts).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
}
function now() {
  return Date.now() - state.serverOffset;
}

function fmtDuration(ms, { compact = false } = {}) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return compact ? `${h}h ${m}m` : `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return compact ? (m > 0 ? `${m}m ${sec}s` : `${sec}s`) : `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
function fmtAgo(t) {
  if (!t) return "—";
  const s = Math.floor((now() - t) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
function fmtClock(t) {
  if (!t) return "—";
  return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}
function fmtMin(min) {
  const m = Math.round(Number(min) || 0);
  if (m < 90) return `${m} min`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}
function fmtKm(km) {
  if (km == null || !isFinite(km)) return "—";
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString()} km`;
}

function num(v) {
  const n = parseFloat(v);
  return isFinite(n) ? n : null;
}
function incLatLng(inc) {
  const lat = num(inc.latitude), lon = num(inc.longitude);
  return lat == null || lon == null ? null : [lat, lon];
}
function incCode(inc) {
  return `INC-${String(inc.id).padStart(4, "0").slice(-4)}`;
}

function haversineKm(a, b) {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]), dLon = toRad(b[1] - a[1]);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function distanceFrom(hospId, inc) {
  const h = hospitalById(hospId), p = incLatLng(inc);
  return h && p ? haversineKm([h.latitude, h.longitude], p) : null;
}
// Ambulance on lights: road route time if known, otherwise straight-line
// distance with a road-winding factor at ~32 km/h (matches the server).
function estimateEtaMin(fromLatLng, inc, routeKeyHint) {
  const route = routeKeyHint ? routeCache.get(routeKeyHint) : null;
  if (route && route.status === "ok" && route.seconds) return Math.max(3, Math.round((route.seconds * 0.85) / 60));
  const p = incLatLng(inc);
  if (!fromLatLng || !p) return 5;
  return Math.max(3, Math.round(((haversineKm(fromLatLng, p) * 1.35) / 32) * 60));
}

function kindOf(inc) {
  if (inc.dispatch_status === "UNCLAIMED") return "open";
  if (state.me && inc.claimed_by_hospital_id === state.me.id) return "mine";
  return "other";
}
function stageIndex(inc) {
  return STAGES.indexOf(inc.dispatch_status);
}
function isDone(inc) {
  return inc.dispatch_status === "ADMITTED";
}
function liveAmbulancePos(inc) {
  const p = inc.ambulance_position;
  if (!p || !p.last_seen) return null;
  return now() - parseTs(p.last_seen) < LIVE_GPS_MAX_AGE_MS ? [p.latitude, p.longitude] : null;
}
function fleetUnit(id) {
  return state.fleet.find((a) => a.id === id) || null;
}

function statusPill(inc) {
  const k = kindOf(inc);
  if (k === "open") return `<span class="pill pill-danger">Open</span>`;
  if (k === "mine") {
    const label = STAGE_LABELS[inc.dispatch_status] || "Dispatched";
    return `<span class="pill ${isDone(inc) ? "pill-success" : "pill-brand"}">${label}</span>`;
  }
  return `<span class="pill">${isDone(inc) ? "Closed" : "Standby"}</span>`;
}

function sortIncidents(list) {
  const rank = (inc) => {
    const k = kindOf(inc);
    if (k === "open") return 0;
    if (k === "mine" && !isDone(inc)) return 1;
    if (!isDone(inc)) return 2;
    return 3;
  };
  return [...list].sort((a, b) => rank(a) - rank(b) || (parseTs(b.created_at) || 0) - (parseTs(a.created_at) || 0));
}

// ================= Data =================
async function fetchDispatchData() {
  try {
    const { ok, data } = await S.api(ROLE, `${API}?action=get_incidents`);
    if (!ok || data.status !== "success") throw new Error(data.message || "bad response");

    const serverNow = parseTs(data.server_time);
    if (serverNow) state.serverOffset = Date.now() - serverNow;

    const firstLoad = !state.me;
    state.me = data.me;
    state.hospitals = data.hospitals || [];
    state.fleet = data.fleet || [];
    state.incidents = (data.incidents || []).filter((i) => incLatLng(i));
    setOnline(true);
    if (firstLoad) applyAccount();

    const fresh = state.incidents.filter((i) => !state.seenIds.has(i.id));
    if (state.loaded) {
      const freshOpen = fresh.filter((i) => i.dispatch_status === "UNCLAIMED");
      if (freshOpen.length) {
        playAlertTone();
        const r = freshOpen[0].my_alert_rank;
        toast("danger", "New crash SOS", `${freshOpen[0].location_name || "Unknown location"}${r ? ` · you're #${r} nearest` : ""}`, "alert");
      }
    }
    fresh.forEach((i) => state.seenIds.add(i.id));

    if (!state.selectedId || !state.incidents.some((i) => i.id === state.selectedId)) {
      const first = sortIncidents(state.incidents)[0];
      state.selectedId = null;
      if (first) selectIncident(first.id, { silent: true });
    }

    renderAll(state.loaded ? fresh.map((i) => i.id) : []);
    if (firstLoad && !state.incidents.length) map.setView([state.me.latitude, state.me.longitude], 13);
    state.loaded = true;
  } catch (err) {
    console.warn("[Dispatch sync]", err);
    setOnline(false);
  }
}

function setOnline(online) {
  if (state.online === online) return;
  state.online = online;
  $("livePill").classList.toggle("offline", !online);
  $("livePillText").textContent = online ? "Live" : "Reconnecting";
}

async function postAction(action, body) {
  const { data } = await S.api(ROLE, `${API}?action=${action}`, { method: "POST", body: body || {} });
  return data;
}

// ================= Rendering =================
function renderAll(freshIds = []) {
  renderKpis();
  renderQueue(freshIds);
  renderMap();
  renderDetail();
  renderNetwork();
}

// Polling every few seconds must not rebuild DOM the user is interacting
// with (it swallows clicks and hover). Rebuild only when inputs change;
// live counters are refreshed separately by tick().
const renderSigs = {};
function changed(slot, inputs) {
  const sig = JSON.stringify(inputs);
  if (renderSigs[slot] === sig) return false;
  renderSigs[slot] = sig;
  return true;
}

function renderKpis() {
  const t = now();
  const open = state.incidents.filter((i) => kindOf(i) === "open");
  const mineActive = state.incidents.filter((i) => kindOf(i) === "mine" && !isDone(i));

  setKpi("unclaimed", open.length);
  const oldest = open.reduce((min, i) => Math.min(min, parseTs(i.created_at) || t), t);
  setKpi("unclaimedFoot", open.length ? `Oldest waiting <span data-tick="since" data-t="${oldest}">${fmtDuration(t - oldest, { compact: true })}</span>` : "No open alerts", true);
  $("kpiUnclaimed").classList.toggle("alerting", open.length > 0);

  setKpi("mine", mineActive.length);
  const moving = mineActive.filter((i) => ["DISPATCHED", "EN_ROUTE"].includes(i.dispatch_status)).length;
  const toEr = mineActive.filter((i) => i.dispatch_status === "PICKED_UP").length;
  setKpi("mineFoot", mineActive.length ? `${moving} en route · ${toEr} bringing patient in` : "No units deployed");

  const claims = state.incidents
    .map((i) => [parseTs(i.created_at), parseTs(i.dispatch_timestamp)])
    .filter(([c, d]) => c && d && d >= c)
    .map(([c, d]) => d - c);
  if (claims.length) {
    setKpi("claimTime", fmtDuration(claims.reduce((a, b) => a + b, 0) / claims.length, { compact: true }));
    setKpi("claimTimeFoot", `Crash to dispatch · ${claims.length} case${claims.length === 1 ? "" : "s"}`);
  } else {
    setKpi("claimTime", "—");
    setKpi("claimTimeFoot", "Crash to dispatch");
  }

  const ready = state.fleet.filter((a) => a.status === "available").length;
  const offline = state.fleet.filter((a) => a.status === "offline").length;
  setKpi("ambulances", `${ready}<small>/ ${state.fleet.length}</small>`, true);
  setKpi("ambulancesFoot", `${mineActive.length} on cases${offline ? ` · ${offline} off duty` : ""}`);

  setKpi("beds", state.me ? state.me.er_beds_free : 0);
  setKpi("bedsFoot", state.me && state.me.er_beds_total ? `of ${state.me.er_beds_total} in emergency dept.` : "Emergency department");
}

function setKpi(key, value, html = false) {
  const el = document.querySelector(`[data-kpi="${key}"]`);
  if (!el) return;
  if (html) el.innerHTML = value;
  else el.textContent = value;
}

function filteredIncidents() {
  const list = sortIncidents(state.incidents);
  if (state.filter === "all") return list;
  return list.filter((i) => {
    const k = kindOf(i);
    if (state.filter === "unclaimed") return k === "open";
    if (state.filter === "mine") return k === "mine";
    return k === "other";
  });
}

function renderQueue(freshIds = []) {
  const counts = { all: state.incidents.length, unclaimed: 0, mine: 0, others: 0 };
  state.incidents.forEach((i) => {
    const k = kindOf(i);
    counts[k === "open" ? "unclaimed" : k === "mine" ? "mine" : "others"]++;
  });
  Object.entries(counts).forEach(([k, v]) => {
    const el = document.querySelector(`[data-count="${k}"]`);
    if (el) el.textContent = v;
  });
  $("queueCount").textContent = counts.all;

  const list = $("incidentQueueList");
  const items = filteredIncidents();
  if (!changed("queue", [items.map((i) => [i.id, i.dispatch_status, i.claimed_by_hospital_id]), state.filter, state.selectedId, freshIds])) return;

  if (!items.length) {
    const emptyCopy = {
      all: ["No incidents", "You'll hear a chime when a crash happens and you're one of the 3 nearest hospitals."],
      unclaimed: ["Nothing waiting", "Every alert sent to you has a responder."],
      mine: ["No dispatches yet", "Crashes your team responds to will show here."],
      others: ["Nothing on standby", "Crashes claimed by nearby hospitals show here."]
    }[state.filter];
    list.innerHTML = `
      <div class="empty">
        <div class="empty-icon">${icon("inbox", "ic")}</div>
        <strong>${emptyCopy[0]}</strong>
        <p>${emptyCopy[1]}</p>
      </div>`;
    return;
  }

  list.innerHTML = items.map((inc) => {
    const k = kindOf(inc);
    const created = parseTs(inc.created_at);
    const km = inc.my_distance_km != null ? inc.my_distance_km : distanceFrom(state.me.id, inc);
    const classes = ["inc-row", `is-${isDone(inc) ? "done" : k}`];
    if (k === "open") classes.push("is-open");
    if (inc.id === state.selectedId) classes.push("selected");
    if (freshIds.includes(inc.id)) classes.push("fresh");

    const third = k === "other"
      ? `<span>${esc(hospitalName(inc.claimed_by_hospital_id, inc.claimed_by_hospital_name))}</span>`
      : inc.blood_group ? `<span class="hot">${esc(inc.blood_group)}</span>` : `<span>${Math.round(num(inc.tilt_angle) || 0)}° tilt</span>`;

    return `
      <button class="${classes.join(" ")}" data-id="${inc.id}">
        <span class="inc-indicator"></span>
        <span class="inc-main">
          <span class="inc-top">
            <span class="inc-code">${incCode(inc)}</span>
            ${statusPill(inc)}
            <span class="inc-time" data-tick="ago" data-t="${created || ""}">${fmtAgo(created)}</span>
          </span>
          <span class="inc-title">${esc(inc.location_name || "Unknown location")}</span>
          <span class="inc-meta">
            <span>${fmtKm(km)} away</span><span class="dot-sep"></span>
            <span>${esc(inc.rider_name || "Rider")}</span><span class="dot-sep"></span>
            ${third}
          </span>
        </span>
      </button>`;
  }).join("");
}

// ----- Detail panel -----
function renderDetail() {
  const panel = $("detailPanel");
  const inc = state.incidents.find((i) => i.id === state.selectedId);
  const route = inc ? routeCache.get(routeKey(routeOrigin(inc), inc.id)) : null;
  const unit = inc && inc.ambulance_id ? fleetUnit(inc.ambulance_id) : null;
  if (!changed("detail", [inc && { ...inc, ambulance_position: !!(inc && liveAmbulancePos(inc)) }, route && route.status,
    state.fleet.map((a) => [a.id, a.status]), unit && unit.has_crew_app])) return;

  if (!inc) {
    panel.innerHTML = `
      <div class="empty">
        <div class="empty-icon">${icon("shield", "ic")}</div>
        <strong>No incident selected</strong>
        <p>Pick an incident from the queue to see the rider, crash telemetry and dispatch status.</p>
      </div>`;
    return;
  }

  const k = kindOf(inc);
  const created = parseTs(inc.created_at);
  const p = incLatLng(inc);
  const coordText = `${p[0].toFixed(5)}, ${p[1].toFixed(5)}`;

  panel.innerHTML = `
    <div class="detail-head">
      <div class="detail-eyebrow">
        <span class="inc-code">${incCode(inc)}</span>
        ${statusPill(inc)}
        ${num(inc.tilt_angle) >= 80 ? `<span class="tag tag-warning">High severity</span>` : ""}
        ${inc.is_simulated ? `<span class="tag">Simulated</span>` : ""}
      </div>
      <div class="detail-title">${esc(inc.location_name || "Unknown location")}</div>
      <div class="detail-sub">
        <span>Reported ${fmtClock(created)} · <span data-tick="ago" data-t="${created || ""}">${fmtAgo(created)}</span></span>
        <button class="copy-btn" data-copy="${coordText}" title="Copy coordinates">${icon("copy", "ic ic-xs")}${coordText}</button>
        <a class="copy-btn" href="https://www.google.com/maps?q=${p[0]},${p[1]}" target="_blank" rel="noopener" title="Open in Google Maps">${icon("pin", "ic ic-xs")}Maps</a>
      </div>
    </div>

    <div class="section">${renderActionCard(inc, k, created)}</div>

    <div class="section">
      <div class="section-title"><span>Patient</span>${inc.blood_group ? `<span class="blood-big">${icon("droplet", "ic ic-xs")}${esc(inc.blood_group)}</span>` : ""}</div>
      <div class="kv">
        <div class="kv-item"><span>Name</span><strong>${esc(inc.rider_name || "Unknown")}</strong></div>
        <div class="kv-item"><span>Blood group</span><strong class="blood">${icon("droplet", "ic ic-xs")}${esc(inc.blood_group || "Unknown")}</strong></div>
        <div class="kv-item"><span>Rider phone</span>${phoneLink(inc.rider_phone)}</div>
        <div class="kv-item"><span>Vehicle</span><strong>${esc(inc.vehicle_number || "—")}</strong></div>
        <div class="kv-item full"><span>Emergency contact</span>${phoneLink(inc.emergency_contact)}</div>
      </div>
      ${inc.medical_notes ? `<div class="medical-flag">${icon("alert", "ic ic-xs")}<span>${esc(inc.medical_notes)}</span></div>` : ""}
    </div>

    <div class="section">
      <div class="section-title"><span>Crash telemetry</span><span>ESP32 · MPU-6050</span></div>
      ${renderMetrics(inc)}
    </div>

    <div class="section">
      <div class="section-title"><span>Hospitals alerted</span><span>3 nearest</span></div>
      ${renderAlerted(inc)}
    </div>

    <div class="section">
      <div class="section-title">Activity</div>
      ${renderTimeline(inc)}
    </div>
  `;
}

function phoneLink(value) {
  if (!value) return `<strong>—</strong>`;
  const m = String(value).match(/\+?\d[\d\s-]{8,}/);
  const digits = m ? m[0].replace(/[\s-]/g, "") : "";
  return digits
    ? `<a href="tel:${esc(digits.startsWith("+") ? digits : "+" + digits)}"><strong>${esc(value)}</strong></a>`
    : `<strong>${esc(value)}</strong>`;
}

function renderActionCard(inc, k, created) {
  const km = inc.my_distance_km != null ? inc.my_distance_km : distanceFrom(state.me.id, inc);
  const outOfArea = km != null && km > SERVICE_RADIUS_KM;

  if (k === "open") {
    const ready = state.fleet.filter((a) => a.status === "available").length;
    const eta = estimateEtaMin([state.me.latitude, state.me.longitude], inc, routeKey(state.me.id, inc.id));
    return `
      <div class="action-card open">
        <div class="action-row">
          <div>
            <div class="action-label">Waiting for a responder</div>
            <div class="action-big" data-tick="elapsed" data-t="${created || ""}">${fmtDuration(now() - (created || now()))}</div>
          </div>
          <div class="action-right">
            <span>${inc.my_alert_rank ? `You're #${inc.my_alert_rank} nearest` : "From your hospital"}</span>
            <strong>${fmtKm(km)} · ~${fmtMin(eta)}</strong>
          </div>
        </div>
        ${outOfArea ? `<div class="action-warn">${icon("alert", "ic ic-xs")}<span>Outside your ${SERVICE_RADIUS_KM} km service radius.</span></div>` : ""}
        <button class="btn btn-danger btn-block" data-action="claim" data-id="${inc.id}" ${ready ? "" : "disabled"}>
          ${icon("ambulance")}<span>${ready ? "Dispatch ambulance" : "No ambulance available"}</span>
        </button>
        <p class="action-note">Sent to the 3 nearest hospitals. The first to dispatch takes the case; the others are locked out so two ambulances never race to the same crash.</p>
      </div>`;
  }

  const idx = stageIndex(inc);
  const dispatchedAt = parseTs(inc.dispatch_timestamp);
  const livePos = liveAmbulancePos(inc);
  const arriveAt = etaTarget(inc);
  const stepper = `
    <div class="stepper five">
      ${STAGES.map((s, i) => `
        <div class="step ${i < idx || (i === idx && isDone(inc)) ? "done" : i === idx ? "current" : ""}">
          <div class="step-bar"></div>
          <div class="step-label">${STAGE_LABELS[s]}</div>
        </div>`).join("")}
    </div>`;

  const unit = fleetUnit(inc.ambulance_id);
  const crew = `
    <div class="crew">
      <div class="crew-avatar">${icon("ambulance")}</div>
      <div class="crew-text">
        <strong>${esc(inc.ambulance_unit || "Ambulance")}${inc.ambulance_type ? ` · ${esc(inc.ambulance_type)}` : ""}</strong>
        <span>${esc([inc.driver_name, inc.ambulance_vehicle].filter(Boolean).join(" · "))}</span>
        ${livePos ? `<span class="crew-live">Live GPS</span>` : ""}
      </div>
      ${inc.driver_phone ? `<a class="icon-btn" href="tel:${esc(String(inc.driver_phone).replace(/[^\d+]/g, ""))}" title="Call crew">${icon("phone")}</a>` : ""}
    </div>`;

  let big;
  if (isDone(inc)) big = `<div class="action-big" style="color:var(--success)">Admitted</div>`;
  else if (inc.dispatch_status === "PICKED_UP") big = `<div class="action-big">Inbound</div>`;
  else if (idx >= 2) big = `<div class="action-big">On scene</div>`;
  else big = `<div class="action-big" data-tick="eta" data-t="${arriveAt || ""}">${arriveAt ? fmtEta(arriveAt) : "—"}</div>`;

  if (k === "mine") {
    const next = NEXT_ACTION[inc.dispatch_status];
    const nextStatus = STAGES[idx + 1];
    const admit = nextStatus === "ADMITTED";
    return `
      <div class="action-card mine">
        <div class="action-row">
          <div>
            <div class="action-label">${isDone(inc) ? "Case closed" : inc.dispatch_status === "PICKED_UP" ? "Patient on the way to your ER" : idx >= 2 ? "Crew status" : "Arrival at scene in"}</div>
            ${big}
          </div>
          <div class="action-right">
            <span>Dispatched ${fmtClock(dispatchedAt)}</span>
            <strong>${fmtKm(distanceFrom(inc.claimed_by_hospital_id, inc))} from you</strong>
          </div>
        </div>
        ${idx <= 1 && !isDone(inc) ? `<div class="progress"><span data-tick="progress" data-from="${dispatchedAt || ""}" data-to="${arriveAt || ""}" style="width:${progressPct(dispatchedAt, arriveAt)}%"></span></div>` : ""}
        ${stepper}
        ${crew}
        ${next ? `<button class="btn ${admit ? "btn-primary" : "btn-secondary"} btn-block" data-action="advance" data-id="${inc.id}">${icon(admit ? "check" : "arrow-right")}<span>${next}</span></button>` : ""}
        ${next && !admit && unit && unit.has_crew_app ? `<p class="action-note">The crew updates these stages from the Accidiox Crew app. Use this only if they can't.</p>` : ""}
        ${inc.dispatch_status === "PICKED_UP" && inc.blood_group ? `<p class="action-note">Prepare <strong>${esc(inc.blood_group)}</strong> blood${inc.medical_notes ? ` · ${esc(inc.medical_notes)}` : ""}.</p>` : ""}
      </div>`;
  }

  return `
    <div class="action-card">
      <div class="action-row">
        <div>
          <div class="action-label">Handled by</div>
          <div style="font-size:15px;font-weight:600;margin-top:2px;">${esc(hospitalName(inc.claimed_by_hospital_id, inc.claimed_by_hospital_name))}</div>
        </div>
        <div class="action-right">
          <span>${isDone(inc) ? "Status" : "Arrival in"}</span>
          <strong class="mono" ${!isDone(inc) && idx < 2 && arriveAt ? `data-tick="eta" data-t="${arriveAt}"` : ""}>${isDone(inc) ? "Admitted" : idx >= 2 ? STAGE_LABELS[inc.dispatch_status] : arriveAt ? fmtEta(arriveAt) : "—"}</strong>
        </div>
      </div>
      ${stepper}
      ${crew}
      <div class="locked-note">${icon("shield", "ic ic-xs")}<span>Dispatch is locked for your hospital. <strong>${esc(hospitalName(inc.claimed_by_hospital_id))}</strong> is responding, so your ambulances stay free for the next emergency.</span></div>
    </div>`;
}

// Arrival time at the scene. With live crew GPS the server keeps
// eta_minutes current; otherwise count down from the dispatch time.
function etaTarget(inc) {
  const eta = Number(inc.eta_minutes);
  if (!isFinite(eta)) return null;
  if (liveAmbulancePos(inc)) return now() + eta * 60000;
  const dispatchedAt = parseTs(inc.dispatch_timestamp);
  return dispatchedAt ? dispatchedAt + eta * 60000 : null;
}

function fmtEta(arriveAt) {
  const left = arriveAt - now();
  return left > 0 ? fmtDuration(left) : "Arriving";
}
function progressPct(from, to) {
  if (!from || !to || to <= from) return 0;
  return Math.max(2, Math.min(100, ((now() - from) / (to - from)) * 100));
}

function renderMetrics(inc) {
  const speed = num(inc.speed_kmh) || 0;
  const tilt = num(inc.tilt_angle) || 0;
  const roll = num(inc.roll_angle);
  const pitch = num(inc.pitch_angle);
  const g = num(String(inc.impact_g || "").split(" ")[0]);
  const level = (v, mid, hi) => (v >= hi ? "hi" : v >= mid ? "mid" : "");
  const metric = (label, value, unit, pct, lvl) => `
    <div class="metric">
      <span>${label}</span>
      <strong>${value}<small>${unit}</small></strong>
      <div class="meter"><i class="${lvl}" style="width:${Math.max(4, Math.min(100, pct))}%"></i></div>
    </div>`;
  const impactDesc = String(inc.impact_g || "").replace(/^[\d.]+\s*G\s*/i, "").replace(/[()]/g, "").trim();

  return `
    <div class="metrics">
      ${metric("Impact", g != null ? g.toFixed(1) : "—", "g", ((g || 0) / 6) * 100, level(g || 0, 2.5, 4))}
      ${metric("Speed", speed.toFixed(0), "km/h", speed, level(speed, 40, 60))}
      ${metric("Tilt", tilt.toFixed(1), "°", (tilt / 90) * 100, level(tilt, 60, 80))}
      ${metric("Roll", roll != null ? roll.toFixed(1) : "—", "°", (Math.abs(roll || 0) / 90) * 100, level(Math.abs(roll || 0), 60, 80))}
      ${metric("Pitch", pitch != null ? pitch.toFixed(1) : "—", "°", (Math.abs(pitch || 0) / 90) * 100, level(Math.abs(pitch || 0), 30, 60))}
      ${metric("Confirm hold", "10", "s", 100, "")}
    </div>
    <div class="severity-note">${icon("activity", "ic ic-xs")}<span>${esc(impactDesc || "Lateral capsize")} · 10 s tilt hold above 85° + 20 s rider cancel window</span></div>`;
}

function renderAlerted(inc) {
  const list = inc.alerted_hospitals || [];
  if (!list.length) return `<p class="muted-sm">No hospitals were in range.</p>`;
  return `
    <div class="fac-list">
      ${list.map((h) => {
        const you = state.me && h.id === state.me.id;
        const responding = h.id === inc.claimed_by_hospital_id;
        const tag = responding ? `<span class="tag tag-brand">Responding</span>`
          : inc.dispatch_status !== "UNCLAIMED" ? `<span class="tag">Standby</span>` : "";
        return `
          <div class="fac-item ${you ? "you" : ""}">
            <span class="fac-rank">${h.rank}</span>
            <span class="fac-name">${esc(h.name)}${you ? ` <span class="tag tag-brand">You</span>` : ""} ${tag}</span>
            <span class="fac-dist">${fmtKm(h.distance_km)}</span>
          </div>`;
      }).join("")}
    </div>`;
}

function renderTimeline(inc) {
  const events = (inc.timeline || []).map((e) => {
    let sub = e.note || "";
    if (!sub && e.actor_type === "ambulance") sub = `Updated by ${e.by} crew`;
    if (!sub && e.actor_type === "hospital") sub = `Updated by ${hospitalName(e.by, e.by)}`;
    let title = EVENT_TEXT[e.status] || e.status;
    if (e.status === "DISPATCHED") title = `Claimed by ${hospitalName(e.by, e.by)}`;
    const cls = e.status === "REPORTED" ? "crit" : e.status === "ADMITTED" ? "ok" : e.status === "ALERTED" ? "" : "brand";
    return { t: parseTs(e.at), cls, title, sub };
  });
  return `
    <ul class="timeline">
      ${events.reverse().map((e) => `
        <li class="${e.cls}">
          <div class="tl-row"><span>${esc(e.title)}</span><span class="tl-time">${fmtClock(e.t)}</span></div>
          ${e.sub ? `<div class="tl-sub">${esc(e.sub)}</div>` : ""}
        </li>`).join("")}
    </ul>`;
}

// ----- Network -----
function renderNetwork() {
  const grid = $("hospitalNetwork");
  const claims = state.incidents.map((i) => [i.id, i.claimed_by_hospital_id, i.dispatch_status]);
  if (!changed("network", [state.hospitals, claims, state.me && state.me.id])) return;
  $("networkSummary").textContent = `${state.hospitals.length} hospitals on the grid`;

  // Own hospital first, then nearest others.
  const meLL = state.me ? [state.me.latitude, state.me.longitude] : null;
  const list = [...state.hospitals].sort((a, b) => {
    if (state.me && a.id === state.me.id) return -1;
    if (state.me && b.id === state.me.id) return 1;
    return meLL ? haversineKm(meLL, [a.latitude, a.longitude]) - haversineKm(meLL, [b.latitude, b.longitude]) : 0;
  }).slice(0, 8);

  grid.innerHTML = list.map((h) => {
    const active = state.incidents.filter((i) => i.claimed_by_hospital_id === h.id && !isDone(i));
    const current = state.me && h.id === state.me.id;
    return `
      <div class="net-card ${current ? "current" : ""}">
        <div class="net-top">
          <span class="net-name">${esc(h.name)}</span>
          ${current ? `<span class="tag tag-brand">You</span>` : ""}
        </div>
        <div class="net-stats">
          <span class="net-stat" title="Ambulances ready / fleet">${icon("ambulance", "ic ic-xs")}<strong>${h.ambulances_available}</strong>/${h.ambulances_total}</span>
          <span class="net-stat" title="Trauma beds free">${icon("bed", "ic ic-xs")}<strong>${h.er_beds_free}</strong> beds</span>
        </div>
        <div class="net-foot ${active.length ? "busy" : ""}">${active.length ? `Responding to ${active.map(incCode).join(", ")}` : h.ambulances_available ? "Available" : "No units free"}</div>
      </div>`;
  }).join("");
}

// ================= Map =================
function initMap() {
  map = L.map("hospitalMap", { zoomControl: false, attributionControl: true }).setView([25.29, 82.99], 13);

  const esri = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas";
  L.tileLayer(`${esri}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
    maxZoom: 19, maxNativeZoom: 16, attribution: "Tiles &copy; Esri"
  }).addTo(map);
  L.tileLayer(`${esri}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, {
    maxZoom: 19, maxNativeZoom: 16, pane: "overlayPane"
  }).addTo(map);
  map.attributionControl.setPrefix(false);

  // The map's box changes as fonts load and breakpoints kick in; keep
  // Leaflet's cached size in sync or fitBounds frames the wrong area.
  if ("ResizeObserver" in window) {
    let t = null;
    new ResizeObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => {
        map.invalidateSize({ pan: false });
        if (Date.now() - lastFitAt < 4000) fitToSelection();
      }, 120);
    }).observe($("hospitalMap"));
  }
}

function hospitalIcon(active) {
  return L.divIcon({
    className: "",
    html: `<div class="mk-hosp ${active ? "active" : ""}"><svg viewBox="0 0 24 24"><path d="M12 6v12M6 12h12"/></svg></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });
}

function incidentIcon(inc) {
  const k = kindOf(inc);
  const cls = ["mk-incident", k === "open" ? "open" : isDone(inc) || k === "other" ? "dim" : ""];
  if (inc.id === state.selectedId) cls.push("selected");
  return L.divIcon({ className: "", html: `<div class="${cls.join(" ")}"><span class="core"></span></div>`, iconSize: [22, 22], iconAnchor: [11, 11] });
}

function renderMap() {
  if (!map) return;
  const ids = new Set(state.incidents.map((i) => String(i.id)));

  Object.keys(incidentMarkers).forEach((id) => {
    if (!ids.has(id)) {
      map.removeLayer(incidentMarkers[id].marker);
      delete incidentMarkers[id];
    }
  });

  state.incidents.forEach((inc) => {
    const key = `${kindOf(inc)}|${inc.dispatch_status}|${inc.id === state.selectedId}`;
    const entry = incidentMarkers[inc.id];
    if (!entry) {
      const marker = L.marker(incLatLng(inc), { icon: incidentIcon(inc), zIndexOffset: 500 }).addTo(map);
      marker.on("click", () => selectIncident(inc.id));
      marker.bindTooltip(`${incCode(inc)} · ${esc(inc.location_name || "")}`, { direction: "top", offset: [0, -10] });
      incidentMarkers[inc.id] = { marker, key };
    } else if (entry.key !== key) {
      entry.marker.setIcon(incidentIcon(inc));
      entry.key = key;
    }
  });

  state.hospitals.forEach((h) => {
    const active = state.me && h.id === state.me.id;
    if (!hospitalMarkers[h.id]) {
      hospitalMarkers[h.id] = L.marker([h.latitude, h.longitude], { icon: hospitalIcon(active), zIndexOffset: active ? 200 : 100 })
        .addTo(map)
        .bindPopup(`<strong>${esc(h.full_name || h.name)}</strong><div class="pop-sub">${esc([h.area, h.city].filter(Boolean).join(", "))} · ${h.ambulances_available}/${h.ambulances_total} ambulances · ${h.er_beds_free} beds</div>`);
    }
  });

  renderRoute();
  renderFocusCard();
}

function routeKey(hospId, incId) {
  return `${hospId}|${incId}`;
}

function routeOrigin(inc) {
  return inc.dispatch_status === "UNCLAIMED" ? state.me.id : inc.claimed_by_hospital_id || state.me.id;
}

// Road route from Geoapify (through the server-side proxy). Falls back to a
// gentle curve when the key isn't configured or the crash is far away.
function getRoute(hospId, inc) {
  const key = routeKey(hospId, inc.id);
  if (routeCache.has(key)) return routeCache.get(key);

  const h = hospitalById(hospId);
  const end = incLatLng(inc);
  const start = h ? [h.latitude, h.longitude] : end;
  const entry = { status: "fallback", latlngs: curve(start, end), seconds: null };
  routeCache.set(key, entry);

  if (h && haversineKm(start, end) <= ROUTE_MAX_KM) {
    entry.status = "loading";
    const url = `${ROUTE_API}?type=routing&from_lat=${start[0]}&from_lon=${start[1]}&to_lat=${end[0]}&to_lon=${end[1]}`;
    fetch(url)
      .then((r) => r.json())
      .then((geo) => {
        const feat = geo && geo.features && geo.features[0];
        if (!feat) throw new Error(geo && geo.error ? geo.error : "no route");
        const g = feat.geometry;
        const lines = g.type === "MultiLineString" ? g.coordinates : [g.coordinates];
        entry.latlngs = lines.flat().map(([lon, lat]) => [lat, lon]);
        entry.seconds = feat.properties && feat.properties.time;
        entry.status = "ok";
      })
      .catch(() => { entry.status = "fallback"; })
      .finally(() => {
        const sel = state.incidents.find((i) => i.id === state.selectedId);
        if (sel && routeKey(routeOrigin(sel), sel.id) === key) {
          renderRoute();
          if (state.fitPendingFor === sel.id) fitToSelection();
          renderDetail();
        }
      });
  }
  return entry;
}

function curve(a, b, steps = 40) {
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const dx = b[1] - a[1], dy = b[0] - a[0];
  const ctrl = [mid[0] - dx * 0.18, mid[1] + dy * 0.18];
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    pts.push([u * u * a[0] + 2 * u * t * ctrl[0] + t * t * b[0], u * u * a[1] + 2 * u * t * ctrl[1] + t * t * b[1]]);
  }
  return pts;
}

function renderRoute() {
  const inc = state.incidents.find((i) => i.id === state.selectedId);
  const route = inc ? getRoute(routeOrigin(inc), inc) : null;
  if (!changed("route", inc ? [inc.id, inc.dispatch_status, routeOrigin(inc), route.status] : null) && routeLayer) {
    if (inc) updateAmbulance(inc, route);
    return;
  }

  if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
  if (!inc) { removeAmbulance(); return; }

  const open = inc.dispatch_status === "UNCLAIMED";
  const done = isDone(inc);
  const color = open ? "#f2555a" : kindOf(inc) === "other" ? "#6b7280" : "#4f8cff";

  routeLayer = L.layerGroup([
    L.polyline(route.latlngs, { color: "#05070a", weight: 8, opacity: 0.7, interactive: false }),
    L.polyline(route.latlngs, {
      color, weight: 4, opacity: done ? 0.35 : 0.95, dashArray: open ? "2 9" : null, lineCap: "round", interactive: false
    })
  ]).addTo(map);

  updateAmbulance(inc, route);
}

function removeAmbulance() {
  if (ambulanceMarker) { map.removeLayer(ambulanceMarker); ambulanceMarker = null; }
}

// Real crew GPS when the Crew app is streaming; otherwise an estimate along
// the route from dispatch time and ETA.
function updateAmbulance(inc, route) {
  if (inc.dispatch_status === "UNCLAIMED" || isDone(inc)) { removeAmbulance(); return; }
  let pos = liveAmbulancePos(inc);
  if (!pos) {
    const dispatchedAt = parseTs(inc.dispatch_timestamp);
    const arriveAt = dispatchedAt ? dispatchedAt + (Number(inc.eta_minutes) || 5) * 60000 : null;
    const t = stageIndex(inc) >= 2 ? 1 : Math.min(0.97, progressPct(dispatchedAt, arriveAt) / 100);
    pos = pointAlong(route.latlngs, t);
  }
  if (!ambulanceMarker) {
    ambulanceMarker = L.marker(pos, {
      icon: L.divIcon({ className: "", html: `<div class="mk-amb"><svg viewBox="0 0 24 24"><use href="#i-ambulance"/></svg></div>`, iconSize: [30, 30], iconAnchor: [15, 15] }),
      zIndexOffset: 1000, interactive: false
    }).addTo(map);
  } else {
    ambulanceMarker.setLatLng(pos);
  }
}

function pointAlong(latlngs, t) {
  if (latlngs.length < 2) return latlngs[0];
  const segs = [];
  let total = 0;
  for (let i = 1; i < latlngs.length; i++) {
    const d = haversineKm(latlngs[i - 1], latlngs[i]);
    segs.push(d);
    total += d;
  }
  let target = total * t;
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i] || i === segs.length - 1) {
      const f = segs[i] ? Math.min(1, target / segs[i]) : 0;
      const a = latlngs[i], b = latlngs[i + 1];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
    target -= segs[i];
  }
  return latlngs[latlngs.length - 1];
}

function fitToSelection() {
  const inc = state.incidents.find((i) => i.id === state.selectedId);
  if (!inc || !map) return;
  const route = getRoute(routeOrigin(inc), inc);
  const bounds = L.latLngBounds(route.latlngs.concat([incLatLng(inc)]));
  lastFitAt = Date.now();
  map.invalidateSize({ pan: false });
  const wide = map.getSize().x > 700;
  map.flyToBounds(bounds, {
    paddingTopLeft: [wide ? 360 : 40, wide ? 60 : 150],
    paddingBottomRight: [70, 60],
    maxZoom: 15,
    duration: 0.8
  });
  if (route.status !== "loading") state.fitPendingFor = null;
}

function fitAll() {
  const pts = state.incidents.map(incLatLng).concat(state.hospitals.map((h) => [h.latitude, h.longitude]));
  if (pts.length) map.flyToBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 14, duration: 0.8 });
}

function renderFocusCard() {
  const card = $("mapFocusCard");
  const inc = state.incidents.find((i) => i.id === state.selectedId);
  if (!inc) { card.hidden = true; return; }
  const origin = routeOrigin(inc);
  const route = routeCache.get(routeKey(origin, inc.id));
  const km = route && route.status === "ok" ? pathKm(route.latlngs) : distanceFrom(origin, inc);
  const k = kindOf(inc);
  const originH = hospitalById(origin);
  const eta = k === "open"
    ? `~${fmtMin(estimateEtaMin(originH ? [originH.latitude, originH.longitude] : null, inc, routeKey(origin, inc.id)))}`
    : inc.eta_minutes != null ? fmtMin(inc.eta_minutes) : "—";

  card.hidden = false;
  card.innerHTML = `
    <div class="focus-top">
      <span class="inc-code">${incCode(inc)}</span>
      ${statusPill(inc)}
    </div>
    <div class="focus-title">${esc(inc.location_name || "Unknown location")}</div>
    <div class="muted-sm">${k === "open" ? `Preview route from ${esc(state.me.name)}` : `Responding: ${esc(hospitalName(inc.claimed_by_hospital_id, inc.claimed_by_hospital_name))}`}</div>
    <div class="focus-stats">
      <div class="focus-stat"><span>${route && route.status === "ok" ? "Road distance" : "Distance"}</span><strong>${fmtKm(km)}</strong></div>
      <div class="focus-stat"><span>ETA</span><strong>${eta}</strong></div>
      <div class="focus-stat"><span>Blood</span><strong>${esc(inc.blood_group || "—")}</strong></div>
    </div>`;
}

function pathKm(latlngs) {
  let d = 0;
  for (let i = 1; i < latlngs.length; i++) d += haversineKm(latlngs[i - 1], latlngs[i]);
  return d;
}

// ================= Interaction =================
function selectIncident(id, { silent = false } = {}) {
  const wasSelected = state.selectedId === id;
  state.selectedId = id;
  if (wasSelected && silent) return;
  state.fitPendingFor = id;
  if (!silent) renderAll();
  fitToSelection();
}

function initControls() {
  $("incidentQueueList").addEventListener("click", (e) => {
    const row = e.target.closest(".inc-row");
    if (row) selectIncident(Number(row.dataset.id));
  });

  $("queueFilters").addEventListener("click", (e) => {
    const btn = e.target.closest(".seg");
    if (!btn) return;
    state.filter = btn.dataset.filter;
    document.querySelectorAll("#queueFilters .seg").forEach((b) => b.classList.toggle("active", b === btn));
    renderQueue();
  });

  $("detailPanel").addEventListener("click", (e) => {
    const action = e.target.closest("[data-action]");
    if (action) {
      const id = Number(action.dataset.id);
      if (action.dataset.action === "claim") openClaimModal(id);
      if (action.dataset.action === "advance") advanceStage(id, action);
      return;
    }
    const copy = e.target.closest("[data-copy]");
    if (copy) {
      navigator.clipboard?.writeText(copy.dataset.copy).then(
        () => toast("success", "Coordinates copied", copy.dataset.copy, "check"),
        () => toast("", "Couldn't copy", "Select the coordinates manually.", "copy")
      );
    }
  });

  document.querySelectorAll("[data-beds]").forEach((btn) => {
    btn.addEventListener("click", () => changeBeds(Number(btn.dataset.beds)));
  });

  $("btnAudioToggle").addEventListener("click", () => {
    state.soundOn = !state.soundOn;
    savePref("accidiox.sound", state.soundOn ? "on" : "off");
    updateSoundButton();
    if (state.soundOn) playAlertTone(true);
  });
  updateSoundButton();

  $("btnSimulateCrash").addEventListener("click", simulateCrashIncident);
  $("btnResetIncidents").addEventListener("click", () => openDialog("confirmModal"));
  $("btnConfirmCancel").addEventListener("click", () => closeDialog("confirmModal"));
  $("btnConfirmOk").addEventListener("click", resetDemo);

  $("btnCancelClaimModal").addEventListener("click", closeClaimModal);
  $("btnCloseClaimModal").addEventListener("click", closeClaimModal);
  $("claimAmbulanceForm").addEventListener("submit", (e) => {
    e.preventDefault();
    submitIncidentClaim();
  });
  $("unitOptions").addEventListener("change", updateModalEta);

  document.querySelectorAll(".dialog-backdrop").forEach((bd) => {
    bd.addEventListener("mousedown", (e) => { if (e.target === bd) closeDialog(bd.id); });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".dialog-backdrop.show").forEach((bd) => closeDialog(bd.id));
      closeAccountMenu();
    }
  });

  $("btnZoomIn").addEventListener("click", () => map.zoomIn());
  $("btnZoomOut").addEventListener("click", () => map.zoomOut());
  $("btnFitAll").addEventListener("click", fitAll);
}

function updateSoundButton() {
  const btn = $("btnAudioToggle");
  btn.setAttribute("aria-pressed", String(state.soundOn));
  btn.title = state.soundOn ? "Mute alert sound" : "Unmute alert sound";
  btn.classList.toggle("muted", !state.soundOn);
  btn.innerHTML = icon(state.soundOn ? "bell" : "bell-off", "ic");
}

// ----- Account menu -----
function initAccountMenu() {
  const menu = $("facilityMenu");
  $("facilityTrigger").addEventListener("click", (e) => {
    e.stopPropagation();
    const open = !menu.classList.contains("open");
    menu.classList.toggle("open", open);
    $("facilityTrigger").setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#facilitySwitcher")) closeAccountMenu();
  });
  $("btnSignOut").addEventListener("click", () => S.logout(ROLE));
  if (account && account.hospital) {
    $("facilityName").textContent = account.hospital.short_name;
    $("facilityAvatar").textContent = S.initials(account.hospital.short_name);
  }
}

function closeAccountMenu() {
  $("facilityMenu").classList.remove("open");
  $("facilityTrigger").setAttribute("aria-expanded", "false");
}

function applyAccount() {
  const me = state.me;
  const initials = S.initials(me.name);
  $("facilityAvatar").textContent = initials;
  $("facilityName").textContent = me.name;
  $("facilityMeta").textContent = [me.area, me.city].filter(Boolean).join(" · ") || "Emergency department";
  $("accountAvatar").textContent = S.initials(me.user_name);
  $("accountName").textContent = me.user_name;
  $("accountEmail").textContent = me.email;
  document.title = `${me.name} · Accidiox Dispatch`;
}

async function changeBeds(delta) {
  if (!state.me) return;
  const next = Math.max(0, state.me.er_beds_free + delta);
  state.me.er_beds_free = next;
  renderKpis();
  const data = await postAction("update_capacity", { er_beds_free: next });
  if (data.status !== "success") toast("danger", "Couldn't update beds", data.message || "Try again.", "alert");
}

// ----- Claim flow -----
function unitEta(unit, inc) {
  const from = unit.latitude != null ? [unit.latitude, unit.longitude] : [state.me.latitude, state.me.longitude];
  return { km: haversineKm(from, incLatLng(inc)), min: estimateEtaMin(from, inc) };
}

function openClaimModal(id) {
  const inc = state.incidents.find((i) => i.id === id);
  if (!inc) return;
  state.pendingClaimId = id;

  $("modalClaimHospitalName").textContent = state.me.full_name || state.me.name;
  $("modalIncidentSummary").innerHTML = `
    <span class="inc-indicator" style="background:var(--danger)"></span>
    <span class="dialog-incident-text">
      <strong>${esc(inc.location_name || "Unknown location")}</strong>
      <span>${incCode(inc)} · ${esc(inc.rider_name || "Rider")}${inc.blood_group ? ` · ${esc(inc.blood_group)} blood` : ""}</span>
    </span>`;

  const typeDesc = { ALS: "Advanced life support", BLS: "Basic life support", TRAUMA: "Rapid trauma response" };
  const statusText = { assigned: "On another case", offline: "Crew off duty" };
  const units = [...state.fleet].sort((a, b) =>
    (a.status !== "available") - (b.status !== "available") || unitEta(a, inc).min - unitEta(b, inc).min);
  const firstReady = units.find((u) => u.status === "available");

  $("unitOptions").innerHTML = units.length ? units.map((u) => {
    const ready = u.status === "available";
    const e = unitEta(u, inc);
    return `
      <label class="unit-option ${ready ? "" : "disabled"}">
        <input type="radio" name="unit" value="${u.id}" data-label="${esc(u.unit_code)}" ${ready ? "" : "disabled"} ${u === firstReady ? "checked" : ""} />
        <span class="unit-body">
          <span class="unit-top"><strong>${esc(u.unit_code)}</strong><span class="tag">${esc(u.unit_type)}</span>${u === firstReady ? `<span class="tag tag-brand">Fastest</span>` : ""}${u.has_crew_app ? `<span class="tag">Crew app</span>` : ""}</span>
          <span class="unit-desc">${ready ? esc(typeDesc[u.unit_type] || "Ambulance") : statusText[u.status] || u.status} · ${esc(u.crew_name || "Crew")}${u.vehicle_number ? ` · ${esc(u.vehicle_number)}` : ""}</span>
          ${ready ? `<span class="unit-meta"><span>${fmtKm(e.km)}</span><span>~${fmtMin(e.min)} to scene</span></span>` : ""}
        </span>
      </label>`;
  }).join("") : `<div class="unit-empty">No ambulances are registered for your hospital yet. Ask your crews to sign up in the Accidiox Crew app.</div>`;

  $("btnConfirmClaim").disabled = !firstReady;
  updateModalEta();
  openDialog("claimModal");
  setTimeout(() => document.querySelector("#unitOptions input:checked")?.focus(), 50);
}

function updateModalEta() {
  const inc = state.incidents.find((i) => i.id === state.pendingClaimId);
  const checked = document.querySelector('#unitOptions input[name="unit"]:checked');
  const unit = checked ? fleetUnit(Number(checked.value)) : null;
  if (!inc || !unit) { $("modalEta").innerHTML = `${icon("clock")}<span>No ambulance available right now.</span>`; return; }
  const e = unitEta(unit, inc);
  $("modalEta").innerHTML = `${icon("clock")}<span>${esc(unit.unit_code)} arrives in <strong>~${fmtMin(e.min)}</strong> · ${fmtKm(e.km)}. The rider sees this ETA in their app.</span>`;
}

function closeClaimModal() {
  state.pendingClaimId = null;
  closeDialog("claimModal");
}

async function submitIncidentClaim() {
  const id = state.pendingClaimId;
  const inc = state.incidents.find((i) => i.id === id);
  const checked = document.querySelector('#unitOptions input[name="unit"]:checked');
  if (!inc || !checked) return closeClaimModal();
  $("btnConfirmClaim").disabled = true;

  try {
    const data = await postAction("claim_incident", { incident_id: id, ambulance_id: Number(checked.value) });
    closeClaimModal();
    if (data.status === "claimed_success") {
      toast("success", `${checked.dataset.label} dispatched`, `${incCode(inc)} is yours. The other alerted hospitals are on standby.`, "ambulance");
      speak(`Ambulance ${checked.dataset.label} dispatched to ${inc.location_name || "the crash site"}.`);
    } else {
      toast("danger", data.code === "already_claimed" ? "Already claimed" : "Dispatch failed", data.message || "Please try again.", "alert");
    }
  } catch (err) {
    closeClaimModal();
    toast("danger", "Couldn't reach the grid", "Check the connection and try again.", "alert");
  }
  fetchDispatchData();
}

async function advanceStage(id, btn) {
  const inc = state.incidents.find((i) => i.id === id);
  if (!inc) return;
  const next = STAGES[stageIndex(inc) + 1];
  if (!next) return;
  btn.disabled = true;
  try {
    const data = await postAction("update_status", { incident_id: id, new_status: next });
    if (data.status === "updated_success") {
      toast(next === "ADMITTED" ? "success" : "brand", `${incCode(inc)} · ${STAGE_LABELS[next]}`,
        next === "ADMITTED" ? "Ambulance released and one trauma bed marked occupied." : "Shared with the rider and the grid.",
        next === "ADMITTED" ? "check" : "arrow-right");
    } else {
      toast("danger", "Update failed", data.message || "Please try again.", "alert");
      btn.disabled = false;
    }
  } catch (err) {
    toast("danger", "Couldn't reach the grid", "Check the connection and try again.", "alert");
    btn.disabled = false;
  }
  fetchDispatchData();
}

// ----- Demo tools -----
async function simulateCrashIncident() {
  const btn = $("btnSimulateCrash");
  btn.disabled = true;
  try {
    const data = await postAction("simulate_incident", {});
    if (data.status === "simulated_success" && data.incident) {
      state.seenIds.add(data.incident.id);
      playAlertTone();
      toast("danger", "New crash SOS", `${data.incident.location_name} · ${data.incident.blood_group} blood`, "alert");
      state.selectedId = data.incident.id;
      state.fitPendingFor = data.incident.id;
      await fetchDispatchData();
      fitToSelection();
    } else {
      toast("danger", "Simulation failed", data.message || "Try again.", "alert");
    }
  } catch (err) {
    toast("danger", "Simulation failed", "Is the PHP server running?", "alert");
  }
  btn.disabled = false;
}

async function resetDemo() {
  closeDialog("confirmModal");
  try {
    await postAction("reset_demo", {});
    state.selectedId = null;
    state.seenIds.clear();
    state.loaded = false;
    routeCache.clear();
    await fetchDispatchData();
    toast("", "Demo data reset", "All incidents cleared and ambulances back at base.", "rotate");
  } catch (err) {
    toast("danger", "Reset failed", "Please try again.", "alert");
  }
}

// ----- Dialogs & toasts -----
function openDialog(id) {
  const el = $(id);
  el.classList.add("show");
  el.setAttribute("aria-hidden", "false");
}
function closeDialog(id) {
  const el = $(id);
  el.classList.remove("show");
  el.setAttribute("aria-hidden", "true");
  if (id === "claimModal") state.pendingClaimId = null;
}

function toast(kind, title, body, iconName = "bell") {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.innerHTML = `
    <span class="toast-icon">${icon(iconName, "ic ic-xs")}</span>
    <span class="toast-text"><strong>${esc(title)}</strong>${body ? `<span>${esc(body)}</span>` : ""}</span>`;
  $("toastStack").appendChild(el);
  setTimeout(() => {
    el.classList.add("leaving");
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }, 4200);
}

// ================= Clock tick =================
function tick() {
  const t = now();
  $("clock").textContent = new Date(t).toLocaleTimeString([], { hour12: false });

  document.querySelectorAll("[data-tick]").forEach((el) => {
    const v = Number(el.dataset.t);
    switch (el.dataset.tick) {
      case "ago": if (v) el.textContent = fmtAgo(v); break;
      case "since": if (v) el.textContent = fmtDuration(t - v, { compact: true }); break;
      case "elapsed": if (v) el.textContent = fmtDuration(t - v); break;
      case "eta": if (v) el.textContent = fmtEta(v); break;
      case "progress": el.style.width = `${progressPct(Number(el.dataset.from), Number(el.dataset.to))}%`; break;
    }
  });

  const inc = state.incidents.find((i) => i.id === state.selectedId);
  if (inc && ambulanceMarker && !isDone(inc) && inc.dispatch_status !== "UNCLAIMED") {
    updateAmbulance(inc, getRoute(routeOrigin(inc), inc));
  }
}

// ================= Audio =================
function playAlertTone(force = false) {
  if (!state.soundOn && !force) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = audioCtx || new Ctx();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const t0 = audioCtx.currentTime;
    [0, 0.18, 0.36].forEach((offset, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = i === 2 ? 1175 : 880;
      gain.gain.setValueAtTime(0.0001, t0 + offset);
      gain.gain.exponentialRampToValueAtTime(0.22, t0 + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.16);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0 + offset);
      osc.stop(t0 + offset + 0.18);
    });
  } catch (e) {}
}

function speak(text) {
  if (!state.soundOn || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}
