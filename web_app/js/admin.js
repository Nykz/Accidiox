// Accidiox owner console: close emergencies after support calls the rider,
// approve hospitals and ambulance crews. Talks only to api/admin_api.php.
(function () {
  const API = "api/admin_api.php";
  const TOKEN_KEY = "accidiox.admin.token";
  const $ = (id) => document.getElementById(id);
  const state = { data: null, tab: "open", resolving: null, condition: null, treatment: null, timer: null, setup: false };

  const STATUS = {
    UNCLAIMED: ["Waiting for a hospital", "red"],
    DISPATCHED: ["Hospital assigning ambulance", "amber"],
    EN_ROUTE: ["Ambulance on the way", "blue"],
    AT_SCENE: ["Ambulance at scene", "blue"],
    PICKED_UP: ["Going to hospital", "blue"],
    ADMITTED: ["Admitted", "green"],
    CANCELLED: ["Closed · safe", "green"]
  };

  function token() { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
  function setToken(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {} }

  async function api(action, body) {
    const headers = { "Content-Type": "application/json" };
    const t = token();
    if (t) headers["X-Auth-Token"] = t;
    const res = await fetch(`${API}?action=${action}`, {
      method: body === undefined ? "GET" : "POST", headers, cache: "no-store",
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (res.status === 401 && data.code === "unauthenticated") { setToken(null); showGate(); }
    return { ok: res.ok, status: res.status, data };
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  // Server times are India time without a zone.
  function parseTs(s) { return s ? new Date(String(s).replace(" ", "T") + "+05:30") : null; }
  function ago(s) {
    const d = parseTs(s);
    if (!d) return "";
    const m = Math.max(0, Math.round((Date.now() - d) / 60000));
    if (m < 1) return "just now";
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 48) return `${h} h ${m % 60} min ago`;
    return `${Math.floor(h / 24)} days ago`;
  }
  function when(s) {
    const d = parseTs(s);
    return d ? d.toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
  }
  function tel(phone, label) {
    if (!phone) return "—";
    const digits = String(phone).replace(/[^0-9+]/g, "");
    return `<a href="tel:${esc(digits.startsWith("+") ? digits : "+" + digits)}">${esc(label || phone)}</a>`;
  }
  // "Neha Tiwari · +917086249545 (Wife)" -> "+917086249545"
  function familyPhone(s) {
    const m = String(s || "").match(/\+?\d[\d\s-]{8,}\d/);
    if (!m) return null;
    const d = m[0].replace(/[^0-9]/g, "");
    return "+" + (d.length === 10 ? "91" + d : d);
  }
  function incCode(id) { return "INC-" + String(id).padStart(4, "0"); }

  let toastTimer;
  function toast(msg, err) {
    const t = $("toast");
    t.textContent = msg;
    t.className = "toast" + (err ? " err" : "");
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
  }

  // ---------- Sign in / setup ----------
  async function showGate() {
    clearInterval(state.timer);
    $("app").hidden = true;
    $("gate").hidden = false;
    let needsSetup = false;
    try { needsSetup = !!(await api("setup_status")).data.needs_setup; } catch (e) {}
    state.setup = needsSetup;
    document.querySelectorAll(".setup-only").forEach((el) => { el.hidden = !needsSetup; });
    $("gateTitle").textContent = needsSetup ? "Create the owner account" : "Sign in";
    $("gateHint").textContent = needsSetup
      ? "First-time setup. After this account is created, nobody else can create one."
      : "Only for the Accidiox owner and support team.";
    $("gateBtn").textContent = needsSetup ? "Create account" : "Sign in";
    $("fPass").autocomplete = needsSetup ? "new-password" : "current-password";
  }

  $("gateForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("gateError");
    err.hidden = true;
    const btn = $("gateBtn");
    btn.disabled = true;
    const body = { email: $("fEmail").value.trim(), password: $("fPass").value };
    if (state.setup) { body.setup_key = $("fKey").value; body.name = $("fName").value.trim(); }
    try {
      const { ok, data } = await api(state.setup ? "setup" : "login", body);
      if (!ok) throw new Error(data.message || "Something went wrong.");
      setToken(data.token);
      $("fPass").value = "";
      $("fKey").value = "";
      start();
    } catch (ex) {
      err.textContent = ex.message === "Failed to fetch" ? "No connection. Try again." : ex.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  $("btnLogout").addEventListener("click", async () => {
    try { await api("logout", {}); } catch (e) {}
    setToken(null);
    showGate();
  });

  // ---------- Console ----------
  function start() {
    $("gate").hidden = true;
    $("app").hidden = false;
    load();
    clearInterval(state.timer);
    state.timer = setInterval(() => { if (!state.resolving && !document.hidden) load(); }, 15000);
  }

  async function load() {
    try {
      const { ok, data } = await api("overview");
      if (!ok) return;
      state.data = data;
      $("updated").textContent = "Updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      $("updated").parentElement.classList.remove("off");
      render();
    } catch (e) {
      $("updated").textContent = "Offline";
      $("updated").parentElement.classList.add("off");
    }
  }

  function render() {
    const d = state.data;
    const s = d.stats;
    $("who").textContent = d.admin.name;
    $("stats").innerHTML = [
      ["Open emergencies", s.open, "Not yet admitted or closed", s.open ? "alert" : ""],
      ["Hospitals waiting", s.hospitals_pending, `${s.hospitals_verified} approved`, s.hospitals_pending ? "pending" : ""],
      ["Crews waiting", s.crews_pending, `${s.crews_on_duty} on duty now`, s.crews_pending ? "pending" : ""],
      ["Riders", s.riders, "Registered accounts", ""]
    ].map(([k, v, sub, cls]) => `<div class="stat ${cls}"><span>${k}</span><strong>${v}</strong><small>${sub}</small></div>`).join("");
    $("cOpen").textContent = s.open;
    $("cOpen").classList.toggle("hot", s.open > 0);
    $("cHosp").textContent = s.hospitals_pending;
    $("cHosp").classList.toggle("hot", s.hospitals_pending > 0);
    $("cCrew").textContent = s.crews_pending;
    $("cCrew").classList.toggle("hot", s.crews_pending > 0);

    renderOpen(d.open);
    renderHospitals(d.hospitals);
    renderCrews(d.crews);
    renderClosed(d.closed);
  }

  function renderOpen(list) {
    const el = $("panel-open");
    if (!list.length) {
      el.innerHTML = `<div class="empty">No open emergencies. Every rider is either admitted or confirmed safe.</div>`;
      return;
    }
    el.innerHTML = `<div class="list">${list.map((i) => {
      const [label, cls] = STATUS[i.status] || [i.status, ""];
      const old = (Date.now() - parseTs(i.created_at)) > 30 * 60000;
      const map = `https://www.google.com/maps?q=${i.latitude},${i.longitude}`;
      return `
        <article class="card urgent">
          <div class="card-head">
            <div>
              <div class="card-title"><span class="code">${incCode(i.id)}</span>${esc(i.rider_name || "Unknown rider")}</div>
              <div class="card-sub">${esc(i.location_name || "Location unknown")} · <a href="${map}" target="_blank" rel="noopener">Open map</a></div>
            </div>
            <div style="text-align:right">
              <span class="pill ${cls}">${esc(label)}</span>
              <div class="age ${old ? "old" : ""}">${esc(ago(i.created_at))}</div>
            </div>
          </div>
          <div class="facts">
            <div><span>Rider phone</span><strong>${tel(i.rider_phone)}</strong></div>
            <div><span>Emergency contact</span><strong>${esc(i.emergency_contact || "—")}</strong></div>
            <div><span>Blood group</span><strong>${esc(i.blood_group || "—")}</strong></div>
            <div><span>Vehicle</span><strong>${esc(i.vehicle_number || "—")}</strong></div>
            <div><span>Hospital</span><strong>${esc(i.hospital_name || "None yet")}</strong></div>
            <div><span>Ambulance</span><strong>${esc(i.unit_code || "—")}</strong></div>
            <div><span>Crash time</span><strong>${esc(when(i.created_at))}</strong></div>
            ${i.medical_notes ? `<div><span>Medical notes</span><strong>${esc(i.medical_notes)}</strong></div>` : ""}
          </div>
          <div class="card-actions">
            ${i.rider_phone ? `<a class="btn btn-ghost" href="tel:+${esc(String(i.rider_phone).replace(/[^0-9]/g, ""))}">Call rider</a>` : ""}
            ${familyPhone(i.emergency_contact) ? `<a class="btn btn-ghost" href="tel:${esc(familyPhone(i.emergency_contact))}">Call family</a>` : ""}
            <button class="btn btn-success" type="button" data-resolve="${i.id}">Mark rider safe</button>
          </div>
        </article>`;
    }).join("")}</div>`;
  }

  function renderHospitals(list) {
    const el = $("panel-hospitals");
    if (!list.length) { el.innerHTML = `<div class="empty">No hospitals have signed up yet.</div>`; return; }
    const card = (h) => {
      const ok = +h.verified === 1;
      const map = `https://www.google.com/maps?q=${h.latitude},${h.longitude}`;
      return `
        <article class="card">
          <div class="card-head">
            <div>
              <div class="card-title">${esc(h.name)}</div>
              <div class="card-sub">${esc([h.area, h.city].filter(Boolean).join(", ") || "—")} · <a href="${map}" target="_blank" rel="noopener">Check location</a></div>
            </div>
            <span class="pill ${ok ? "green" : "amber"}">${ok ? "Approved" : "Waiting for approval"}</span>
          </div>
          <div class="facts">
            <div><span>Contact person</span><strong>${esc(h.contact_name || "—")}</strong></div>
            <div><span>Phone</span><strong>${tel(h.phone)}</strong></div>
            <div><span>Email</span><strong>${h.email ? `<a href="mailto:${esc(h.email)}">${esc(h.email)}</a>` : "—"}</strong></div>
            <div><span>Trauma beds</span><strong>${+h.er_beds_free} free of ${+h.er_beds_total}</strong></div>
            <div><span>Ambulances</span><strong>${+h.units}</strong></div>
            <div><span>Signed up</span><strong>${esc(when(h.created_at))}</strong></div>
          </div>
          <div class="card-actions">
            ${ok
              ? `<button class="btn btn-danger" type="button" data-hosp="${esc(h.id)}" data-v="0">Suspend</button>`
              : `<button class="btn btn-success" type="button" data-hosp="${esc(h.id)}" data-v="1">Approve hospital</button>`}
          </div>
        </article>`;
    };
    const pending = list.filter((h) => +h.verified !== 1);
    const approved = list.filter((h) => +h.verified === 1);
    el.innerHTML =
      (pending.length ? `<div class="section-title">Waiting for approval</div><div class="list">${pending.map(card).join("")}</div>` : "") +
      (approved.length ? `<div class="section-title">Approved</div><div class="list">${approved.map(card).join("")}</div>` : "");
  }

  function renderCrews(list) {
    const el = $("panel-crews");
    if (!list.length) { el.innerHTML = `<div class="empty">No ambulance crews have signed up yet.</div>`; return; }
    const duty = { available: ["On duty", "green"], assigned: ["On a case", "blue"], offline: ["Off duty", ""] };
    const card = (c) => {
      const ok = +c.approved === 1;
      const [dl, dc] = ok ? (duty[c.status] || [c.status, ""]) : ["Waiting for approval", "amber"];
      return `
        <article class="card">
          <div class="card-head">
            <div>
              <div class="card-title"><span class="code">${esc(c.unit_type)}</span>${esc(c.unit_code)}</div>
              <div class="card-sub">${esc(c.hospital_name || "—")}</div>
            </div>
            <span class="pill ${dc}">${esc(dl)}</span>
          </div>
          <div class="facts">
            <div><span>Crew</span><strong>${esc(c.crew_name || "—")}</strong></div>
            <div><span>Phone</span><strong>${tel(c.crew_phone)}</strong></div>
            <div><span>Vehicle</span><strong>${esc(c.vehicle_number || "—")}</strong></div>
            <div><span>Last seen</span><strong>${c.last_seen ? esc(ago(c.last_seen)) : "Never"}</strong></div>
          </div>
          <div class="card-actions">
            ${ok && c.status === "assigned" ? `<button class="btn btn-ghost" type="button" data-free="${c.id}">Case done · free unit</button>` : ""}
            ${ok
              ? `<button class="btn btn-danger" type="button" data-crew="${c.id}" data-v="0">Block</button>`
              : `<button class="btn btn-success" type="button" data-crew="${c.id}" data-v="1">Approve crew</button>`}
          </div>
        </article>`;
    };
    const pending = list.filter((c) => +c.approved !== 1);
    const approved = list.filter((c) => +c.approved === 1);
    el.innerHTML =
      `<p class="muted" style="margin-bottom:8px">Hospitals approve their own crews from the hospital console. Use this if a hospital asks you to do it for them.</p>` +
      (pending.length ? `<div class="section-title">Waiting for approval</div><div class="list">${pending.map(card).join("")}</div>` : "") +
      (approved.length ? `<div class="section-title">Approved</div><div class="list">${approved.map(card).join("")}</div>` : "");
  }

  function renderClosed(list) {
    const el = $("panel-closed");
    if (!list.length) { el.innerHTML = `<div class="empty">Nothing closed yet.</div>`; return; }
    const c = state.data.conditions, t = state.data.treatments;
    const by = { rider: "Rider (from the app)", support: "Accidiox support" };
    el.innerHTML = `<div class="list">${list.map((i) => {
      const [label, cls] = STATUS[i.status] || [i.status, ""];
      return `
        <article class="card">
          <div class="card-head">
            <div>
              <div class="card-title"><span class="code">${incCode(i.id)}</span>${esc(i.rider_name || "Unknown rider")}</div>
              <div class="card-sub">${esc(i.location_name || "")}</div>
            </div>
            <span class="pill ${cls}">${esc(label)}</span>
          </div>
          <div class="facts">
            ${i.status === "ADMITTED"
              ? `<div><span>Hospital</span><strong>${esc(i.hospital_name || "—")}</strong></div>`
              : `<div><span>Closed by</span><strong>${esc(by[i.cancelled_by] || "Rider")}</strong></div>
                 <div><span>Condition</span><strong>${esc(c[i.cancel_condition] || "—")}</strong></div>
                 <div><span>Treatment</span><strong>${esc(t[i.cancel_treatment] || "—")}</strong></div>`}
            <div><span>Closed</span><strong>${esc(when(i.updated_at))}</strong></div>
            ${i.cancel_note ? `<div style="grid-column:1/-1"><span>Support note</span><strong>${esc(i.cancel_note)}</strong></div>` : ""}
          </div>
        </article>`;
    }).join("")}</div>`;
  }

  // ---------- Tabs & actions ----------
  $("tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tab]");
    if (!b) return;
    state.tab = b.dataset.tab;
    document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("active", x === b));
    document.querySelectorAll(".panel").forEach((p) => { p.hidden = p.id !== `panel-${state.tab}`; });
  });

  document.addEventListener("click", async (e) => {
    const r = e.target.closest("[data-resolve]");
    if (r) return openResolve(+r.dataset.resolve);

    // Unit left "on a case" after the case ended.
    const f = e.target.closest("[data-free]");
    if (f) {
      f.disabled = true;
      const { ok, data } = await api("free_unit", { ambulance_id: +f.dataset.free });
      toast(ok ? "Unit is free for the next case." : (data.message || "Couldn't free this unit."), !ok);
      if (!ok) f.disabled = false;
      return load();
    }

    const h = e.target.closest("[data-hosp]");
    const c = e.target.closest("[data-crew]");
    if (!h && !c) return;
    const approve = (h || c).dataset.v === "1";
    if (!approve && !confirm(h ? "Suspend this hospital? It will stop getting crash alerts." : "Block this crew? They won't get any cases.")) return;
    (h || c).disabled = true;
    const { ok, data } = h
      ? await api("set_hospital", { hospital_id: h.dataset.hosp, verified: approve })
      : await api("set_crew", { ambulance_id: +c.dataset.crew, approved: approve });
    if (!ok) { toast(data.message || "Couldn't save.", true); (h || c).disabled = false; return; }
    toast(h ? (approve ? "Hospital approved. It now gets crash alerts." : "Hospital suspended.") : (approve ? "Crew approved." : "Crew blocked."));
    load();
  });

  function choiceButtons(el, options, key) {
    el.innerHTML = Object.entries(options).map(([k, v]) => `<button type="button" data-k="${esc(k)}">${esc(v)}</button>`).join("");
    el.onclick = (e) => {
      const b = e.target.closest("button[data-k]");
      if (!b) return;
      state[key] = b.dataset.k;
      el.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    };
  }

  function openResolve(id) {
    const inc = state.data.open.find((i) => i.id === id);
    if (!inc) return;
    state.resolving = id;
    state.condition = state.treatment = null;
    $("rCode").textContent = incCode(id);
    $("rWho").textContent = `${inc.rider_name || "Rider"} · ${inc.location_name || ""} · ${ago(inc.created_at)}`;
    choiceButtons($("rCondition"), state.data.conditions, "condition");
    choiceButtons($("rTreatment"), state.data.treatments, "treatment");
    $("rNote").value = "";
    $("rError").hidden = true;
    $("resolveModal").hidden = false;
  }
  function closeResolve() {
    $("resolveModal").hidden = true;
    state.resolving = null;
  }
  $("resolveModal").addEventListener("click", (e) => {
    if (e.target === $("resolveModal") || e.target.closest("[data-close]")) closeResolve();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && state.resolving) closeResolve(); });

  $("resolveForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("rError");
    err.hidden = true;
    if (!state.condition || !state.treatment) { err.textContent = "Choose the rider's condition and treatment."; err.hidden = false; return; }
    const btn = $("rBtn");
    btn.disabled = true;
    try {
      const { ok, data } = await api("resolve_incident", {
        incident_id: state.resolving, condition: state.condition, treatment: state.treatment, note: $("rNote").value.trim()
      });
      if (!ok) throw new Error(data.message || "Couldn't close this emergency.");
      closeResolve();
      toast("Emergency closed. It's removed from the hospital, crew and rider apps.");
      load();
    } catch (ex) {
      err.textContent = ex.message === "Failed to fetch" ? "No connection. Try again." : ex.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  if (token()) start(); else showGate();
})();
