// Sign in / create account for riders, hospitals and ambulance crews.
(function () {
  const S = window.AccidioxSession;
  const role = document.documentElement.dataset.role;
  const params = new URLSearchParams(location.search);
  const $ = (id) => document.getElementById(id);

  const COPY = {
    rider: {
      tag: "Rider",
      title: "Ride with a guardian.",
      lead: "Accidiox watches every lean and impact. If you go down, the nearest hospitals and your family know within seconds.",
      points: [
        ["bike", "Crash detected in 10 seconds", "An 85° tilt held for 10 s, then 20 s for you to say you're safe."],
        ["building", "3 nearest hospitals alerted", "The first to accept sends an ambulance; the rest stand by."],
        ["ambulance", "Your blood group rides ahead", "The crew knows your blood group and allergies before they reach you."]
      ],
      loginTitle: "Welcome back, rider",
      loginSub: "Sign in to arm your black box.",
      registerTitle: "Create your rider account",
      registerSub: "Two minutes now can save the golden hour later.",
      registerCta: "Continue to medical profile",
      demos: [["rider@accidiox.demo", "Rohan Sharma", "Rider · O+ · Varanasi"]]
    },
    hospital: {
      tag: "Hospitals",
      title: "Crash alerts before the first phone call.",
      lead: "Accidiox routes every confirmed two-wheeler crash to the three nearest trauma centres, with the rider's location, vitals-relevant history and blood group.",
      points: [
        ["pin", "Only the 3 nearest are alerted", "No city-wide noise. You see crashes you can actually reach."],
        ["check", "First to claim dispatches", "The moment you accept, the other two go on standby. No duplicate ambulances."],
        ["ambulance", "Fleet, beds and admissions", "Track your units live and mark patients admitted in one console."]
      ],
      loginTitle: "Hospital console",
      loginSub: "Sign in to your emergency desk.",
      registerTitle: "Register your hospital",
      registerSub: "Join the Accidiox emergency network.",
      registerCta: "Register hospital",
      nameLabel: "Emergency desk administrator",
      demos: [
        ["bhu@accidiox.demo", "Sir Sunderlal Hospital", "BHU Trauma Centre · Lanka"],
        ["apex@accidiox.demo", "Apex Super Speciality", "Mahmoorganj"],
        ["heritage@accidiox.demo", "Heritage Hospitals", "Lanka"],
        ["apollo@accidiox.demo", "Apollo Emergency", "Sigra"]
      ]
    },
    ambulance: {
      tag: "Crew",
      title: "Your next patient, already briefed.",
      lead: "The Accidiox crew app puts the crash site, the patient's blood group and allergies in your hands the moment your hospital dispatches you.",
      points: [
        ["droplet", "Blood group before arrival", "Arrange the right blood and avoid drugs the patient is allergic to."],
        ["pin", "One-tap navigation", "Straight to the crash site, then back to your emergency entrance."],
        ["building", "Your hospital sees you live", "Your position and status update the console automatically."]
      ],
      loginTitle: "Ambulance crew",
      loginSub: "Sign in to go on duty.",
      registerTitle: "Register your unit",
      registerSub: "Link your ambulance to your hospital.",
      registerCta: "Create crew account",
      nameLabel: "Crew lead name",
      demos: [
        ["als04.bhu@accidiox.demo", "Ravi Kumar", "ALS-04 · Sir Sunderlal Hospital"],
        ["als01.apex@accidiox.demo", "Imran Ali", "ALS-01 · Apex Super Speciality"]
      ]
    }
  };
  const copy = COPY[role];

  const ICONS = {
    droplet: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5S5 13 5 15a7 7 0 0 0 7 7z"/>'
  };
  const svg = (name) => ICONS[name]
    ? `<svg class="ic ic-sm" viewBox="0 0 24 24">${ICONS[name]}</svg>`
    : `<svg class="ic ic-sm"><use href="#i-${name}"/></svg>`;

  // Already signed in? Go straight to the app.
  if (S.token(role) && !params.has("switch")) {
    const u = S.user(role);
    location.replace(role === "rider" && u && !u.onboarded ? "onboarding.html" : nextUrl());
    return;
  }

  // ----- Static copy -----
  document.title = `${role === "rider" ? "Sign in" : copy.loginTitle} · Accidiox`;
  document.querySelector('meta[name="theme-color"]').content = role === "rider" ? "#f1f2f5" : "#0a0c10";
  $("brandTag").textContent = copy.tag;
  $("storyTitle").textContent = copy.title;
  $("storyLead").textContent = copy.lead;
  $("storyPoints").innerHTML = copy.points.map(([ic, t, s]) =>
    `<li><span class="dot">${svg(ic)}</span><div><strong>${t}</strong><span>${s}</span></div></li>`).join("");
  document.querySelectorAll("[data-role-link]").forEach((a) => a.classList.toggle("active", a.dataset.roleLink === role));
  document.querySelectorAll("[data-only]").forEach((el) => {
    if (!el.dataset.only.split(" ").includes(role)) el.remove();
  });
  if (copy.nameLabel) $("nameLabel").textContent = copy.nameLabel;
  $("registerLabel").textContent = copy.registerCta;

  $("demoList").innerHTML = copy.demos.map(([email, name, sub]) => `
    <button type="button" class="demo-item" data-email="${email}">
      <span class="demo-avatar">${S.initials(name)}</span>
      <span class="demo-text"><strong>${name}</strong><span>${sub}</span></span>
      <svg class="ic ic-sm"><use href="#i-arrow"/></svg>
    </button>`).join("");

  // ----- Mode switching -----
  function setMode(mode) {
    document.querySelectorAll(".mode").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    $("loginForm").hidden = mode !== "login";
    $("registerForm").hidden = mode !== "register";
    $("formTitle").textContent = mode === "login" ? copy.loginTitle : copy.registerTitle;
    $("formSub").textContent = mode === "login" ? copy.loginSub : copy.registerSub;
    showError(null);
    if (mode === "register" && role === "ambulance") loadHospitals();
  }
  document.querySelectorAll(".mode").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  setMode(params.get("mode") === "register" ? "register" : "login");

  // ----- Helpers -----
  function showError(message, field) {
    const box = $("formError");
    document.querySelectorAll(".input.invalid").forEach((i) => i.classList.remove("invalid"));
    if (!message) { box.hidden = true; return; }
    box.textContent = message;
    box.hidden = false;
    const form = $("loginForm").hidden ? $("registerForm") : $("loginForm");
    const input = field && form.querySelector(`[name="${field}"]`);
    if (input) { input.classList.add("invalid"); input.focus(); }
  }

  function nextUrl() {
    const next = params.get("next");
    // Only same-folder page names; never an absolute or protocol URL.
    if (next && /^[a-z_]+\.html(\?[\w=&%-]*)?$/i.test(next)) return next;
    return S.HOME[role];
  }

  function busy(form, on) {
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = on;
    btn.classList.toggle("loading", on);
  }

  function afterAuth(data) {
    S.save(role, data.token, data.user);
    if (role === "rider" && !data.user.onboarded) location.replace("onboarding.html");
    else location.replace(nextUrl());
  }

  document.querySelectorAll("[data-reveal]").forEach((b) => b.addEventListener("click", () => {
    const input = b.parentElement.querySelector("input");
    input.type = input.type === "password" ? "text" : "password";
  }));

  document.querySelectorAll("[data-chip-group]").forEach((group) => {
    group.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      group.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));
    });
  });

  // ----- Sign in -----
  $("demoList").addEventListener("click", (e) => {
    const item = e.target.closest(".demo-item");
    if (!item) return;
    const f = $("loginForm");
    f.email.value = item.dataset.email;
    f.password.value = "demo1234";
    f.requestSubmit();
  });

  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    if (!f.email.value.trim()) return showError("Enter your email.", "email");
    if (!f.password.value) return showError("Enter your password.", "password");
    busy(f, true);
    try {
      const { ok, data } = await S.api(role, "api/auth.php?action=login", {
        method: "POST",
        body: { role, email: f.email.value.trim(), password: f.password.value }
      });
      if (ok) return afterAuth(data);
      showError(data.message || "Couldn't sign in.", data.field);
    } catch (err) {
      showError("Can't reach the Accidiox server. Check your connection.");
    }
    busy(f, false);
  });

  // ----- Create account -----
  async function loadHospitals() {
    const sel = $("hospitalSelect");
    if (!sel || sel.dataset.loaded) return;
    try {
      const { data } = await S.api(role, "api/auth.php?action=hospitals");
      sel.innerHTML = `<option value="">Select your hospital</option>` +
        (data.hospitals || []).map((h) => `<option value="${h.id}">${h.name}${h.city ? ` · ${h.city}` : ""}</option>`).join("");
      sel.dataset.loaded = "1";
    } catch (e) {
      sel.innerHTML = `<option value="">Couldn't load hospitals</option>`;
    }
  }

  const btnLocate = $("btnLocate");
  if (btnLocate) {
    btnLocate.addEventListener("click", () => {
      const status = $("locateStatus");
      if (!("geolocation" in navigator)) { status.textContent = "Location isn't available on this device."; return; }
      status.textContent = "Getting location…";
      navigator.geolocation.getCurrentPosition((pos) => {
        const f = $("registerForm");
        f.latitude.value = pos.coords.latitude.toFixed(6);
        f.longitude.value = pos.coords.longitude.toFixed(6);
        status.textContent = `Location set · ±${Math.round(pos.coords.accuracy)} m`;
        status.classList.add("ok");
      }, () => {
        status.textContent = "Permission denied. Enter the coordinates manually.";
      }, { enableHighAccuracy: true, timeout: 10000 });
    });
  }

  $("registerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const val = (n) => (f[n] ? f[n].value.trim() : "");
    const body = { role, name: val("name"), email: val("email"), phone: val("phone"), password: f.password.value };

    if (role === "hospital") {
      Object.assign(body, {
        hospital_name: val("hospital_name"), area: val("area"), city: val("city"),
        latitude: parseFloat(val("latitude")), longitude: parseFloat(val("longitude")),
        er_beds: parseInt(val("er_beds"), 10) || 0
      });
      if (body.hospital_name.length < 3) return showError("Enter the hospital name.", "hospital_name");
      if (!isFinite(body.latitude) || !isFinite(body.longitude)) return showError("Set the hospital location so nearby crashes reach you.", "latitude");
    }
    if (role === "ambulance") {
      const chip = f.querySelector('[data-chip-group="unit_type"] .chip.active');
      Object.assign(body, {
        hospital_id: val("hospital_id"), unit_code: val("unit_code"),
        vehicle_number: val("vehicle_number"), unit_type: chip ? chip.dataset.value : "BLS"
      });
      if (!body.hospital_id) return showError("Choose your hospital.", "hospital_id");
      if (body.unit_code.length < 2) return showError("Enter your unit code, e.g. ALS-04.", "unit_code");
    }
    if (body.name.length < 2) return showError("Enter your name.", "name");
    if (!/^\S+@\S+\.\S+$/.test(body.email)) return showError("Enter a valid email.", "email");
    if (body.phone.replace(/\D/g, "").length < 10) return showError("Enter a valid 10-digit phone number.", "phone");
    if (body.password.length < 8) return showError("Password must be at least 8 characters.", "password");

    busy(f, true);
    try {
      const { ok, data } = await S.api(role, "api/auth.php?action=register", { method: "POST", body });
      if (ok) return afterAuth(data);
      showError(data.message || "Couldn't create the account.", data.field === "location" ? "latitude" : data.field);
    } catch (err) {
      showError("Can't reach the Accidiox server. Check your connection.");
    }
    busy(f, false);
  });
})();
