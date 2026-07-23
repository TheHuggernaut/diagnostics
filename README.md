# Nona Biosystems

Freeform notes in. Structured threads out.

Nona parses journal notes into mood and habit data, tracks macros from
plain-language meal descriptions, and draws the weave: mood trends
against the habits that move them.

## Get it on your phone (no computer required)

1. Upload this repo to GitHub (public or private with Pages enabled).
2. In the repo: Settings → Pages → Source → **GitHub Actions**.
3. Push to `main` (or run the workflow manually under Actions).
   The included workflow builds and deploys automatically.
4. Open the Pages URL on your phone.
5. First run: paste your Anthropic API key into the setup panel.
   It is stored only in that browser, never in the repo.
6. Browser menu → **Add to Home Screen**. Nona installs like an app.

## Local development

```
npm install
npm run dev
```

## Notes

- Data lives in localStorage, per device. No sync, no server, no account.
- Never commit an API key to this repo. The setup panel is the only
  place a key should ever be entered.
