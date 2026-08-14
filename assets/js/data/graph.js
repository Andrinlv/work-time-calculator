/* ==========================================================================
   ZEITKONTO — Microsoft Graph
   --------------------------------------------------------------------------
   Dünne Hülle um die wenigen Aufrufe, die die App braucht. Graph ist
   CORS-fähig, deshalb genügt hier `fetch` — kein Zwischenserver nötig.

   Wichtig ist `calendarView` statt `events`: nur diese Sicht löst
   Serientermine in einzelne Vorkommen auf. Wer `events` abfragt, bekommt
   den Serienkopf und muss die Wiederholungsregel selbst auswerten — eine
   verlässliche Quelle für Fehler.
   ========================================================================== */
(function (root) {
  "use strict";
  var ZK = root.ZK = root.ZK || {};

  var BASE = "https://graph.microsoft.com/v1.0";

  /* Nur die Felder holen, die gebraucht werden — spart Bandbreite und
     vermeidet, dass unnötige Inhalte überhaupt das Gerät erreichen. */
  var EVENT_FIELDS = [
    "id", "subject", "start", "end", "isAllDay", "showAs", "categories",
    "sensitivity", "type", "seriesMasterId", "isCancelled", "responseStatus"
  ].join(",");

  function createGraph(auth) {
    /**
     * @param {String} path   z. B. "/me/calendars"
     * @param {Object} opts   { query, timeZone, signal }
     */
    function request(path, opts) {
      opts = opts || {};
      return auth.getToken().then(function (token) {
        var url = path.indexOf("http") === 0 ? path : BASE + path;
        if (opts.query) {
          var qs = new URLSearchParams(opts.query).toString();
          url += (url.indexOf("?") >= 0 ? "&" : "?") + qs;
        }
        var headers = { Authorization: "Bearer " + token };
        if (opts.timeZone) headers.Prefer = 'outlook.timezone="' + opts.timeZone + '"';

        return fetch(url, { headers: headers, signal: opts.signal });
      }).then(function (res) {
        if (res.status === 401) throw graphError("Anmeldung abgelaufen", 401);
        if (res.status === 403) throw graphError("Zugriff auf den Kalender nicht erlaubt", 403);
        if (res.status === 429) {
          var wait = parseInt(res.headers.get("Retry-After") || "5", 10);
          throw graphError("Zu viele Anfragen — in " + wait + " s erneut versuchen", 429);
        }
        if (!res.ok) {
          return res.text().then(function (body) {
            throw graphError(extractMessage(body) || ("Graph antwortete mit " + res.status), res.status);
          });
        }
        return res.json();
      });
    }

    function graphError(message, status) {
      var err = new Error(message);
      err.status = status;
      return err;
    }

    function extractMessage(body) {
      try {
        var data = JSON.parse(body);
        return data && data.error && data.error.message ? String(data.error.message).split("\n")[0] : null;
      } catch (e) { return null; }
    }

    /** Folgt @odata.nextLink, bis alles geladen ist. */
    function requestAll(path, opts, maxPages) {
      var out = [];
      var pages = 0;
      var limit = maxPages || 25;

      function step(next) {
        return request(next, opts).then(function (data) {
          out = out.concat(data.value || []);
          pages++;
          var link = data["@odata.nextLink"];
          if (link && pages < limit) return step(link);
          return out;
        });
      }
      return step(path);
    }

    /* ------------------------------------------------------------------ */
    /* Aufrufe                                                             */
    /* ------------------------------------------------------------------ */

    function me() {
      return request("/me", { query: { $select: "displayName,mail,userPrincipalName" } });
    }

    function listCalendars() {
      return requestAll("/me/calendars", {
        query: { $select: "id,name,isDefaultCalendar,canEdit,owner", $top: 50 }
      }, 4);
    }

    /**
     * Termine eines Zeitraums, Serien bereits aufgelöst.
     * @param {Object} opts { from: "YYYY-MM-DD", to: "YYYY-MM-DD", calendarId, timeZone, signal }
     */
    function calendarView(opts) {
      opts = opts || {};
      var path = opts.calendarId && opts.calendarId !== "primary"
        ? "/me/calendars/" + encodeURIComponent(opts.calendarId) + "/calendarView"
        : "/me/calendarView";

      return requestAll(path, {
        timeZone: opts.timeZone,
        signal: opts.signal,
        query: {
          startDateTime: opts.from + "T00:00:00",
          endDateTime: opts.to + "T23:59:59",
          $select: EVENT_FIELDS,
          $orderby: "start/dateTime",
          $top: 200
        }
      }, opts.maxPages || 25);
    }

    return {
      request: request,
      me: me,
      listCalendars: listCalendars,
      calendarView: calendarView,
      EVENT_FIELDS: EVENT_FIELDS
    };
  }

  ZK.Graph = ZK.MsAuth ? createGraph(ZK.MsAuth) : null;
  ZK.createGraph = createGraph;
})(typeof self !== "undefined" ? self : this);
