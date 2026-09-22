// Accidiox Crew — ambulance app controller.
// On duty: streams GPS to the dispatch grid, rings on a new assignment,
// shows the patient's blood group / allergies, and lets the crew move the
// case through En route -> At scene -> Patient picked up.
(function () {
  const S = window.AccidioxSession;
  const ROLE = "ambulance";
  const user = S.guard(ROLE);
  if (!user) return;

  const API = "api/ambulance_api.php";
  // Last server state, so a reload redraws the same screen instantly
  // (like reopening a native app) before the fresh data arrives.
  const CACHE_KEY = `accidiox.crew.lastState.${user.id}`;
  const POLL_MS = 4000;
  const SEND_EVERY_MS = 5000;

  const STAGES = [
    ["DISPATCHED", "Dispatched"],
    ["EN_ROUTE", "En route"],
    ["AT_SCENE", "At scene"],
    ["PICKED_UP", "To hospital"]
  ];
  const NEXT = {
    DISPATCHED: ["EN_ROUTE", "Start trip", "go"],
    EN_ROUTE: ["AT_SCENE", "Arrived at scene", ""],
    AT_SCENE: ["PICKED_UP", "Patient picked up", ""]
  };

  const state = {
    data: null,
    onDuty: false,
    gps: null,          // { lat, lon, speed, at }
    lastSentAt: 0,
    watchId: null,
    wakeLock: null,
    seenAssignment: null,
    hadAssignment: false,
    fittedFor: null,
    busy: false
  };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ================= Map =================
  let map = null, meMarker = null, crashMarker = null, hospMarker = null, line = null;

  function initMap() {
    map = L.map("jobMap", { zoomControl: false, attributionControl: true }).setView([25.28, 82.99], 14);
    const esri = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas";
    L.tileLayer(`${esri}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 19, maxNativeZoom: 16, attribution: "Tiles &copy; Esri" }).addTo(map);
    L.tileLayer(`${esri}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 19, maxNativeZoom: 16 }).addTo(map);
    map.attributionControl.setPrefix(false);
  }

  function divIcon(html, size) {
    return L.divIcon({ className: "", html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
  }

  function renderMap(job) {
    if (!map) return;
    const me = myPosition();
    const target = targetOf(job);
    const crash = [job.latitude, job.longitude];

    if (!crashMarker) crashMarker = L.marker(crash, { icon: divIcon('<div class="mk-crash"></div>', 20) }).addTo(map);
    else crashMarker.setLatLng(crash);

    if (job.hospital) {
      const h = [job.hospital.latitude, job.hospital.longitude];
      if (!hospMarker) hospMarker = L.marker(h, { icon: divIcon('<div class="mk-hosp">+</div>', 24) }).addTo(map);
      else hospMarker.setLatLng(h);
    }

    if (me) {
      if (!meMarker) meMarker = L.marker(me, { icon: divIcon('<div class="mk-me"><svg viewBox="0 0 24 24"><use href="#i-ambulance"/></svg></div>', 26), zIndexOffset: 1000 }).addTo(map);
      else meMarker.setLatLng(me);
    }

    if (line) { line.remove(); line = null; }
    if (me && target) {
      line = L.polyline([me, target.latlng], { color: job.dispatch_status === "PICKED_UP" ? "#4f8cff" : "#f2555a", weight: 4, dashArray: "2 9", lineCap: "round" }).addTo(map);
    }

    const fitKey = `${job.id}|${job.dispatch_status === "PICKED_UP"}`;
    if (state.fittedFor !== fitKey) {
      const pts = [crash];
      if (me) pts.push(me);
      if (target) pts.push(target.latlng);
      setTimeout(() => {
        map.invalidateSize();
        map.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 16 });
      }, 60);
      state.fittedFor = fitKey;
    }
  }

  function clearMap() {
    [meMarker, crashMarker, hospMarker, line].forEach((l) => l && l.remove());
    meMarker = crashMarker = hospMarker = line = null;
    state.fittedFor = null;
  }

  // ================= Geo =================
  function haversineKm(a, b) {
    const R = 6371, r = (d) => (d * Math.PI) / 180;
    const x = Math.sin(r(b[0] - a[0]) / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(r(b[1] - a[1]) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  function myPosition() {
    if (state.gps) return [state.gps.lat, state.gps.lon];
    const h = state.data && state.data.hospital;
    return h ? [Number(h.latitude), Number(h.longitude)] : null;
  }

  function targetOf(job) {
    if (!job) return null;
    if (job.dispatch_status === "PICKED_UP" && job.hospital) {
      return { latlng: [job.hospital.latitude, job.hospital.longitude], label: job.hospital.name };
    }
    if (job.dispatch_status === "AT_SCENE") return null;
    return { latlng: [job.latitude, job.longitude], label: job.location_name };
  }

  // ================= GPS =================
  function startGps() {
    stopGps();
    if (!("geolocation" in navigator)) return setDutySub("warn", "GPS not available on this device");
    state.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        state.gps = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          speed: pos.coords.speed != null ? Math.max(0, pos.coords.speed * 3.6) : 0,
          at: Date.now()
        };
        maybeSend();
      },
      () => setDutySub("warn", "Location permission needed to share your position"),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
  }

  function stopGps() {
    if (state.watchId != null) navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
  }

  async function maybeSend(force) {
    if (!state.onDuty || !state.gps) return;
    if (!force && Date.now() - state.lastSentAt < SEND_EVERY_MS) return;
    state.lastSentAt = Date.now();
    try {
      await S.api(ROLE, `${API}?action=location`, {
        method: "POST",
        body: { latitude: state.gps.lat, longitude: state.gps.lon, speed_kmh: Math.round(state.gps.speed) }
      });
      updateDutyCard();
    } catch (e) { /* retry on next fix */ }
  }

  // ================= Duty =================
  async function setDuty(on) {
    const { ok, data } = await S.api(ROLE, `${API}?action=set_duty`, { method: "POST", body: { on_duty: on } });
    if (!ok) return toast(data.message || "Couldn't change duty status.");
    state.onDuty = on;
    if (on) {
      startGps();
      requestWakeLock();
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
      unlockAudio();
    } else {
      stopGps();
      releaseWakeLock();
    }
    updateDutyCard();
    refresh();
  }

  function setDutySub(kind, text) {
    const sub = $("dutySub");
    sub.innerHTML = `${kind ? `<i class="gps-dot ${kind === "warn" ? "warn" : ""}"></i>` : ""}${esc(text)}`;
  }

  function updateDutyCard() {
    const card = $("dutyCard");
    card.classList.toggle("on", state.onDuty);
    $("dutySwitch").setAttribute("aria-checked", String(state.onDuty));
    document.body.classList.toggle("on-duty", state.onDuty);
    const job = state.data && state.data.assignment;
    $("dutyTitle").textContent = state.onDuty ? (job ? "On a case" : "On duty · available") : "Off duty";
    if (!state.onDuty) return setDutySub("", "Go on duty to receive dispatches");
    if (!state.gps) return setDutySub("warn", "Waiting for GPS fix…");
    const age = Math.max(0, Math.round((Date.now() - state.lastSentAt) / 1000));
    setDutySub("ok", `Sharing live location · ${state.lastSentAt ? `${age}s ago` : "starting"}`);
  }

  async function requestWakeLock() {
    try { if ("wakeLock" in navigator) state.wakeLock = await navigator.wakeLock.request("screen"); } catch (e) {}
  }
  function releaseWakeLock() {
    try { if (state.wakeLock) state.wakeLock.release(); } catch (e) {}
    state.wakeLock = null;
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.onDuty) requestWakeLock();
  });

  // ================= Data =================
  async function refresh() {
    try {
      const { ok, data } = await S.api(ROLE, `${API}?action=me`);
      if (!ok) return;
      const firstLoad = !state.data || state.fromCache;
      state.data = data;
      state.fromCache = false;
      state.fetchedAt = Date.now();
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) {}
      if (firstLoad) {
        state.onDuty = data.unit.status !== "offline";
        if (state.onDuty) startGps();
      }
      render();
    } catch (e) {
      setDutySub("warn", "Offline · retrying");
    }
  }

  function render() {
    const d = state.data;
    $("unitCode").textContent = d.unit.unit_code;
    $("unitType").textContent = d.unit.unit_type;
    $("hospitalName").textContent = d.hospital ? d.hospital.short_name : "";
    $("crewName").textContent = d.crew.name;
    $("crewEmail").textContent = d.crew.email;
    $("statDone").textContent = d.completed_today;
    $("statVehicle").textContent = d.unit.vehicle_number || "—";
    updateDutyCard();

    // Not approved yet: no duty, no cases, no patient data.
    const sw = $("dutySwitch");
    sw.disabled = !d.unit.approved;
    if (!d.unit.approved) {
      stopGps();
      state.onDuty = false;
      updateDutyCard();
      setDutySub("warn", "Waiting for your hospital to approve this unit");
      $("idleView").hidden = false;
      $("jobView").hidden = true;
      $("jobActions").hidden = true;
      $("idleTitle").textContent = "Waiting for approval";
      $("idleText").textContent = `${d.hospital ? d.hospital.short_name : "Your hospital"} needs to approve ${d.unit.unit_code} before you can go on duty. This screen updates by itself.`;
      return;
    }

    const job = d.assignment;
    const pending = job && job.assignment_status === "PENDING";
    const key = job ? `${job.id}|${job.assigned_at}` : null;
    if (pending && key !== state.seenAssignment) {
      state.seenAssignment = key;
      ring(job);
    }
    if (!pending) stopRinging();
    if (!job && state.hadAssignment) {
      toast(state.hadAssignment === "PENDING"
        ? "The dispatch expired, so your hospital is sending another unit."
        : "Case closed. Patient admitted to the emergency department.");
    }
    state.hadAssignment = job ? job.assignment_status : false;

    $("idleView").hidden = !!job;
    $("jobView").hidden = !job;
    $("jobActions").hidden = !job;

    if (!job) {
      clearMap();
      $("idleTitle").textContent = state.onDuty ? "Waiting for dispatch" : "You're off duty";
      $("idleText").textContent = state.onDuty
        ? "Keep this screen open. When your hospital accepts a crash, it rings here with the patient's details."
        : "Switch on duty and keep this screen open. New emergencies will ring here.";
      return;
    }
    renderJob(job);
  }

  function renderJob(job) {
    const status = job.dispatch_status;
    const hosp = job.hospital ? job.hospital.short_name : "your hospital";
    const code = `INC-${String(job.id).padStart(4, "0").slice(-4)}`;
    const pending = job.assignment_status === "PENDING";
    const banner = pending
      ? ["new", "alert", `New emergency · ${code}`, `${hosp} is sending you. Accept within ${secondsLeft(job)} s.`]
      : ({
          DISPATCHED: ["", "ambulance", `Accepted · ${code}`, `Tap Start trip when you're rolling.`],
          EN_ROUTE: ["", "nav", "En route to crash site", `${code} · lights and siren`],
          AT_SCENE: ["", "pin", "On scene", "Stabilise the patient, then mark picked up"],
          PICKED_UP: ["", "building", `Transporting to ${hosp}`, "The emergency department is expecting you"]
        }[status] || ["", "ambulance", code, ""]);
    const b = $("jobBanner");
    b.className = `job-banner ${banner[0]}`;
    b.innerHTML = `<svg class="ic"><use href="#i-${banner[1]}"/></svg><div><strong>${esc(banner[2])}</strong><span>${esc(banner[3])}</span></div>`;

    // Patient
    $("patientName").textContent = job.rider_name || "Unknown rider";
    $("patientVehicle").textContent = job.vehicle_number || "";
    $("patientBlood").querySelector("strong").textContent = job.blood_group || "?";
    const med = $("patientMedical");
    med.hidden = !job.medical_notes;
    if (job.medical_notes) med.querySelector("span").textContent = job.medical_notes;
    const contact = $("patientContact");
    const contactPhone = String(job.emergency_contact || "").match(/\+?\d[\d\s-]{8,}/);
    contact.hidden = !job.emergency_contact;
    if (job.emergency_contact) {
      contact.querySelector("span").textContent = `Family: ${job.emergency_contact}`;
      if (contactPhone) contact.href = `tel:${contactPhone[0].replace(/[\s-]/g, "")}`;
    }

    // Steps
    const idx = STAGES.findIndex(([s]) => s === status);
    $("jobSteps").innerHTML = STAGES.map(([s, label], i) =>
      `<div class="step ${i < idx ? "done" : i === idx ? "current" : ""}"><i></i><span>${label}</span></div>`).join("");

    // Actions: Accept / Decline first, then the stage buttons.
    const next = pending ? ["ACCEPT", "Accept case", "go"] : NEXT[status];
    const btn = $("btnNext");
    const nav = $("btnNavigate");
    $("btnDecline").hidden = !pending;
    nav.hidden = pending;
    if (next) {
      btn.hidden = false;
      btn.className = `btn btn-primary ${next[2]}`;
      btn.querySelector("span").textContent = next[1];
      btn.dataset.next = next[0];
      btn.disabled = false;
    } else {
      btn.hidden = true;
    }
    const target = targetOf(job) || { latlng: [job.latitude, job.longitude] };
    nav.href = `https://www.google.com/maps/dir/?api=1&destination=${target.latlng[0]},${target.latlng[1]}&travelmode=driving`;
    nav.classList.toggle("wide", !next);
    nav.querySelector("span").textContent = status === "PICKED_UP" ? `Navigate to ${hosp}` : "Navigate";
    $("jobActions").style.gridTemplateColumns = next ? "1fr 2fr" : "1fr";

    renderJobLive(job);
  }

  // Distance / ETA / map: refreshed on every GPS tick too.
  function renderJobLive(job) {
    const status = job.dispatch_status;
    const toHospital = status === "PICKED_UP";
    $("placeEyebrow").textContent = toHospital ? "Destination · emergency entrance" : "Crash site";
    $("placeName").textContent = toHospital && job.hospital ? job.hospital.name : (job.location_name || "Pinned location");

    const me = myPosition();
    const target = targetOf(job);
    const km = me && target ? haversineKm(me, target.latlng) : 0;
    $("placeDist").textContent = status === "AT_SCENE" ? "0 km" : km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
    const eta = toHospital ? Math.max(1, Math.round(((km * 1.35) / 32) * 60)) : job.eta_minutes;
    $("placeEta").textContent = status === "AT_SCENE" ? "Here" : eta != null ? `${eta} min` : "—";
    $("placeImpact").textContent = job.impact_g ? String(job.impact_g).split(" ")[0] + "g" : `${Math.round(job.tilt_angle)}°`;
    renderMap(job);
  }

  async function advance() {
    const btn = $("btnNext");
    const next = btn.dataset.next;
    if (!next || state.busy) return;
    state.busy = true;
    btn.disabled = true;
    try {
      const accept = next === "ACCEPT";
      const { ok, data } = accept
        ? await S.api(ROLE, `${API}?action=accept`, { method: "POST", body: {} })
        : await S.api(ROLE, `${API}?action=update_status`, { method: "POST", body: { new_status: next } });
      if (!ok) {
        toast(data.message || "Couldn't update status.");
        refresh();
      } else {
        stopRinging();
        state.data.assignment = data.assignment;
        render();
        if (accept) toast("Accepted. The patient and hospital can see you're coming.");
      }
    } catch (e) {
      toast("No connection. Try again in a moment.");
    }
    state.busy = false;
    btn.disabled = false;
  }

  function secondsLeft(job) {
    const m = String(job.assigned_at || "").match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    if (!m || !state.data) return state.data ? state.data.accept_seconds : 60;
    const assigned = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
    const sm = String(state.data.server_time).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    const serverAtFetch = sm ? new Date(+sm[1], +sm[2] - 1, +sm[3], +sm[4], +sm[5], +sm[6]).getTime() : Date.now();
    const serverNow = serverAtFetch + (Date.now() - state.fetchedAt);
    return Math.max(0, Math.ceil((assigned + (state.data.accept_seconds || 60) * 1000 - serverNow) / 1000));
  }

  async function decline() {
    if (state.busy) return;
    state.busy = true;
    try {
      const { ok, data } = await S.api(ROLE, `${API}?action=decline`, { method: "POST", body: {} });
      stopRinging();
      toast(ok ? "Declined. Your hospital will send another unit." : data.message || "Couldn't decline.");
    } catch (e) {
      toast("No connection. Try again in a moment.");
    }
    state.busy = false;
    refresh();
  }

  // ================= Alerts =================
  let audioCtx = null;
  let ringTimer = null;

  function unlockAudio() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch (e) {}
  }

  function ring(job) {
    stopRinging();
    let n = 0;
    const beep = () => {
      try {
        unlockAudio();
        const t = audioCtx.currentTime;
        [0, 0.22].forEach((o, i) => {
          const osc = audioCtx.createOscillator(), g = audioCtx.createGain();
          osc.type = "square";
          osc.frequency.value = i ? 660 : 990;
          g.gain.setValueAtTime(0.0001, t + o);
          g.gain.exponentialRampToValueAtTime(0.18, t + o + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + o + 0.2);
          osc.connect(g).connect(audioCtx.destination);
          osc.start(t + o);
          osc.stop(t + o + 0.22);
        });
      } catch (e) {}
      if ("vibrate" in navigator) navigator.vibrate([400, 150, 400]);
      if (++n >= 40) stopRinging(); // rings for the whole accept window
    };
    beep();
    ringTimer = setInterval(beep, 1500);

    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(`New emergency · ${job.blood_group || ""} blood`, {
          body: `${job.rider_name || "Rider"} at ${job.location_name || "pinned location"}`,
          icon: "assets/icons/crew-icon-192.png",
          badge: "assets/icons/badge-96.png",
          tag: `job-${job.id}`
        });
      } catch (e) {}
    }
  }
  function stopRinging() {
    clearInterval(ringTimer);
    ringTimer = null;
  }

  let toastTimer = null;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 4000);
  }

  // ================= Wire up =================
  document.addEventListener("DOMContentLoaded", () => {
    initMap();

    $("dutySwitch").addEventListener("click", () => setDuty(!state.onDuty));
    $("btnNext").addEventListener("click", advance);
    $("btnDecline").addEventListener("click", decline);
    $("jobBanner").addEventListener("click", stopRinging);

    const menu = $("menu");
    $("btnMenu").addEventListener("click", (e) => {
      e.stopPropagation();
      const open = !menu.classList.contains("open");
      menu.classList.toggle("open", open);
      $("btnMenu").setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", (e) => { if (!e.target.closest(".menu-wrap")) menu.classList.remove("open"); });

    $("btnSignOut").addEventListener("click", () => {
      if (state.data && state.data.assignment) return toast("Finish the current case before signing out.");
      stopGps();
      S.logout(ROLE);
    });

    // Paint the last known screen immediately, then refresh from the server.
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
      if (cached && cached.unit) {
        state.data = cached;
        state.fromCache = true;
        state.fetchedAt = Date.now();
        state.onDuty = cached.unit.status !== "offline";
        state.seenAssignment = cached.assignment ? `${cached.assignment.id}|${cached.assignment.assigned_at}` : null;
        state.hadAssignment = cached.assignment ? cached.assignment.assignment_status : false;
        render();
      }
    } catch (e) {}
    refresh();
    setInterval(refresh, POLL_MS);
    setInterval(() => {
      updateDutyCard();
      maybeSend();
      // Live accept countdown on the banner.
      const job = state.data && state.data.assignment;
      if (job && job.assignment_status === "PENDING") {
        const span = document.querySelector("#jobBanner span");
        const left = secondsLeft(job);
        if (span) span.textContent = left > 0 ? `${job.hospital ? job.hospital.short_name : "Your hospital"} is sending you. Accept within ${left} s.` : "Time is up. Checking with your hospital…";
      }
    }, 1000);
  });
})();
