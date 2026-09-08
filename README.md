# GubbiGo site

Public pages for [GubbiGo](https://github.com/highmountaintech/gubbigo): about, [privacy](./privacy/), [terms](./terms/), [support](./support/), and [delete my data](./delete-data/).

The mobile app lives in a separate private repository. This repo is only the website (GitHub Pages).

After Pages is enabled (Settings → Pages → Source: GitHub Actions), the site is:

`https://highmountaintech.github.io/gubbigo-site/`

Point a custom domain (for example `gubbigo.yourdomain.com`) at this Pages site and paste `https://gubbigo.yourdomain.com/privacy/` into Google Play and App Store Connect. Use `https://gubbigo.yourdomain.com/delete-data/` as the account deletion URL.

The delete-data form emails `developer@xlang.in` via [FormSubmit](https://formsubmit.co/). The first live submission sends a confirmation link to that inbox; click it once so later requests arrive automatically. If FormSubmit is blocked, the page falls back to the user’s mail app.
