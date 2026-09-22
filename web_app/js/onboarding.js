// Rider medical profile: first-run onboarding, and editing from Settings (?edit=1).
(function () {
  const S = window.AccidioxSession;
  const user = S.guard("rider");
  if (!user) return;

  const editing = new URLSearchParams(location.search).has("edit");
  const $ = (id) => document.getElementById(id);
  const form = $("profileForm");
  const TOTAL = 4;
  let step = 1;
  const chips = {};

  // ----- Chips -----
  document.querySelectorAll("[data-chip]").forEach((group) => {
    group.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-value]");
      if (!btn) return;
      setChip(group.dataset.chip, btn.dataset.value);
    });
  });
  function setChip(name, value) {
    chips[name] = value;
    document.querySelectorAll(`[data-chip="${name}"] [data-value]`).forEach((b) => b.classList.toggle("active", b.dataset.value === value));
  }

  // ----- Prefill -----
  function fill(p) {
    if (!p) return;
    ["full_name", "phone", "date_of_birth", "allergies", "conditions", "emergency_name", "emergency_phone", "vehicle_number", "vehicle_model"].forEach((k) => {
      if (form[k] && p[k]) form[k].value = k.endsWith("phone") ? String(p[k]).replace(/^91(?=\d{10}$)/, "") : p[k];
    });
    ["gender", "blood_group", "emergency_relation"].forEach((k) => { if (p[k]) setChip(k, p[k]); });
  }
  if (user.profile) fill(user.profile);
  else {
    form.full_name.value = user.name || "";
    form.phone.value = String(user.phone || "").replace(/^91(?=\d{10}$)/, "");
  }
  // Survive a reload like an app: restore the step and everything typed so
  // far in this session (the saved profile below still wins when editing).
  const DRAFT_KEY = `accidiox.rider.onboardingDraft.${user.id}`;
  let draft = {};
  try { draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "{}"); } catch (e) {}
  function saveDraft() {
    const fields = {};
    form.querySelectorAll("input[name]").forEach((i) => { fields[i.name] = i.value; });
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ step, fields, chips })); } catch (e) {}
  }
  if (draft.fields) {
    Object.entries(draft.fields).forEach(([k, v]) => { if (form[k] && v) form[k].value = v; });
    Object.entries(draft.chips || {}).forEach(([k, v]) => setChip(k, v));
  }
  form.addEventListener("input", saveDraft);
  form.addEventListener("click", (e) => { if (e.target.closest("[data-value]")) setTimeout(saveDraft, 0); });

  if (editing && !draft.fields) {
    S.api("rider", "api/rider.php?action=profile").then(({ ok, data }) => { if (ok) fill(data.profile); }).catch(() => {});
  }

  // ----- Steps -----
  function show(n) {
    step = n;
    document.querySelectorAll(".step").forEach((s) => (s.hidden = Number(s.dataset.step) !== n));
    $("progressBar").style.width = `${(n / TOTAL) * 100}%`;
    $("stepCount").textContent = `${n} of ${TOTAL}`;
    $("btnBack").disabled = n === 1 && !editing;
    $("btnSkip").hidden = n !== 4;
    $("btnNext").querySelector("span").textContent = n === TOTAL ? (editing ? "Save profile" : "Finish setup") : "Continue";
    error(null);
    if (n === TOTAL) renderSummary();
    window.scrollTo(0, 0);
    saveDraft();
  }

  function error(msg, field) {
    const box = $("formError");
    document.querySelectorAll(".input.invalid").forEach((i) => i.classList.remove("invalid"));
    box.hidden = !msg;
    if (!msg) return;
    box.textContent = msg;
    if (field && form[field]) { form[field].classList.add("invalid"); form[field].focus(); }
  }

  const digits = (v) => String(v || "").replace(/\D/g, "");

  function validate(n) {
    if (n === 1) {
      if (form.full_name.value.trim().length < 2) return error("Enter your full name.", "full_name"), false;
      if (digits(form.phone.value).length < 10) return error("Enter a valid 10-digit mobile number.", "phone"), false;
    }
    if (n === 2 && !chips.blood_group) return error("Choose your blood group. It's the most important field."), false;
    if (n === 3) {
      if (form.emergency_name.value.trim().length < 2) return error("Enter your emergency contact's name.", "emergency_name"), false;
      if (digits(form.emergency_phone.value).length < 10) return error("Enter their 10-digit mobile number.", "emergency_phone"), false;
      if (digits(form.emergency_phone.value).slice(-10) === digits(form.phone.value).slice(-10)) {
        return error("Use someone else's number. You can't answer your own emergency call.", "emergency_phone"), false;
      }
    }
    return true;
  }

  function renderSummary() {
    const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const name = form.full_name.value.trim();
    $("summary").innerHTML = `
      <div class="summary-head">
        <span class="summary-avatar">${esc(S.initials(name))}</span>
        <div><strong>${esc(name)}</strong><span>+91 ${esc(digits(form.phone.value).slice(-10))}</span></div>
        <span class="summary-blood">${esc(chips.blood_group || "—")}</span>
      </div>
      <div class="summary-row"><span>Allergies</span><strong>${esc(form.allergies.value.trim() || "None")}</strong></div>
      <div class="summary-row"><span>Conditions</span><strong>${esc(form.conditions.value.trim() || "None")}</strong></div>
      <div class="summary-row"><span>Emergency contact</span><strong>${esc(form.emergency_name.value.trim())}${chips.emergency_relation ? ` · ${esc(chips.emergency_relation)}` : ""}</strong></div>`;
  }

  $("btnBack").addEventListener("click", () => {
    if (step > 1) show(step - 1);
    else if (editing) location.href = "index.html";
  });
  $("btnSkip").addEventListener("click", () => {
    form.vehicle_number.value = "";
    form.vehicle_model.value = "";
    save();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!validate(step)) return;
    if (step < TOTAL) show(step + 1);
    else save();
  });

  async function save() {
    const btn = $("btnNext");
    btn.disabled = true;
    const body = {
      full_name: form.full_name.value.trim(),
      phone: form.phone.value,
      date_of_birth: form.date_of_birth.value,
      gender: chips.gender || "",
      blood_group: chips.blood_group,
      allergies: form.allergies.value.trim(),
      conditions: form.conditions.value.trim(),
      emergency_name: form.emergency_name.value.trim(),
      emergency_phone: form.emergency_phone.value,
      emergency_relation: chips.emergency_relation || "",
      vehicle_number: form.vehicle_number.value.trim(),
      vehicle_model: form.vehicle_model.value.trim()
    };
    try {
      const { ok, data } = await S.api("rider", "api/rider.php?action=save_profile", { method: "POST", body });
      if (!ok) {
        btn.disabled = false;
        const stepOf = { full_name: 1, phone: 1, date_of_birth: 1, blood_group: 2, emergency_name: 3, emergency_phone: 3 };
        if (data.field && stepOf[data.field]) show(stepOf[data.field]);
        return error(data.message || "Couldn't save your profile.", data.field);
      }
      S.save("rider", null, Object.assign({}, S.user("rider"), { name: body.full_name, profile: data.profile, onboarded: true }));
      finish();
    } catch (err) {
      btn.disabled = false;
      error("Can't reach the Accidiox server. Check your connection and try again.");
    }
  }

  function finish() {
    try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) {}
    document.querySelector(".ob-top").style.visibility = "hidden";
    form.innerHTML = `
      <section class="step done">
        <span class="done-icon"><svg class="ic"><use href="#i-check"/></svg></span>
        <h1>${editing ? "Profile updated" : "You're protected"}</h1>
        <p class="lead">${editing
          ? "The latest details will go out with any future alert."
          : "Connect your Accidiox black box and ride. If you crash, the 3 nearest hospitals get your location and blood group within seconds."}</p>
      </section>
      <footer class="ob-actions"><a class="btn btn-primary" href="index.html"><span>${editing ? "Back to app" : "Open my dashboard"}</span></a></footer>`;
  }

  show(draft.step >= 1 && draft.step <= TOTAL ? draft.step : 1);
})();
