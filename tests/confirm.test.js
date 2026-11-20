// Run with: node --test tests/
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const { resolveLink, interpretResponse, FINALIZE_URLS } = require("../delete-data/confirm.js");

const PROD = "https://asia-south1-gubbigo-firebase.cloudfunctions.net/finalizeDeletion";
const DEV = "https://asia-south1-gubbigo-firebase-dev.cloudfunctions.net/finalizeDeletion";
const SITE = "gubbigo.xlang.in";
const TOKEN = "AbC_def-0123456789AbC_def-0123456789AbC_def";

test("reads id, token and project from the fragment", () => {
  assert.deepEqual(resolveLink(`#id=req1&token=${TOKEN}&project=gubbigo-firebase`, "", SITE), {
    id: "req1",
    token: TOKEN,
    finalizeUrl: PROD,
  });
  assert.equal(
    resolveLink(`#id=req1&token=${TOKEN}&project=gubbigo-firebase-dev`, "", SITE).finalizeUrl,
    DEV
  );
});

test("never takes a URL to call from the link", () => {
  const evil = "https://evil.example/steal";
  // Unknown project, or a URL smuggled in as the project: invalid, nothing is sent.
  assert.equal(resolveLink(`#id=r&token=${TOKEN}&project=${encodeURIComponent(evil)}`, "", SITE), null);
  assert.equal(resolveLink(`#id=r&token=${TOKEN}&project=other-project`, "", SITE), null);
  assert.equal(resolveLink(`#id=r&token=${TOKEN}`, "", SITE), null);
  // A finalize parameter in the fragment is ignored, not trusted.
  assert.equal(
    resolveLink(`#id=r&token=${TOKEN}&project=gubbigo-firebase&finalize=${encodeURIComponent(evil)}`, "", SITE)
      .finalizeUrl,
    PROD
  );
});

test("accepts a legacy query link only when finalize is exactly an allowlisted URL", () => {
  const q = (finalize) => `?id=req1&token=${TOKEN}&finalize=${encodeURIComponent(finalize)}`;
  assert.deepEqual(resolveLink("", q(PROD), SITE), { id: "req1", token: TOKEN, finalizeUrl: PROD });
  assert.equal(resolveLink("", q(DEV), SITE).finalizeUrl, DEV);
  for (const bad of [
    "https://evil.example/finalizeDeletion",
    PROD + "/extra",
    PROD + "?x=1",
    "https://asia-south1-gubbigo-firebase.cloudfunctions.net.evil.example/finalizeDeletion",
    "",
  ]) {
    assert.equal(resolveLink("", q(bad), SITE), null, bad);
  }
  assert.equal(resolveLink("", `?id=req1&token=${TOKEN}`, SITE), null);
});

test("the fragment wins over a query string", () => {
  const link = resolveLink(
    `#id=frag&token=${TOKEN}&project=gubbigo-firebase`,
    `?id=query&token=${TOKEN}&finalize=${encodeURIComponent(DEV)}`,
    SITE
  );
  assert.equal(link.id, "frag");
  assert.equal(link.finalizeUrl, PROD);
});

test("rejects malformed ids and tokens", () => {
  const ok = (id, token) => resolveLink(`#id=${id}&token=${token}&project=gubbigo-firebase`, "", SITE);
  assert.ok(ok("a-b_C9", TOKEN));
  assert.equal(ok("", TOKEN), null);
  assert.equal(ok("has/slash", TOKEN), null);
  assert.equal(ok("a".repeat(129), TOKEN), null);
  assert.equal(ok("req1", "x".repeat(257)), null);
  assert.equal(ok("req1", "bad token"), null);
  assert.equal(ok("req1", ""), null);
  assert.equal(resolveLink("", "", SITE), null);
});

test("emulator URLs are only built when the site itself is on localhost", () => {
  const hash = `#id=r&token=${TOKEN}&project=demo-gubbigo`;
  assert.equal(resolveLink(hash, "", SITE), null);
  assert.equal(
    resolveLink(hash, "", "localhost").finalizeUrl,
    "http://127.0.0.1:5001/demo-gubbigo/asia-south1/finalizeDeletion"
  );
  assert.equal(resolveLink(`#id=r&token=${TOKEN}&project=${encodeURIComponent("a/../b")}`, "", "localhost"), null);
});

test("only a 200 outcome or a 400 is final; 409, 500 and the rest mean try again", () => {
  assert.deepEqual(interpretResponse(200, { outcome: "done" }), { kind: "done", result: "done" });
  assert.deepEqual(interpretResponse(200, { outcome: "expired" }), { kind: "done", result: "expired" });
  assert.deepEqual(interpretResponse(400, { outcome: "invalid" }), { kind: "done", result: "invalid" });
  assert.deepEqual(interpretResponse(400, null), { kind: "done", result: "invalid" });
  for (const status of [405, 409, 500, 502, 503]) {
    assert.deepEqual(interpretResponse(status, { error: "x" }), { kind: "retry" }, String(status));
  }
  assert.deepEqual(interpretResponse(200, null), { kind: "retry" });
  assert.deepEqual(interpretResponse(200, {}), { kind: "retry" });
});

test("the allowlist is exactly the two projects", () => {
  assert.deepEqual(Object.keys(FINALIZE_URLS).sort(), ["gubbigo-firebase", "gubbigo-firebase-dev"]);
});

// ---- the page, run against a minimal fake browser ----

function runPage({ hash = "", search = "", hostname = SITE, response }) {
  const source = fs.readFileSync(path.join(__dirname, "../delete-data/confirm.js"), "utf8");
  const calls = { replaceState: [], fetch: [], replace: [] };
  const elements = {
    "link-error": { hidden: true },
    "confirm-box": { hidden: false },
    "delete-btn": { disabled: false, handlers: {}, addEventListener(e, h) { this.handlers[e] = h; } },
    "confirm-status": { textContent: "", className: "" },
  };
  const window = {
    location: {
      hash, search, hostname, pathname: "/delete-data/confirm.html",
      replace: (url) => calls.replace.push(url),
    },
    history: { replaceState: (...args) => calls.replaceState.push(args) },
    document: { getElementById: (id) => elements[id] },
    fetch: async (url, init) => {
      calls.fetch.push({ url, init });
      return response();
    },
  };
  // `module` is deliberately absent, so the script takes its browser branch.
  vm.runInNewContext(source, {
    window, globalThis: window, AbortController, setTimeout, clearTimeout, URLSearchParams, JSON, Object, String, encodeURIComponent,
  });
  return { elements, calls };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const reply = (status, body) => () => ({ status, json: async () => body });

test("page: strips the secrets from the address bar, then deletes only on click", async () => {
  const { elements, calls } = runPage({
    hash: `#id=req1&token=${TOKEN}&project=gubbigo-firebase`,
    response: reply(200, { outcome: "done" }),
  });
  assert.deepEqual(calls.replaceState, [[null, "", "/delete-data/confirm.html"]]);
  assert.equal(elements["link-error"].hidden, true);
  assert.equal(calls.fetch.length, 0, "nothing is sent before the button is clicked");

  elements["delete-btn"].handlers.click();
  await settle();

  assert.equal(calls.fetch.length, 1);
  const { url, init } = calls.fetch[0];
  assert.equal(url, PROD);
  assert.equal(init.method, "POST");
  assert.deepEqual(JSON.parse(init.body), { id: "req1", token: TOKEN });
  assert.equal(init.referrerPolicy, "no-referrer");
  assert.equal(init.credentials, "omit");
  assert.deepEqual(calls.replace, ["done.html?result=done"]);
});

test("page: an unusable link shows the error and sends nothing", async () => {
  const { elements, calls } = runPage({ hash: "#id=req1&token=x&project=evil.example", response: reply(200, {}) });
  assert.equal(elements["link-error"].hidden, false);
  assert.equal(elements["confirm-box"].hidden, true);
  assert.equal(calls.fetch.length, 0);
  assert.equal(calls.replaceState.length, 1, "secrets are stripped even for a rejected link");
});

test("page: 409 and 500 leave the button usable instead of showing a result", async () => {
  for (const status of [409, 500]) {
    const { elements, calls } = runPage({
      hash: `#id=req1&token=${TOKEN}&project=gubbigo-firebase`,
      response: reply(status, { error: "try_again" }),
    });
    elements["delete-btn"].handlers.click();
    await settle();
    assert.equal(calls.replace.length, 0, String(status));
    assert.equal(elements["delete-btn"].disabled, false, String(status));
    assert.match(elements["confirm-status"].textContent, /try again/i);
  }
});

test("page: a network failure is retryable, and a 400 is a final 'invalid'", async () => {
  const failing = runPage({
    hash: `#id=req1&token=${TOKEN}&project=gubbigo-firebase`,
    response: () => { throw new Error("offline"); },
  });
  failing.elements["delete-btn"].handlers.click();
  await settle();
  assert.equal(failing.calls.replace.length, 0);
  assert.equal(failing.elements["delete-btn"].disabled, false);

  const invalid = runPage({
    hash: `#id=req1&token=${TOKEN}&project=gubbigo-firebase`,
    response: reply(400, { outcome: "invalid" }),
  });
  invalid.elements["delete-btn"].handlers.click();
  await settle();
  assert.deepEqual(invalid.calls.replace, ["done.html?result=invalid"]);
});
