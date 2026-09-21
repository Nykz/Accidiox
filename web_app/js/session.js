// Accidiox session helper shared by the rider app, hospital console and
// ambulance crew app. Tokens live in localStorage per role, so one browser
// can hold a rider and a hospital session at the same time during demos.
(function () {
  const HOME = { rider: "index.html", hospital: "hospital_dashboard.html", ambulance: "ambulance.html" };

  function key(role, name) {
    return `accidiox.${role}.${name}`;
  }

  function read(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  function write(k, v) {
    try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {}
  }

  const Session = {
    HOME,

    token(role) {
      return read(key(role, "token"));
    },

    user(role) {
      try { return JSON.parse(read(key(role, "user")) || "null"); } catch (e) { return null; }
    },

    save(role, token, user) {
      if (token) write(key(role, "token"), token);
      if (user) write(key(role, "user"), JSON.stringify(user));
    },

    clear(role) {
      write(key(role, "token"), null);
      write(key(role, "user"), null);
    },

    // fetch() wrapper that attaches the role's token and parses JSON.
    // Resolves { ok, status, data }; never throws for HTTP errors.
    async api(role, url, { method = "GET", body } = {}) {
      const headers = { "Content-Type": "application/json" };
      const t = Session.token(role);
      if (t) headers["X-Auth-Token"] = t;
      const res = await fetch(url, {
        method,
        headers,
        cache: "no-store",
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      let data = null;
      try { data = await res.json(); } catch (e) {}
      if (res.status === 401 && data && data.code === "unauthenticated") {
        Session.clear(role);
        Session.toLogin(role);
      }
      return { ok: res.ok, status: res.status, data: data || {} };
    },

    loginUrl(role) {
      const here = location.pathname.split("/").pop() + location.search;
      return `auth.html?role=${role}&next=${encodeURIComponent(here)}`;
    },

    toLogin(role) {
      location.replace(Session.loginUrl(role));
    },

    // Page guard. Redirects to sign-in when there is no token at all.
    // With a token, re-validates in the background; a network failure is
    // tolerated (the rider app must keep detecting crashes offline).
    guard(role, { onUser } = {}) {
      if (!Session.token(role)) {
        Session.toLogin(role);
        return null;
      }
      Session.api(role, "api/auth.php?action=me")
        .then(({ ok, data }) => {
          if (ok && data.user) {
            Session.save(role, null, data.user);
            if (onUser) onUser(data.user);
          }
        })
        .catch(() => {});
      return Session.user(role);
    },

    async logout(role) {
      try { await Session.api(role, "api/auth.php?action=logout", { method: "POST" }); } catch (e) {}
      Session.clear(role);
      location.replace(`auth.html?role=${role}`);
    },

    initials(name) {
      return String(name || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
    }
  };

  window.AccidioxSession = Session;
})();
