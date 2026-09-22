// Rider account features layered on top of app.js:
//  - Settings: medical profile card and emergency history
//  - Emergency contact from the profile kept as the primary SOS contact
//  - Live "help is on the way" card + system notifications after a crash:
//    which hospital accepted, which ambulance, ETA, ambulance on the map.
(function () {
  const S = window.AccidioxSession;
  const POLL_MS = 4000;
  const STEPS = [
    ["COMING", "Accepted"],
    ["EN_ROUTE", "En route"],
    ["AT_SCENE", "Arrived"],
    ["PICKED_UP", "To hospital"],
    ["ADMITTED", "Admitted"]
  ];
  const DISMISS_KEY = "accidiox.rider.dismissedIncident";
  // Phases in which the rider can still call off the ambulance.
  const CANCELLABLE = ["UNCLAIMED", "HOSPITAL", "COMING", "EN_ROUTE"];
  const CONDITION_TEXT = { fine: "I'm fine", minor: "Minor injuries", hurt: "I'm hurt", false_alarm: "False alarm" };
  const TREATMENT_TEXT = { clinic: "Treated at a nearby clinic / medical shop", helped: "People nearby helped me", hospital: "Going to a hospital myself", none: "No treatment yet", not_needed: "Not needed" };

  const track = { id: null, timer: null, lastPhase: null, incident: null, fitted: false };
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
  function parseTs(ts) {
    const m = String(ts || "").match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;
  }
  function fmtKm(km) {
    const n = Number(km);
    if (!isFinite(n)) return "";
    return n < 10 ? `${n.toFixed(1)} km` : `${Math.round(n)} km`;
  }

  // The rider-facing phase of an incident. "HOSPITAL" = a hospital accepted
  // but its ambulance crew hasn't accepted yet.
  function phaseOf(inc) {
    const s = inc.dispatch_status;
    if (s === "UNCLAIMED") return "UNCLAIMED";
    if (s === "DISPATCHED") return inc.assignment_status === "ACCEPTED" ? "COMING" : "HOSPITAL";
    return s;
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
      <button class="test-call-btn" type="button" id="btnTestCall">${svg(ICON.phone)}<span>Test emergency call to ${esc(p.emergency_name || "my contact")}</span></button>
      <div class="test-call-result" id="testCallResult" hidden></div>
      <div class="profile-actions">
        <a class="btn btn-secondary" href="onboarding.html?edit=1">${svg(ICON.edit)}<span>Edit medical profile</span></a>
        <button class="btn btn-danger-outline" type="button" id="btnSignOut">${svg(ICON.out)}<span>Sign out</span></button>
      </div>`;
    $("btnTestCall").addEventListener("click", testCall);
    $("btnSignOut").addEventListener("click", () => {
      if (confirm("Sign out of Accidiox? Crash alerts won't reach hospitals until you sign in again.")) S.logout("rider");
    });
  }

  // Rings the emergency contact with a clearly-labelled test message, so the
  // rider (or admin) can confirm calls work without faking a crash.
  async function testCall() {
    const btn = $("btnTestCall");
    const out = $("testCallResult");
    const p = profile() || {};
    if (!confirm(`Place a real test call to ${p.emergency_name || "your emergency contact"} now? They'll hear a short message saying it's only a test.`)) return;
    btn.disabled = true;
    out.hidden = false;
    out.className = "test-call-result";
    out.textContent = "Placing the call…";
    try {
      const { ok, data } = await S.api("rider", "api/rider.php?action=test_call", { method: "POST", body: {} });
      out.className = `test-call-result ${ok ? "ok" : "bad"}`;
      out.textContent = ok
        ? `Calling ${data.name} (${data.phone}). Their phone should ring in a few seconds.`
        : `The call didn't go through. ${data.message || ""}`;
    } catch (e) {
      out.className = "test-call-result bad";
      out.textContent = "No connection. Try again when you're online.";
    }
    btn.disabled = false;
  }

  // Shows whether the automatic emergency call reached each contact, on the
  // "SOS sent" screen (called from app.js once Twilio answers).
  function showCallResults(data) {
    const modal = $("sosSentModal");
    if (!modal) return;
    let box = $("sosCallResults");
    if (!box) {
      box = document.createElement("div");
      box.id = "sosCallResults";
      box.className = "sos-call-results";
      const anchor = $("sosSentContactsList");
      anchor.parentNode.insertBefore(box, anchor);
    }
    const rows = (data && data.results) || [];
    if (!rows.length) {
      box.innerHTML = `<div class="sos-call-row bad">${svg(ICON.phone)}<span>Automatic call not placed: ${esc((data && data.message) || "voice calls aren't set up")}</span></div>`;
      return;
    }
    box.innerHTML = rows.map((r) => `
      <div class="sos-call-row ${r.called ? "ok" : "bad"}">${svg(ICON.phone)}
        <span><strong>${esc(r.name)}</strong> ${r.called ? "is being called now" : `couldn't be called: ${esc(r.detail)}`}</span>
      </div>`).join("");
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

  // ================= Emergency history (Settings) =================
  let historyLimit = 5;
  async function loadHistory() {
    const list = $("historyList");
    if (!list || !S.token("rider")) return;
    try {
      const { ok, data } = await S.api("rider", "api/rider.php?action=history");
      if (!ok) return;
      renderHistory(data.history || []);
    } catch (e) {
      if (!list.children.length || list.textContent.includes("Loading")) list.innerHTML = `<div class="history-empty">Connect to the internet to see your history.</div>`;
    }
  }

  function renderHistory(items) {
    const list = $("historyList");
    if (!items.length) {
      list.innerHTML = `<div class="history-empty">No emergencies yet. Ride safe. If you ever crash, every step of your rescue will be saved here.</div>`;
      return;
    }
    const statusText = { UNCLAIMED: ["Finding help", "open"], HOSPITAL: ["Assigning ambulance", "moving"], COMING: ["Ambulance coming", "moving"],
      EN_ROUTE: ["Ambulance coming", "moving"], AT_SCENE: ["Ambulance arrived", "moving"], PICKED_UP: ["To hospital", "moving"], ADMITTED: ["Admitted", ""], CANCELLED: ["Cancelled · safe", ""] };
    const labels = { REPORTED: "Crash detected", ALERTED: "Nearest hospitals alerted", DISPATCHED: "Hospital accepted", ACCEPTED: "Ambulance crew accepted",
      EN_ROUTE: "Ambulance on the way", AT_SCENE: "Ambulance arrived", PICKED_UP: "Picked up", ADMITTED: "Admitted", CANCELLED: "You cancelled: you were safe", CALLED: "Emergency contact called" };

    list.innerHTML = items.slice(0, historyLimit).map((inc) => {
      const phase = phaseOf(inc);
      const [label, cls] = statusText[phase] || [phase, ""];
      const when = parseTs(inc.created_at);
      const date = when ? when.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
      const time = when ? when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
      const hosp = inc.hospital ? inc.hospital.name : null;
      const facts = phase === "CANCELLED"
        ? [
            ["How you were", CONDITION_TEXT[inc.cancel_condition] || "—"],
            ["Treatment", TREATMENT_TEXT[inc.cancel_treatment] || "—"],
            [inc.cancelled_by === "support" ? "Closed by support" : "Cancelled at", inc.cancelled_at ? parseTs(inc.cancelled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"],
            ["Hospital", hosp || "Not assigned"]
          ]
        : [
            ["Hospital", hosp || "Not assigned"],
            ["Ambulance", inc.ambulance_unit ? `${inc.ambulance_unit}${inc.ambulance_type ? ` · ${inc.ambulance_type}` : ""}` : "—"],
            ["Crew", inc.driver_name || "—"],
            ["Admitted", inc.admitted_at ? parseTs(inc.admitted_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"]
          ];
      const steps = (inc.timeline || []).map((e) => {
        const t = parseTs(e.at);
        return `<li><time>${t ? t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : ""}</time><span>${esc(e.status === "CANCELLED" && e.actor_type === "support" ? "Accidiox support confirmed you're safe" : (labels[e.status] || e.status))}</span></li>`;
      }).join("");
      return `
        <details class="history-item">
          <summary>
            <span class="history-icon ${cls}">${svg(phase === "ADMITTED" ? ICON.hosp : ICON.amb)}</span>
            <span class="history-main">
              <strong>${esc(hosp || inc.location_name || "Emergency")}</strong>
              <span>${esc(date)} · ${esc(time)} · ${esc(inc.location_name || "")}</span>
            </span>
            <span class="history-status ${cls}">${esc(label)}</span>
          </summary>
          <div class="history-body">
            <div class="history-facts">${facts.map(([k, v]) => `<div><span>${k}</span><strong>${esc(v)}</strong></div>`).join("")}</div>
            ${steps ? `<ol class="history-timeline">${steps}</ol>` : ""}
          </div>
        </details>`;
    }).join("") + (items.length > historyLimit ? `<button type="button" class="history-more" id="btnHistoryMore">Show ${items.length - historyLimit} more</button>` : "");

    const more = $("btnHistoryMore");
    if (more) more.addEventListener("click", () => { historyLimit += 10; renderHistory(items); });
  }

  // ================= Rescue tracking =================
  function trackIncident(id, alerted) {
    track.id = id;
    track.lastPhase = "UNCLAIMED";
    track.fitted = false;
    try { localStorage.removeItem(DISMISS_KEY); } catch (e) {}
    renderRescue({ id, dispatch_status: "UNCLAIMED", alerted_hospitals: (alerted || []).map((a, i) => ({ name: a.name, distance_km: a.distance_km, rank: i + 1 })) });
    startPolling();
  }

  function startPolling() {
    clearInterval(track.timer);
    track.timer = setInterval(poll, POLL_MS);
    poll();
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
      if (String(inc.id) === dismissed) return;
      if (!track.id) {
        // Resuming after the app was reopened.
        track.id = inc.id;
        track.lastPhase = phaseOf(inc);
        if (!track.timer) track.timer = setInterval(poll, POLL_MS);
      }

      const phase = phaseOf(inc);
      if (track.lastPhase && track.lastPhase !== phase) announce(inc, phase);
      track.lastPhase = phase;
      track.incident = inc;
      renderRescue(inc);
      updateMap(inc);
      updateSosModal(inc);
      if (phase === "ADMITTED" || phase === "CANCELLED") {
        clearInterval(track.timer);
        track.timer = null;
      }
    } catch (e) { /* offline: keep the last known state on screen */ }
  }

  // System notification (with the Accidiox badge) + voice for every stage.
  function announce(inc, phase) {
    const hosp = inc.hospital ? inc.hospital.short_name : inc.claimed_by_hospital_name || "The hospital";
    const eta = inc.eta_minutes != null ? inc.eta_minutes : null;
    const msg = {
      HOSPITAL: [`${hosp} accepted your emergency`, "An ambulance crew is being assigned right now."],
      COMING: ["The ambulance is on its way", `${inc.ambulance_unit || "An ambulance"} from ${hosp}${eta ? ` is arriving in about ${eta} min` : " is heading to you"}. Stay where you are.`],
      EN_ROUTE: ["The ambulance is arriving", `${inc.ambulance_unit || "The ambulance"} is on the road${eta ? `, about ${eta} min away` : ""}.`],
      AT_SCENE: ["The ambulance has arrived", `The ${hosp} crew is at your location.`],
      PICKED_UP: [`On the way to ${hosp}`, "The emergency team has been told you're coming."],
      ADMITTED: [`Admitted to ${hosp}`, "You're in the emergency department. Get well soon."]
    }[phase];
    if (!msg) return;

    if (typeof speakVoice === "function") speakVoice(`${msg[0]}. ${msg[1]}`);
    if ("vibrate" in navigator) navigator.vibrate([250, 120, 250]);
    showSystemNotification(msg[0], msg[1], inc.id, phase === "COMING");
  }

  function showSystemNotification(title, body, incidentId, sticky) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const options = {
      body,
      icon: "assets/icons/icon-192.png",
      badge: "assets/icons/badge-96.png",
      tag: `incident-${incidentId}`,
      renotify: true,
      requireInteraction: !!sticky,
      vibrate: [250, 120, 250],
      data: { url: "index.html" }
    };
    const fallback = () => { try { new Notification(title, options); } catch (e) {} };
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, options)).catch(fallback);
    } else {
      fallback();
    }
  }

  function renderRescueBody(inc) {
    const card = $("rescueCard");
    if (!card) return;
    const phase = phaseOf(inc);
    const stepIdx = STEPS.findIndex(([s]) => s === phase || (phase === "DISPATCHED" && s === "COMING"));
    card.hidden = false;
    card.className = `card rescue-card ${phase === "UNCLAIMED" || phase === "HOSPITAL" ? "is-waiting" : phase === "ADMITTED" ? "is-done" : "is-coming"}`;

    if (phase === "UNCLAIMED") {
      const list = (inc.alerted_hospitals || []).map((h) => `
        <li><span class="rescue-rank">${h.rank}</span><span class="rescue-hname">${esc(h.name)}</span><span class="rescue-dist">${fmtKm(h.distance_km)}</span></li>`).join("");
      card.innerHTML = `
        <div class="rescue-top">
          <span class="rescue-icon pulse">${svg(ICON.radio)}</span>
          <div class="rescue-head-text">
            <div class="rescue-eyebrow">SOS sent · stay where you are</div>
            <h3>Finding the nearest ambulance</h3>
          </div>
        </div>
        <p class="rescue-text">Your location and blood group were sent to the nearest hospitals. The first one to accept will send an ambulance.</p>
        ${list ? `<ol class="rescue-hospitals">${list}</ol>` : ""}`;
      return;
    }

    const hosp = inc.hospital ? inc.hospital.short_name : inc.claimed_by_hospital_name || "Hospital";
    if (phase === "HOSPITAL") {
      card.innerHTML = `
        <div class="rescue-top">
          <span class="rescue-icon pulse">${svg(ICON.hosp)}</span>
          <div class="rescue-head-text">
            <div class="rescue-eyebrow">${esc(hosp)} accepted</div>
            <h3>Assigning an ambulance</h3>
          </div>
        </div>
        <p class="rescue-text">The hospital has taken your case and is confirming an ambulance crew. This takes less than a minute.</p>`;
      return;
    }

    const headline = { COMING: "Help is on the way", EN_ROUTE: "The ambulance is arriving", AT_SCENE: "Ambulance has arrived",
      PICKED_UP: `On the way to ${hosp}`, ADMITTED: `Admitted to ${hosp}` }[phase] || "Help is on the way";
    const coming = phase === "COMING" || phase === "EN_ROUTE";
    const crewPhone = String(inc.driver_phone || "").replace(/[^\d+]/g, "");

    card.innerHTML = `
      <div class="rescue-top">
        <span class="rescue-icon">${svg(phase === "ADMITTED" ? ICON.check : ICON.amb)}</span>
        <div class="rescue-head-text">
          <div class="rescue-eyebrow">${esc(hosp)}</div>
          <h3>${esc(headline)}</h3>
        </div>
        ${coming ? `<div class="rescue-eta"><strong>${inc.eta_minutes != null ? inc.eta_minutes : "—"}</strong><span>min</span></div>` : ""}
        ${phase === "ADMITTED" ? `<button class="rescue-close" type="button" id="btnDismissRescue" aria-label="Dismiss">${svg(ICON.x)}</button>` : ""}
      </div>

      <div class="rescue-steps">
        ${STEPS.map(([s, label], i) => `<div class="rescue-step ${i < stepIdx || (i === stepIdx && phase === "ADMITTED") ? "done" : i === stepIdx ? "current" : ""}"><i></i><span>${label}</span></div>`).join("")}
      </div>

      ${phase !== "ADMITTED" ? `
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
        : phase === "AT_SCENE" ? "The crew is with you now."
        : phase === "PICKED_UP" ? "The emergency department has been told you're coming."
        : "Your family has been kept informed. You can find this rescue anytime in Settings → My Emergencies."}</p>`;

    const dismiss = $("btnDismissRescue");
    if (dismiss) dismiss.addEventListener("click", () => {
      card.hidden = true;
      card.innerHTML = "";
      try { localStorage.setItem(DISMISS_KEY, String(inc.id)); } catch (e) {}
      clearInterval(track.timer);
      track.timer = null;
      track.id = null;
      removeMapLayers();
      loadHistory();
    });
  }

  function renderRescue(inc) {
    const phase = phaseOf(inc);
    if (phase === "CANCELLED") return renderCancelled(inc);
    renderRescueBody(inc);
    // Until the crew reaches the rider, they can call off the ambulance
    // (e.g. a nearby clinic or medical shop already helped them).
    if (CANCELLABLE.includes(phase) && inc.id) {
      const card = $("rescueCard");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "rescue-safe-btn";
      btn.innerHTML = `${svg(ICON.check)}<span>I'm safe, cancel help</span>`;
      btn.addEventListener("click", () => openCancelSheet(inc));
      card.appendChild(btn);
    }
  }

  function renderCancelled(inc) {
    const card = $("rescueCard");
    card.hidden = false;
    card.className = "card rescue-card is-done";
    card.innerHTML = `
      <div class="rescue-top">
        <span class="rescue-icon">${svg(ICON.check)}</span>
        <div class="rescue-head-text">
          <div class="rescue-eyebrow">${inc.cancelled_by === "support" ? "Closed by Accidiox support" : "Request cancelled"}</div>
          <h3>Glad you're safe</h3>
        </div>
        <button class="rescue-close" type="button" id="btnDismissRescue" aria-label="Dismiss">${svg(ICON.x)}</button>
      </div>
      <div class="rescue-answers">
        <div><span>How you were</span><strong>${esc(CONDITION_TEXT[inc.cancel_condition] || "—")}</strong></div>
        <div><span>Treatment</span><strong>${esc(TREATMENT_TEXT[inc.cancel_treatment] || "—")}</strong></div>
      </div>
      <p class="rescue-text">${inc.cancelled_by === "support" ? "Our support team confirmed with you that you're safe, so we" : "We've"} stopped searching and freed the ambulance for the next emergency. If you start feeling unwell, call 108 right away. This is saved in Settings → My Emergencies.</p>`;
    $("btnDismissRescue").addEventListener("click", () => {
      card.hidden = true;
      card.innerHTML = "";
      try { localStorage.setItem(DISMISS_KEY, String(inc.id)); } catch (e) {}
      clearInterval(track.timer);
      track.timer = null;
      track.id = null;
      removeMapLayers();
      loadHistory();
    });
  }

  // "Are you fine?" + "Have you got medical treatment?" before cancelling.
  function openCancelSheet(inc) {
    const answers = { condition: null, treatment: null };
    const wrap = document.createElement("div");
    wrap.className = "safe-sheet-backdrop";
    wrap.innerHTML = `
      <div class="safe-sheet" role="dialog" aria-modal="true" aria-labelledby="safeTitle">
        <div class="safe-grip"></div>
        <h3 id="safeTitle">Cancel the ambulance?</h3>
        <p class="safe-lead">Only if you've already got help. Two quick questions so the hospital knows you're okay.</p>

        <div class="safe-q">1. Are you fine?</div>
        <div class="safe-options" data-q="condition">
          <button type="button" data-v="fine">Yes, I'm fine</button>
          <button type="button" data-v="minor">Minor injuries</button>
          <button type="button" data-v="hurt">I'm hurt</button>
        </div>

        <div class="safe-q">2. Have you got medical treatment?</div>
        <div class="safe-options stack" data-q="treatment">
          <button type="button" data-v="clinic">Yes, at a nearby clinic / medical shop</button>
          <button type="button" data-v="helped">People nearby helped me</button>
          <button type="button" data-v="hospital">I'm going to a hospital myself</button>
          <button type="button" data-v="none">No, not yet</button>
        </div>

        <div class="safe-warn" hidden>You said you're hurt and haven't been treated. We'll keep the ambulance coming. It's the safest choice.</div>
        <div class="safe-error" hidden></div>

        <div class="safe-actions">
          <button type="button" class="btn btn-secondary" data-act="keep">Keep help coming</button>
          <button type="button" class="btn btn-danger-solid" data-act="cancel" disabled>Cancel ambulance</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add("show"));

    const confirmBtn = wrap.querySelector('[data-act="cancel"]');
    const warn = wrap.querySelector(".safe-warn");
    const errBox = wrap.querySelector(".safe-error");
    const close = () => { wrap.classList.remove("show"); setTimeout(() => wrap.remove(), 200); };
    const update = () => {
      const blocked = answers.condition === "hurt" && answers.treatment === "none";
      warn.hidden = !blocked;
      confirmBtn.disabled = !answers.condition || !answers.treatment || blocked;
    };

    wrap.addEventListener("click", async (e) => {
      if (e.target === wrap) return close();
      const opt = e.target.closest(".safe-options [data-v]");
      if (opt) {
        const q = opt.parentElement.dataset.q;
        answers[q] = opt.dataset.v;
        opt.parentElement.querySelectorAll("[data-v]").forEach((b) => b.classList.toggle("active", b === opt));
        errBox.hidden = true;
        return update();
      }
      const act = e.target.closest("[data-act]");
      if (!act) return;
      if (act.dataset.act === "keep") return close();

      confirmBtn.disabled = true;
      confirmBtn.textContent = "Cancelling…";
      try {
        const { ok, data } = await S.api("rider", "api/rider.php?action=cancel_incident", {
          method: "POST",
          body: { incident_id: inc.id, condition: answers.condition, treatment: answers.treatment }
        });
        if (!ok) {
          errBox.textContent = data.message || "Couldn't cancel. The ambulance is still coming.";
          errBox.hidden = false;
          confirmBtn.textContent = "Cancel ambulance";
          update();
          return;
        }
        close();
        track.lastPhase = "CANCELLED";
        clearInterval(track.timer);
        track.timer = null;
        removeMapLayers();
        renderCancelled(data.incident);
        if (typeof speakVoice === "function") speakVoice("Request cancelled. Glad you're safe.");
        loadHistory();
      } catch (err) {
        errBox.textContent = "No connection, so the ambulance is still coming. Try again in a moment.";
        errBox.hidden = false;
        confirmBtn.textContent = "Cancel ambulance";
        update();
      }
    });
  }

  // Ambulance + destination hospital on the home mini-map.
  function updateMap(inc) {
    if (typeof liveMap === "undefined" || !liveMap || typeof L === "undefined") return;
    const phase = phaseOf(inc);
    if (["ADMITTED", "UNCLAIMED", "HOSPITAL", "CANCELLED"].includes(phase)) { removeMapLayers(); return; }

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
    if (sub) sub.textContent = phaseOf(inc) === "HOSPITAL"
      ? "Accepted your emergency · assigning an ambulance"
      : `${inc.ambulance_unit || "Ambulance"} on the way · ETA ${inc.eta_minutes != null ? inc.eta_minutes : "~10"} min`;
  }

  // ================= Boot =================
  window.AccidioxRider = { trackIncident, mergeProfileContact, showCallResults };

  document.addEventListener("DOMContentLoaded", () => {
    renderProfileCard();
    poll(); // resume tracking if a crash is still in progress
    const navSettings = $("navSettings");
    if (navSettings) navSettings.addEventListener("click", loadHistory);
    loadHistory();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && track.id) poll();
  });
  window.addEventListener("accidiox:user", renderProfileCard);
})();
