/* ==========================================================================
   ZEITKONTO — Anmeldung bei Microsoft (OAuth 2.0 mit PKCE)
   --------------------------------------------------------------------------
   Bewusst von Hand nach Spezifikation statt mit MSAL.js: die App soll ohne
   Fremdbibliotheken auskommen, offline lauffähig bleiben und sich weiterhin
   in eine einzelne Datei packen lassen.

   Verwendet wird der Authorization-Code-Flow mit PKCE (RFC 7636) gegen die
   Microsoft Identity Platform v2.0. Das ist der für Single-Page-Apps
   vorgesehene Weg:

     · kein Client-Secret — im Browser gäbe es dafür ohnehin kein Versteck
     · Code-Verifier bleibt im sessionStorage, nur der SHA-256-Hash geht raus
     · state und nonce werden gegen Rückläufer geprüft
     · Zugriffstoken lebt nur im Arbeitsspeicher
     · Refresh-Token liegt im localStorage — Microsoft gibt SPAs deshalb
       bewusst kurzlebige, einmalig verwendbare Refresh-Token aus

   Das ID-Token wird ausschliesslich gelesen, um Name und Konto anzuzeigen.
   Jede echte Berechtigungsprüfung macht Microsoft Graph serverseitig.
   ========================================================================== */
(function (root) {
  "use strict";
  var ZK = root.ZK = root.ZK || {};

  var STORE_KEY = "zeitkonto:ms-auth";
  var PENDING_KEY = "zeitkonto:ms-pending";
  var AUTHORITY = "https://login.microsoftonline.com/";

  /* Minimal nötige Berechtigungen — jede weitere erhöht die Hürde bei der
     Zustimmung, ohne dass die App sie bräuchte. */
  var DEFAULT_SCOPES = ["openid", "profile", "offline_access", "User.Read", "Calendars.Read"];

  function createAuth(options) {
    options = options || {};
    var cfg = {
      clientId: null,
      tenant: "common",
      scopes: DEFAULT_SCOPES.slice(),
      redirectUri: null
    };

    var accessToken = null;      // nur im Arbeitsspeicher
    var accessExpiresAt = 0;
    var refreshing = null;

    /* ------------------------------------------------------------------ */
    /* Konfiguration                                                       */
    /* ------------------------------------------------------------------ */

    function configure(patch) {
      Object.assign(cfg, patch || {});
      if (!cfg.redirectUri) cfg.redirectUri = defaultRedirectUri();
      return cfg;
    }

    function config() { return Object.assign({}, cfg); }

    /** Die Seite selbst, ohne Query und ohne Hash — muss in Azure so eingetragen sein. */
    function defaultRedirectUri() {
      if (typeof location === "undefined") return null;
      return location.origin + location.pathname;
    }

    /** OAuth braucht einen echten Origin; file:// scheidet damit aus. */
    function isSupported() {
      return typeof location !== "undefined" &&
        (location.protocol === "https:" ||
          location.hostname === "localhost" ||
          location.hostname === "127.0.0.1");
    }

    function isConfigured() { return !!cfg.clientId && isSupported(); }

    /* ------------------------------------------------------------------ */
    /* Speicher                                                            */
    /* ------------------------------------------------------------------ */

    function readState() {
      try {
        var raw = localStorage.getItem(STORE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    }

    function writeState(next) {
      try {
        if (next) localStorage.setItem(STORE_KEY, JSON.stringify(next));
        else localStorage.removeItem(STORE_KEY);
      } catch (e) { /* privater Modus — dann eben nur für diese Sitzung */ }
    }

    function account() {
      var st = readState();
      return st && st.account ? st.account : null;
    }

    function isSignedIn() {
      var st = readState();
      return !!(st && st.refreshToken);
    }

    /* ------------------------------------------------------------------ */
    /* PKCE                                                                */
    /* ------------------------------------------------------------------ */

    function randomString(bytes) {
      var buf = new Uint8Array(bytes || 32);
      crypto.getRandomValues(buf);
      return base64UrlFromBytes(buf);
    }

    function base64UrlFromBytes(bytes) {
      var bin = "";
      for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }

    function challengeFor(verifier) {
      return crypto.subtle
        .digest("SHA-256", new TextEncoder().encode(verifier))
        .then(function (digest) { return base64UrlFromBytes(new Uint8Array(digest)); });
    }

    /* ------------------------------------------------------------------ */
    /* Anmeldung starten                                                   */
    /* ------------------------------------------------------------------ */

    /**
     * Leitet zur Microsoft-Anmeldung weiter. Bewusst Redirect statt Popup:
     * Popups werden auf Mobilgeräten und in installierten PWAs oft blockiert.
     * @param {Object} opts { prompt: "select_account" | "consent", returnTo }
     */
    function signIn(opts) {
      opts = opts || {};
      if (!cfg.clientId) return Promise.reject(new Error("Keine Client-ID hinterlegt"));
      if (!isSupported()) return Promise.reject(new Error("Anmeldung braucht HTTPS"));

      var verifier = randomString(64);
      var state = randomString(16);
      var nonce = randomString(16);

      return challengeFor(verifier).then(function (challenge) {
        sessionStorage.setItem(PENDING_KEY, JSON.stringify({
          verifier: verifier,
          state: state,
          nonce: nonce,
          returnTo: opts.returnTo || location.hash || "",
          startedAt: Date.now()
        }));

        var params = new URLSearchParams({
          client_id: cfg.clientId,
          response_type: "code",
          redirect_uri: cfg.redirectUri,
          response_mode: "query",
          scope: cfg.scopes.join(" "),
          state: state,
          nonce: nonce,
          code_challenge: challenge,
          code_challenge_method: "S256"
        });
        if (opts.prompt) params.set("prompt", opts.prompt);
        if (opts.loginHint) params.set("login_hint", opts.loginHint);

        location.assign(AUTHORITY + encodeURIComponent(cfg.tenant) + "/oauth2/v2.0/authorize?" + params.toString());
      });
    }

    /* ------------------------------------------------------------------ */
    /* Rückkehr von der Anmeldung                                          */
    /* ------------------------------------------------------------------ */

    /** Steht ein Anmelde-Rückläufer in der Adresszeile? */
    function hasRedirect() {
      if (typeof location === "undefined") return false;
      var q = new URLSearchParams(location.search);
      return q.has("code") || q.has("error");
    }

    /**
     * Wertet den Rückläufer aus. Muss vor dem Router laufen und räumt die
     * Adresszeile auf, damit der Code nicht im Verlauf stehen bleibt.
     * @returns {Promise<{account, returnTo}|null>}
     */
    function handleRedirect() {
      if (!hasRedirect()) return Promise.resolve(null);

      var q = new URLSearchParams(location.search);
      var pending = null;
      try { pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null"); } catch (e) { pending = null; }
      sessionStorage.removeItem(PENDING_KEY);
      cleanUrl(pending && pending.returnTo);

      if (q.has("error")) {
        return Promise.reject(new Error(
          (q.get("error_description") || q.get("error") || "Anmeldung abgebrochen").split("\n")[0]
        ));
      }
      if (!pending) return Promise.reject(new Error("Anmeldung nicht zuordenbar — bitte erneut versuchen"));
      if (q.get("state") !== pending.state) return Promise.reject(new Error("Sicherheitsprüfung fehlgeschlagen (state)"));

      return exchange({
        grant_type: "authorization_code",
        code: q.get("code"),
        redirect_uri: cfg.redirectUri,
        code_verifier: pending.verifier
      }, pending.nonce).then(function (result) {
        return { account: result.account, returnTo: pending.returnTo || "" };
      });
    }

    function cleanUrl(returnTo) {
      try {
        history.replaceState(null, "", location.pathname + (returnTo || ""));
      } catch (e) { /* nicht kritisch */ }
    }

    /* ------------------------------------------------------------------ */
    /* Token holen und erneuern                                            */
    /* ------------------------------------------------------------------ */

    function exchange(body, expectedNonce) {
      var payload = new URLSearchParams(Object.assign({
        client_id: cfg.clientId,
        scope: cfg.scopes.join(" ")
      }, body));

      return fetch(AUTHORITY + encodeURIComponent(cfg.tenant) + "/oauth2/v2.0/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: payload.toString()
      }).then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) {
            var err = new Error(shortError(data));
            err.code = data.error;
            err.status = res.status;
            throw err;
          }
          return data;
        });
      }).then(function (data) {
        accessToken = data.access_token || null;
        accessExpiresAt = Date.now() + ((data.expires_in || 3600) - 120) * 1000;

        var claims = data.id_token ? readIdToken(data.id_token) : null;
        if (claims && expectedNonce && claims.nonce && claims.nonce !== expectedNonce) {
          throw new Error("Sicherheitsprüfung fehlgeschlagen (nonce)");
        }

        var previous = readState() || {};
        var next = {
          refreshToken: data.refresh_token || previous.refreshToken || null,
          account: claims ? {
            name: claims.name || claims.preferred_username || "",
            username: claims.preferred_username || claims.email || "",
            tenantId: claims.tid || null,
            oid: claims.oid || null
          } : previous.account || null,
          updatedAt: new Date().toISOString()
        };
        writeState(next);
        return { token: accessToken, account: next.account };
      });
    }

    function shortError(data) {
      if (!data) return "Unbekannter Fehler";
      var desc = data.error_description || data.error || "Unbekannter Fehler";
      return String(desc).split(/[\r\n]/)[0];
    }

    /**
     * Nutzlast des ID-Tokens lesen. Ohne Signaturprüfung — bewusst: der Wert
     * dient nur der Anzeige, und geholt wurde er über TLS direkt bei
     * Microsoft. Zugriffsentscheidungen trifft ausschliesslich Graph.
     */
    function readIdToken(idToken) {
      try {
        var part = idToken.split(".")[1];
        var padded = part.replace(/-/g, "+").replace(/_/g, "/");
        while (padded.length % 4) padded += "=";
        var json = decodeURIComponent(
          atob(padded).split("").map(function (c) {
            return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
          }).join("")
        );
        return JSON.parse(json);
      } catch (e) { return null; }
    }

    /** Gültiges Zugriffstoken — erneuert im Hintergrund, wenn nötig. */
    function getToken() {
      if (accessToken && Date.now() < accessExpiresAt) return Promise.resolve(accessToken);
      if (refreshing) return refreshing;

      var st = readState();
      if (!st || !st.refreshToken) return Promise.reject(new Error("Nicht angemeldet"));

      refreshing = exchange({
        grant_type: "refresh_token",
        refresh_token: st.refreshToken
      }).then(function (result) {
        refreshing = null;
        return result.token;
      }).catch(function (err) {
        refreshing = null;
        // Abgelaufene oder zurückgezogene Zustimmung: Anmeldung sauber verwerfen
        if (err.code === "invalid_grant" || err.status === 400) signOut();
        throw err;
      });
      return refreshing;
    }

    function signOut() {
      accessToken = null;
      accessExpiresAt = 0;
      writeState(null);
      try { sessionStorage.removeItem(PENDING_KEY); } catch (e) { /* egal */ }
    }

    return {
      DEFAULT_SCOPES: DEFAULT_SCOPES,
      configure: configure,
      config: config,
      defaultRedirectUri: defaultRedirectUri,
      isSupported: isSupported,
      isConfigured: isConfigured,
      isSignedIn: isSignedIn,
      account: account,
      signIn: signIn,
      signOut: signOut,
      hasRedirect: hasRedirect,
      handleRedirect: handleRedirect,
      getToken: getToken,
      readIdToken: readIdToken
    };
  }

  ZK.MsAuth = createAuth();
  ZK.MsAuth.create = createAuth;
})(typeof self !== "undefined" ? self : this);
