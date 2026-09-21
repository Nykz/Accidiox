// Rider account features layered on top of app.js:
//  - Settings profile card (medical profile, edit, sign out)
//  - Emergency contact from the profile kept as the primary SOS contact
//  - Live "help is on the way" tracking after a confirmed crash: which
//    hospital accepted, which ambulance, ETA, and the ambulance on the map.
(function () {
  const S = window.AccidioxSession;
  const POLL_MS = 4000;
  const STEPS = [
    ["DISPATCHED", "Accepted"],
    ["EN_ROUTE", "En route"],
    ["AT_SCENE", "Arrived"],
    ["PICKED_UP", "To hospital"],
    ["ADMITTED", "Admitted"]
  ];
  const DISMISS_KEY = "accidiox.rider.dismissedIncident";

  const track = { id: null, timer: null, lastStatus: null, alerted: [], incident: null, fitted: false };
  let ambMarker = null;
  let hospMarker = null;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const svg = (paths, cls = "icon") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const ICON = {
    amb: '<path d="M10 10H6M8 8v4"/><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.28a1 1 0 0 0-.68-.95l-1.9-.64a1 1 0 0 1-.6-.53L17.6 9.6A1 1 0 0 0 16.7 9H14"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/><path d="M9 18h6"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    radio: '<path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5M19.1 4.9C23 8.8 23 15.1 19.1 19"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    hosp: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 6h4M12 4v4M10 14h4M10 18h4"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    drop: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5S5 13 5 15a7 7 0 0 0 7 7z"/>'
  };

  function profile() {
    const u = S.user("rider");
    return u && u.profile ? u.profile : null;
  }
  function phoneDigits(p) {
    let d = String(p || "").replace(/\D/g, "");
    if (d.length === 10) d = "91" + d;
    return d;
  }

  // ================= Profile card (Settings) =================
  function renderProfileCard() {
    const card = $("profileCard");
    if (!card) return;
    const u = S.user("rider") || {};
    const p = profile() || {};
    const name = p.full_name || u.name || "Rider";
    const rows = [
      ["Allergies", p.allergies || "None"],
      ["Conditions", p.conditions || "None"],
      ["Emergency contact", p.emergency_name ? `${p.emergency_name}${p.emergency_relation ? ` · ${p.emergency_relation}` : ""}` : "Not set"],
      ["Vehicle", [p.vehicle_number, p.vehicle_model].filter(Boolean).join(" · ") || "Not set"]
    ];
    card.innerHTML = `
      <div class="profile-head">
        <span class="profile-avatar">${esc(S.initials(name))}</span>
        <div class="profile-id">
          <strong>${esc(name)}</strong>
          <span>${esc(u.email || "")}</span>
        </div>
        <span class="profile-blood" title="Blood group">${svg(ICON.drop, "icon")}${esc(p.blood_group || "—")}</span>
      </div>
      <div class="profile-rows">
        ${rows.map(([k, v]) => `<div class="profile-row"><span>${k}</span><strong>${esc(v)}</strong></div>`).join("")}
      </div>
      <p class="profile-note">Shared with the responding hospital and ambulance only when a crash is confirmed.</p>
      <div class="profile-actions">
        <a class="btn btn-secondary" href="onboarding.html?edit=1">${svg(ICON.edit)}<span>Edit medical profile</span></a>
        <button class="btn btn-danger-outline" type="button" id="btnSignOut">${svg(ICON.out)}<span>Sign out</span></button>
      </div>`;
    $("btnSignOut").addEventListener("click", () => {
      if (confirm("Sign out of Accidiox? Crash alerts won't include your medical profile until you sign in again.")) S.logout("rider");
    });
  }

  // Keeps the profile's emergency contact at the top of the SOS list.
  function mergeProfileContact(contacts) {
    const p = profile();
    if (!p || !p.emergency_phone) return null;
    const phone = phoneDigits(p.emergency_phone);
    if (contacts[0] && contacts[0].phone === phone) return null;
    const name = `${p.emergency_name || "Emergency contact"}${p.emergency_relation ? ` (${p.emergency_relation})` : ""}`;
    return [{ name, phone }, ...contacts.filter((c) => c.phone !== phone)];
  }

  // ================= Rescue tracking =================
  function trackIncident(id, alerted) {
    track.id = id;
    track.alerted = alerted || [];
    track.lastStatus = null;
    track.fitted = false;
    try { localStorage.removeItem(DISMISS_KEY); } catch (e) {}
    renderRescue({ id, dispatch_status: "UNCLAIMED", alerted_hospitals: track.alerted.map((a, i) => ({ name: a.name, distance_km: a.distance_km, rank: i + 1 })) });
    startPolling();
  }

  function startPolling() {
    clearInterval(track.timer);
    poll();
    track.timer = setInterval(poll, POLL_MS);
  }

  async function poll() {
    if (!S.token("rider")) return;
    try {
      const { ok, data } = await S.api("rider", "api/rider.php?action=active_incident");
      if (!ok || !data.incident) return;
      const inc = data.incident;
      if (track.id && inc.id !== track.id) return;

      let dismissed = null;
      try { dismissed = localStorage.getItem(DISMISS_KEY); } catch (e) {}
      if (!track.id) {
        // Resuming after an app restart: only show crashes still in progress.
        if (String(inc.id) === dismissed) return;
        track.id = inc.id;
        track.lastStatus = inc.dispatch_status;
        if (!track.timer) track.timer = setInterval(poll, POLL_MS);
      }

      if (track.lastStatus && track.lastStatus !== inc.dispatch_status) announce(inc);
      track.lastStatus = inc.dispatch_status;
      track.incident = inc;
      renderRescue(inc);
      updateMap(inc);
      updateSosModal(inc);
      if (inc.dispatch_status === "ADMITTED") {
        clearInterval(track.timer);
        track.timer = null;
      }
    } catch (e) { /* offline: keep the last known state on screen */ }
  }

  function announce(inc) {
    const hosp = inc.claimed_by_hospital_name || "A hospital";
    const msg = {
      DISPATCHED: [`Help is on the way`, `${hosp} is sending ${inc.ambulance_unit || "an ambulance"}. Arriving in about ${inc.eta_minutes || 10} minutes.`],
      EN_ROUTE: [`Ambulance en route`, `${inc.ambulance_unit || "The ambulance"} is heading to you. About ${inc.eta_minutes || 10} minutes.`],
      AT_SCENE: [`Ambulance has arrived`, `The ${hosp} crew is at your location.`],
      PICKED_UP: [`On the way to hospital`, `Heading to ${hosp}. The emergency team is ready.`],
      ADMITTED: [`Admitted to ${hosp}`, `You're in the emergency department.`]
    }[inc.dispatch_status];
    if (!msg) return;

    if (typeof speakVoice === "function") speakVoice(`${msg[0]}. ${msg[1]}`);
    if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
    if ("Notification" in window && Notification.permission === "granted" && navigator.serviceWorker) {
      navigator.serviceWorker.ready
        .then((reg) => reg.showNotification(msg[0], { body: msg[1], icon: "assets/icons/icon-192.png", tag: `incident-${inc.id}`, renotify: true }))
        .catch(() => {});
    }
  }

  function renderRescue(inc) {
    const card = $("rescueCard");
    if (!card) return;
    const status = inc.dispatch_status;
    const stepIdx = STEPS.findIndex(([s]) => s === status);
    card.hidden = false;
    card.className = `card rescue-card ${status === "UNCLAIMED" ? "is-waiting" : status === "ADMITTED" ? "is-done" : "is-coming"}`;

    if (status === "UNCLAIMED") {
      const list = (inc.alerted_hospitals || []).map((h) => `
        <li><span class="rescue-rank">${h.rank}</span><span class="rescue-hname">${esc(h.name)}</span><span class="rescue-dist">${fmtKm(h.distance_km)}</span></li>`).join("");
      card.innerHTML = `
        <div class="rescue-top">
          <span class="rescue-icon pulse">${svg(ICON.radio)}</span>
          <div>
            <div class="rescue-eyebrow">SOS sent · stay where you are</div>
            <h3>Finding the nearest ambulance</h3>
          </div>
        </div>
        <p class="rescue-text">Your location and blood group were sent to the 3 nearest hospitals. The first one to accept will send an ambulance.</p>
        ${list ? `<ol class="rescue-hospitals">${list}</ol>` : ""}`;
      return;
    }

    const hosp = inc.hospital ? inc.hospital.short_name : inc.claimed_by_hospital_name || "Hospital";
    const headline = {
      DISPATCHED: "Help is on the way",
      EN_ROUTE: "Help is on the way",
      AT_SCENE: "Ambulance has arrived",
      PICKED_UP: `On the way to ${hosp}`,
      ADMITTED: `Admitted to ${hosp}`
    }[status] || "Help is on the way";
    const coming = status === "DISPATCHED" || status === "EN_ROUTE";
    const crewPhone = String(inc.driver_phone || "").replace(/[^\d+]/g, "");

    card.innerHTML = `
      <div class="rescue-top">
        <span class="rescue-icon">${svg(status === "ADMITTED" ? ICON.check : ICON.amb)}</span>
        <div class="rescue-head-text">
          <div class="rescue-eyebrow">${esc(hosp)}</div>
          <h3>${esc(headline)}</h3>
        </div>
        ${coming ? `<div class="rescue-eta"><strong>${inc.eta_minutes != null ? inc.eta_minutes : "—"}</strong><span>min</span></div>` : ""}
        ${status === "ADMITTED" ? `<button class="rescue-close" type="button" id="btnDismissRescue" aria-label="Dismiss">${svg(ICON.x)}</button>` : ""}
      </div>

      <div class="rescue-steps">
        ${STEPS.map(([s, label], i) => `<div class="rescue-step ${i < stepIdx || (i === stepIdx && status === "ADMITTED") ? "done" : i === stepIdx ? "current" : ""}"><i></i><span>${label}</span></div>`).join("")}
      </div>

      ${status !== "ADMITTED" ? `
      <div class="rescue-unit">
        <span class="rescue-unit-icon">${svg(ICON.amb)}</span>
        <div class="rescue-unit-text">
          <strong>${esc(inc.ambulance_unit || "Ambulance")}${inc.ambulance_type ? ` · ${esc(inc.ambulance_type)}` : ""}</strong>
          <span>${esc([inc.ambulance_vehicle, inc.driver_name].filter(Boolean).join(" · "))}</span>
        </div>
        ${crewPhone ? `<a class="rescue-call" href="tel:${esc(crewPhone)}" aria-label="Call ambulance crew">${svg(ICON.phone)}</a>` : ""}
      </div>` : ""}

      <p class="rescue-text">${coming
        ? "Stay still if you can. The crew already has your blood group and allergies."
        : status === "AT_SCENE" ? "The crew is with you now."
        : status === "PICKED_UP" ? "The emergency department has been told you're coming."
        : "Your family has been kept informed. Get well soon."}</p>`;

    const dismiss = $("btnDismissRescue");
    if (dismiss) dismiss.addEventListener("click", () => {
      card.hidden = true;
      try { localStorage.setItem(DISMISS_KEY, String(inc.id)); } catch (e) {}
      removeMapLayers();
    });
  }

  function fmtKm(km) {
    const n = Number(km);
    if (!isFinite(n)) return "";
    return n < 10 ? `${n.toFixed(1)} km` : `${Math.round(n)} km`;
  }

  // Ambulance + destination hospital on the home mini-map.
  function updateMap(inc) {
    if (typeof liveMap === "undefined" || !liveMap || typeof L === "undefined") return;
    if (inc.dispatch_status === "ADMITTED" || inc.dispatch_status === "UNCLAIMED") { removeMapLayers(); return; }

    if (inc.hospital && !hospMarker) {
      hospMarker = L.marker([inc.hospital.latitude, inc.hospital.longitude], {
        icon: L.divIcon({ className: "", html: `<div class="rescue-map-hosp">+</div>`, iconSize: [24, 24], iconAnchor: [12, 12] })
      }).addTo(liveMap).bindPopup(esc(inc.hospital.name));
    }
    const pos = inc.ambulance_position;
    if (pos) {
      const ll = [pos.latitude, pos.longitude];
      if (!ambMarker) {
        ambMarker = L.marker(ll, {
          icon: L.divIcon({ className: "", html: `<div class="rescue-map-amb">${svg(ICON.amb)}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] }),
          zIndexOffset: 1000
        }).addTo(liveMap);
      } else {
        ambMarker.setLatLng(ll);
      }
      if (!track.fitted && typeof riderMarker !== "undefined" && riderMarker) {
        liveMap.fitBounds(L.latLngBounds([ll, riderMarker.getLatLng()]), { padding: [40, 40], maxZoom: 16 });
        track.fitted = true;
      }
    }
  }

  function removeMapLayers() {
    if (ambMarker) { ambMarker.remove(); ambMarker = null; }
    if (hospMarker) { hospMarker.remove(); hospMarker = null; }
  }

  // The "SOS sent" modal names the hospital that actually accepted.
  function updateSosModal(inc) {
    if (inc.dispatch_status === "UNCLAIMED") return;
    const name = $("sosSentHospitalName");
    const sub = $("sosSentHospitalSub");
    if (name) name.textContent = inc.hospital ? inc.hospital.name : inc.claimed_by_hospital_name;
    if (sub) sub.textContent = `${inc.ambulance_unit || "Ambulance"} dispatched · ETA ${inc.eta_minutes != null ? inc.eta_minutes : "~10"} min`;
  }

  // ================= Boot =================
  window.AccidioxRider = { trackIncident, mergeProfileContact };

  document.addEventListener("DOMContentLoaded", () => {
    renderProfileCard();
    poll(); // resume tracking if a crash is still in progress
  });
  window.addEventListener("accidiox:user", renderProfileCard);
})();
