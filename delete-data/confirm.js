/*
 * Confirm page logic for account deletion.
 *
 * Contract with the Cloud Functions (GubbiGo repo, functions/README.md section 16):
 *  - New emails link here with the secrets in the URL FRAGMENT:
 *      confirm.html#id=<requestId>&token=<token>&project=<firebaseProjectId>
 *    A fragment is never sent to a server, so it is not in any access log.
 *  - Links emailed before that change used the query string:
 *      confirm.html?id=…&token=…&finalize=<function url>
 *    They are accepted until they expire (tokens last 24 hours), and the
 *    `finalize` value is honoured only if it exactly equals an allowlisted URL.
 *
 * The page never takes a URL to call from the link. `project` selects an entry
 * of FINALIZE_URLS below; anything else is treated as an invalid link and no
 * request is made. Keep that list in step with the projects that send these emails.
 */
(function (root) {
  "use strict";

  var FINALIZE_URLS = {
    "gubbigo-firebase": "https://asia-south1-gubbigo-firebase.cloudfunctions.net/finalizeDeletion",
    "gubbigo-firebase-dev":
      "https://asia-south1-gubbigo-firebase-dev.cloudfunctions.net/finalizeDeletion",
  };

  // Functions emulator, for local testing against the static site on localhost only.
  var EMULATOR_PROJECT = /^[a-z0-9-]{6,30}$/;
  var REQUEST_ID = /^[A-Za-z0-9_-]{1,128}$/;
  var TOKEN = /^[A-Za-z0-9_-]{1,256}$/;

  function allowedUrls() {
    return Object.keys(FINALIZE_URLS).map(function (project) {
      return FINALIZE_URLS[project];
    });
  }

  function finalizeUrlForProject(project, hostname) {
    if (Object.prototype.hasOwnProperty.call(FINALIZE_URLS, project)) {
      return FINALIZE_URLS[project];
    }
    if ((hostname === "localhost" || hostname === "127.0.0.1") && EMULATOR_PROJECT.test(project)) {
      return "http://127.0.0.1:5001/" + project + "/asia-south1/finalizeDeletion";
    }
    return null;
  }

  /**
   * Reads the link. Returns { id, token, finalizeUrl } or null when it cannot be used.
   * `hash` and `search` are location.hash and location.search; `hostname` is location.hostname.
   */
  function resolveLink(hash, search, hostname) {
    var fromHash = new URLSearchParams(String(hash || "").replace(/^#/, ""));
    var fromQuery = new URLSearchParams(String(search || ""));

    var id;
    var token;
    var finalizeUrl = null;

    if (fromHash.get("id") && fromHash.get("token")) {
      id = fromHash.get("id");
      token = fromHash.get("token");
      finalizeUrl = finalizeUrlForProject(fromHash.get("project") || "", hostname);
    } else if (fromQuery.get("id") && fromQuery.get("token")) {
      // Legacy link. The URL it carries is used only if it is exactly one we allow.
      id = fromQuery.get("id");
      token = fromQuery.get("token");
      var legacy = fromQuery.get("finalize");
      if (legacy && allowedUrls().indexOf(legacy) !== -1) {
        finalizeUrl = legacy;
      }
    }

    if (!id || !token || !finalizeUrl || !REQUEST_ID.test(id) || !TOKEN.test(token)) {
      return null;
    }
    return { id: id, token: token, finalizeUrl: finalizeUrl };
  }

  /**
   * Maps a finalizeDeletion response to what the page should do.
   *  - 200 + outcome: finished (also a replay of a finished request).
   *  - 400: the link is invalid. Terminal.
   *  - anything else (409 already processing, 500 try again, network): try again, never final.
   */
  function interpretResponse(status, body) {
    if (status === 200 && body && typeof body.outcome === "string") {
      return { kind: "done", result: body.outcome };
    }
    if (status === 400) {
      return { kind: "done", result: "invalid" };
    }
    return { kind: "retry" };
  }

  var api = { resolveLink: resolveLink, interpretResponse: interpretResponse, FINALIZE_URLS: FINALIZE_URLS };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  // ---- browser ----
  var link = resolveLink(root.location.hash, root.location.search, root.location.hostname);

  // Take the secrets out of the address bar, history and any later screenshot or
  // copy-paste of the URL as soon as they have been read.
  root.history.replaceState(null, "", root.location.pathname);

  var errorBox = root.document.getElementById("link-error");
  var confirmBox = root.document.getElementById("confirm-box");
  if (!link) {
    errorBox.hidden = false;
    confirmBox.hidden = true;
    return;
  }

  var button = root.document.getElementById("delete-btn");
  var statusEl = root.document.getElementById("confirm-status");

  function setStatus(message, kind) {
    statusEl.textContent = message;
    statusEl.className = "form-status" + (kind ? " form-status-" + kind : "");
  }

  function finish(result) {
    // replace(), so Back does not return to a page whose secrets are already gone.
    root.location.replace("done.html?result=" + encodeURIComponent(result));
  }

  function retryLater() {
    button.disabled = false;
    setStatus(
      "Something went wrong. Wait a moment and try again, or email developer@xlang.in.",
      "warn"
    );
  }

  button.addEventListener("click", function () {
    button.disabled = true;
    setStatus("Deleting…");

    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, 40000);

    root
      .fetch(link.finalizeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: link.id, token: link.token }),
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      })
      .then(function (response) {
        return response
          .json()
          .catch(function () {
            return null;
          })
          .then(function (body) {
            return interpretResponse(response.status, body);
          });
      })
      .then(function (outcome) {
        if (outcome.kind === "done") {
          finish(outcome.result);
        } else {
          retryLater();
        }
      })
      .catch(retryLater)
      .then(function () {
        clearTimeout(timer);
      });
  });
})(typeof window !== "undefined" ? window : globalThis);
