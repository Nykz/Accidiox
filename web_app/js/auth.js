// Sign in / create account / password reset. Each app opens this page with
// its own role and never links to the others: riders only ever see the
// rider sign-in.
(function () {
  const S = window.AccidioxSession;
  const role = document.documentElement.dataset.role;
  const params = new URLSearchParams(location.search);
  const resetToken = /^[a-f0-9]{64}$/.test(params.get("reset") || "") ? params.get("reset") : null;
  const $ = (id) => document.getElementById(id);

  const COPY = {
    rider: {
      tag: "Rider",
      title: "Ride with a guardian.",
      lead: "Accidiox watches every lean and impact. If you go down, the nearest hospitals and your family know within seconds.",
      points: [
        ["bike", "Crash detected in 10 seconds", "An 85° tilt held for 10 s, then 20 s for you to say you're safe."],
        ["building", "Nearest hospitals alerted", "The first to accept sends an ambulance straight to you."],
        ["ambulance", "Your blood group rides ahead", "The crew knows your blood group and allergies before they reach you."]
      ],
      loginTitle: "Welcome back",
      loginSub: "Sign in to arm your black box.",
      registerTitle: "Create your account",
      registerSub: "Two minutes now can save a life later.",
      registerCta: "Continue to medical profile"
    },
    hospital: {
      tag: "Hospitals",
      title: "Crash alerts before the first phone call.",
      lead: "Every confirmed two-wheeler crash is routed to the nearest trauma centres with the rider's location, blood group and medical notes.",
      points: [
        ["pin", "Only the nearest hospitals are alerted", "You see crashes your team can actually reach."],
        ["check", "First to accept dispatches", "Other hospitals are locked out, so two ambulances never race to one crash."],
        ["ambulance", "Your fleet, beds and admissions", "Track your ambulances live and close every case in one console."]
      ],
      loginTitle: "Hospital console",
      loginSub: "Sign in to your emergency desk.",
      registerTitle: "Register your hospital",
      registerSub: "Every hospital is verified before it receives any patient data.",
      registerCta: "Submit for verification",
      nameLabel: "Emergency desk administrator"
    },
    ambulance: {
      tag: "Crew",
      title: "Your next patient, already briefed.",
      lead: "The crash site, the patient's blood group and allergies arrive on your phone the moment your hospital dispatches you.",
      points: [
        ["droplet", "Blood group before arrival", "Arrange the right blood and avoid drugs the patient is allergic to."],
        ["pin", "One-tap navigation", "Straight to the crash site, then back to your emergency entrance."],
        ["building", "Your hospital sees you live", "Your position and status update the console automatically."]
      ],
      loginTitle: "Ambulance crew",
      loginSub: "Sign in to go on duty.",
      registerTitle: "Register your unit",
      registerSub: "Your hospital approves your unit before you receive any case.",
      registerCta: "Request access",
      nameLabel: "Crew lead name"
    }
  };
  const copy = COPY[role];

  const ICONS = {
    droplet: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5S5 13 5 15a7 7 0 0 0 7 7z"/>'
  };
  const svg = (name) => ICONS[name]
    ? `<svg class="ic ic-sm" viewBox="0 0 24 24">${ICONS[name]}</svg>`
    : `<svg class="ic ic-sm"><use href="#i-${name}"/></svg>`;

  // Already signed in? Go straight to the app (unless following a reset link).
  if (S.token(role) && !params.has("switch") && !resetToken) {
    const u = S.user(role);
    location.replace(role === "rider" && u && !u.onboarded ? "onboarding.html" : nextUrl());
    return;
  }

  // ----- Static copy -----
  document.title = `${copy.loginTitle} · Accidiox`;
  document.querySelector('meta[name="theme-color"]').content = role === "rider" ? "#f1f2f5" : "#0a0c10";
  if (role !== "rider") document.querySelector('link[rel="manifest"]').remove();
  if (role === "ambulance") {
    // The crew app has its own icon: a motorbike carrying a first-aid kit.
    document.querySelector('link[rel="icon"]').href = "assets/icons/crew-icon-192.png";
    document.querySelector(".brand-mark").outerHTML = '<img class="brand-mark" src="assets/icons/crew-icon.svg" alt="" width="32" height="32" />';
  }
  $("brandTag").textContent = copy.tag;
  $("storyTitle").textContent = copy.title;
  $("storyLead").textContent = copy.lead;
  $("storyPoints").innerHTML = copy.points.map(([ic, t, s]) =>
    `<li><span class="dot">${svg(ic)}</span><div><strong>${t}</strong><span>${s}</span></div></li>`).join("");
  document.querySelectorAll("[data-only]").forEach((el) => {
    if (!el.dataset.only.split(" ").includes(role)) el.remove();
  });
  if (copy.nameLabel) $("nameLabel").textContent = copy.nameLabel;

  // Inside the rider and crew apps, Chrome must not behave like a browser:
  // no "Save password?" bar and no saved-password / autofill dropdowns.
  // Chrome's password manager only watches type=password fields, so these
  // become masked text fields (still shown as dots). The hospital console
  // runs in a normal desktop browser and keeps standard fields.
  if (role !== "hospital") {
    document.querySelectorAll("form input").forEach((i) => {
      if (i.type === "password") {
        i.type = "text";
        i.classList.add("secret");
        i.dataset.secret = "1";
      }
      i.setAttribute("autocomplete", "off");
      if (i.dataset.secret || i.type === "email") {
        i.setAttribute("autocorrect", "off");
        i.setAttribute("autocapitalize", "off");
        i.spellcheck = false;
      }
    });
  }
  $("registerLabel").textContent = copy.registerCta;

  // ----- Modes: login | register | forgot | reset -----
  const FORMS = { login: "loginForm", register: "registerForm", forgot: "forgotForm", reset: "resetForm" };
  function setMode(mode) {
    Object.entries(FORMS).forEach(([m, id]) => ($(id).hidden = m !== mode));
    document.querySelectorAll(".mode").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    document.querySelector(".mode-tabs").classList.toggle("hidden", mode === "forgot" || mode === "reset");
    const titles = {
      login: [copy.loginTitle, copy.loginSub],
      register: [copy.registerTitle, copy.registerSub],
      forgot: ["Reset your password", "We'll email you a link to choose a new one."],
      reset: ["Choose a new password", "You'll be signed out on every other device."]
    }[mode];
    $("formTitle").textContent = titles[0];
    $("formSub").textContent = titles[1];
    showError(null);
    if (mode === "register" && role === "ambulance") loadHospitals();
  }
  document.querySelectorAll(".mode").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  $("btnForgot").addEventListener("click", () => {
    const email = $("loginForm").email.value.trim();
    setMode("forgot");
    if (email) $("forgotForm").email.value = email;
  });
  document.querySelectorAll("[data-back]").forEach((b) => b.addEventListener("click", () => {
    // Reset the forgot form so it's ready for next time.
    const f = $("forgotForm");
    f.querySelector(".field").hidden = false;
    f.querySelector('button[type="submit"]').hidden = false;
    $("forgotNotice").hidden = true;
    setMode("login");
  }));
  // Survive a reload like an app does: remember the open tab and what was
  // typed (never passwords) for this session only.
  const DRAFT_KEY = `accidiox.${role}.authDraft`;
  function loadDraft() {
    try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "{}"); } catch (e) { return {}; }
  }
  function saveDraft(patch) {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(Object.assign(loadDraft(), patch))); } catch (e) {}
  }
  const draft = loadDraft();
  Object.values(FORMS).forEach((id) => {
    const form = $(id);
    form.querySelectorAll("input:not([data-secret]):not([type=password]), select").forEach((el) => {
      const key = `${id}.${el.name}`;
      if (draft.fields && draft.fields[key] != null && el.name) el.value = draft.fields[key];
      el.addEventListener("input", () => saveDraft({ fields: Object.assign(loadDraft().fields || {}, { [key]: el.value }) }));
    });
  });
  const _setMode = setMode;
  setMode = (m) => { _setMode(m); if (m !== "reset") saveDraft({ mode: m }); };
  setMode(resetToken ? "reset" : params.get("mode") === "register" ? "register" : ["login", "register", "forgot"].includes(draft.mode) ? draft.mode : "login");

  // ----- Helpers -----
  function currentForm() {
    return Object.values(FORMS).map((id) => $(id)).find((f) => !f.hidden);
  }

  function showError(message, field) {
    const box = $("formError");
    document.querySelectorAll(".input.invalid").forEach((i) => i.classList.remove("invalid"));
    if (!message) { box.hidden = true; return; }
    box.textContent = message;
    box.hidden = false;
    const input = field && currentForm().querySelector(`[name="${field}"]`);
    if (input) { input.classList.add("invalid"); input.focus(); }
  }

  function nextUrl() {
    const next = params.get("next");
    // Only this app's own page; never another app or an absolute URL.
    if (next && /^[a-z_]+\.html(\?[\w=&%-]*)?$/i.test(next) && next.split("?")[0] === S.HOME[role]) return next;
    return S.HOME[role];
  }

  function busy(form, on) {
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = on;
    btn.classList.toggle("loading", on);
  }

  function afterAuth(data) {
    try { sessionStorage.removeItem(`accidiox.${role}.authDraft`); } catch (e) {}
    S.save(role, data.token, data.user);
    if (role === "rider" && !data.user.onboarded) location.replace("onboarding.html");
    else location.replace(nextUrl());
  }

  function passwordProblem(pw) {
    if (pw.length < 8) return "Password must be at least 8 characters.";
    if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "Use at least one letter and one number in your password.";
    return null;
  }

  async function call(action, body) {
    return S.api(role, `api/auth.php?action=${action}`, { method: "POST", body });
  }

  document.querySelectorAll("[data-reveal]").forEach((b) => b.addEventListener("click", () => {
    const input = b.parentElement.querySelector("input");
    if (input.dataset.secret) input.classList.toggle("secret");
    else input.type = input.type === "password" ? "text" : "password";
  }));

  document.querySelectorAll("[data-chip-group]").forEach((group) => {
    group.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      group.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));
    });
  });

  // ----- Sign in -----
  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    if (!f.email.value.trim()) return showError("Enter your email.", "email");
    if (!f.password.value) return showError("Enter your password.", "password");
    busy(f, true);
    try {
      const { ok, data } = await call("login", { role, email: f.email.value.trim(), password: f.password.value });
      if (ok) return afterAuth(data);
      showError(data.message || "Couldn't sign in.", data.field);
    } catch (err) {
      showError("Can't reach Accidiox right now. Check your connection.");
    }
    busy(f, false);
  });

  // ----- Forgot password -----
  // After sending: hide the form, show a "check your email" card with a
  // clear Spam/Junk reminder, and allow a resend after a short cooldown.
  let resendTimer = null;
  function showSent(email) {
    const f = $("forgotForm");
    f.querySelector(".field").hidden = true;
    f.querySelector('button[type="submit"]').hidden = true;
    $("forgotSentTo").textContent = `If an account exists for ${email}, a reset link is on its way.`;
    $("forgotNotice").hidden = false;
    $("formSub").textContent = "Almost there.";
    const btn = $("btnResend");
    let left = 30;
    btn.disabled = true;
    btn.textContent = `Resend email in ${left}s`;
    clearInterval(resendTimer);
    resendTimer = setInterval(() => {
      left -= 1;
      if (left > 0) { btn.textContent = `Resend email in ${left}s`; return; }
      clearInterval(resendTimer);
      btn.disabled = false;
      btn.textContent = "Resend email";
    }, 1000);
  }
  $("btnResend").addEventListener("click", () => $("forgotForm").requestSubmit());

  $("forgotForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const email = f.email.value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return showError("Enter the email you signed up with.", "email");
    busy(f, true);
    try {
      const { ok, data } = await call("forgot_password", { role, email });
      if (ok) {
        showError(null);
        showSent(email);
      } else {
        showError(data.message || "Couldn't send the email. Try again.", data.field);
      }
    } catch (err) {
      showError("Can't reach Accidiox right now. Check your connection.");
    }
    busy(f, false);
  });

  // ----- Reset password -----
  $("resetForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const problem = passwordProblem(f.password.value);
    if (problem) return showError(problem, "password");
    if (f.password.value !== f.confirm.value) return showError("The two passwords don't match.", "confirm");
    busy(f, true);
    try {
      const { ok, data } = await call("reset_password", { token: resetToken, password: f.password.value });
      if (ok) {
        S.clear(role);
        history.replaceState(null, "", `auth.html?role=${role}`);
        setMode("login");
        $("formSub").textContent = "Password updated. Sign in with your new password.";
      } else {
        showError(data.message || "Couldn't reset the password.", data.field);
      }
    } catch (err) {
      showError("Can't reach Accidiox right now. Check your connection.");
    }
    busy(f, false);
  });

  // ----- Create account -----
  async function loadHospitals() {
    const sel = $("hospitalSelect");
    if (!sel || sel.dataset.loaded) return;
    try {
      const { data } = await S.api(role, "api/auth.php?action=hospitals");
      const list = data.hospitals || [];
      sel.innerHTML = "";
      const first = document.createElement("option");
      first.value = "";
      first.textContent = list.length ? "Select your hospital" : "No verified hospitals yet";
      sel.appendChild(first);
      list.forEach((h) => {
        const o = document.createElement("option");
        o.value = h.id;
        o.textContent = h.city ? `${h.name} · ${h.city}` : h.name;
        sel.appendChild(o);
      });
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
    const problem = passwordProblem(body.password);
    if (problem) return showError(problem, "password");

    busy(f, true);
    try {
      const { ok, data } = await call("register", body);
      if (ok) return afterAuth(data);
      showError(data.message || "Couldn't create the account.", data.field === "location" ? "latitude" : data.field);
    } catch (err) {
      showError("Can't reach Accidiox right now. Check your connection.");
    }
    busy(f, false);
  });
})();
