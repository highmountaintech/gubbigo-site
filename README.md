# GubbiGo site

Public pages for [GubbiGo](https://github.com/highmountaintech/gubbigo): about, [privacy](./privacy/), [terms](./terms/), [support](./support/), and [delete my data](./delete-data/).

The mobile app lives in a separate private repository. This repo is only the website (GitHub Pages).

After Pages is enabled (Settings → Pages → Source: GitHub Actions), the site is:

`https://highmountaintech.github.io/gubbigo-site/`

Point a custom domain (for example `gubbigo.yourdomain.com`) at this Pages site and paste `https://gubbigo.yourdomain.com/privacy/` into the Google Play Console. Use `https://gubbigo.yourdomain.com/delete-data/` as the account deletion URL.

The delete-data form writes a request to Firestore (`deletionRequests`); a confirmation link is then emailed by the Cloud Functions and finished on `confirm.html`. If the page's script fails to load (ad blocker, outage), the form falls back to a native POST to [FormSubmit](https://formsubmit.co/), which emails `developer@xlang.in`; the first live fallback submission sends a confirmation link to that inbox, which you click once. reCAPTCHA Enterprise App Check for the form is off until `APP_CHECK_SITE_KEY` is set in `delete-data/index.html` (the key is public; register it under Firebase console, App Check, this web app first).

## Account deletion confirm page

`delete-data/confirm.html` + `delete-data/confirm.js` are the last step of the account-deletion flow. The Cloud Functions live in the app repo (`functions/`, section 16 of its README is the contract).

- Emails link here with the secrets in the URL **fragment**: `confirm.html#id=…&token=…&project=<firebaseProjectId>`. A fragment is never sent to a server, so it is not in any access log. The script reads it, then removes it from the address bar (`history.replaceState`).
- `project` selects the `finalizeDeletion` URL from the `FINALIZE_URLS` allowlist in `confirm.js`. The page never calls a URL taken from the link. **When a Firebase project is added or renamed, update `FINALIZE_URLS` and the `connect-src` in the page's Content-Security-Policy together.**
- Links emailed before the fragment change (`?id=…&token=…&finalize=…`) still work until they expire (24 hours); their `finalize` value is used only if it exactly equals an allowlisted URL. Remove that branch from `confirm.js` once those links have expired, together with the `confirmDeletion` function.
- The page loads no third-party resources (no web fonts) and sets `referrer: no-referrer` and a CSP meta tag, because GitHub Pages cannot send headers.
- `409` and `500` from `finalizeDeletion` leave the button usable ("try again"); only `200` with an outcome, or `400` (invalid), takes the user to `done.html`.

Tests (no dependencies, Node 20+): `node --test tests/confirm.test.js`.
