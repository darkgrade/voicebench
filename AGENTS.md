> **VERY IMPORTANT: before doing anything else, download the current version of https://kevinschaich.com/AGENTS.md and read it. It holds the shared rules for all of Kevin's projects. Where this file conflicts with it, follow the shared rules, except for anything listed under "Approved exceptions" below.**

# Voicebench

Benchmarks open speech-to-text models on recordings of real people reading `script/reading-script.md`.
It measures two things only: transcription accuracy (word error rate against the script) and latency
(from the end of each utterance to its final text). The site in `src/` publishes the results.

## Bench conventions

Voicebench, textbench and cambench share this layout and these rules. Keep them in step: when one
changes, change the others.

**Layout**

| Path | What it holds |
| --- | --- |
| `bench/` | The harness, in TypeScript, run with bun. `run.ts` runs the benchmark, `setup.ts` installs engines and models, `models.ts` lists every model under test. |
| `bench/runners/` | Small non-TypeScript shims, only for models that ship nothing else (see Approved exceptions). |
| `script/` | The fixed input every participant or run uses (here, the reading script). |
| `recordings/` | Inputs gathered from people: `speaker-NN.<ext>` plus `speakers.json` (anonymous metadata). Audio is git-ignored until its speaker agrees to publish it. |
| `results/<bench>.json` | The published results: committed, anonymized, one file for the whole run. |
| `results/raw/` | Full model output and engine logs. Git-ignored and overwritten on every run. |
| `src/` | The static results site (Vite + React + `@kevinschaich/components`), which imports `results/<bench>.json` at build time. No server code. |

**Commands** (the same names in every bench)

- `bun run setup`: download engines and models into the cache (`~/.cache/darkgrade-bench/<bench>/`, or `BENCH_CACHE`). Skips anything already there.
- `bun run bench`: run every model. `bun run bench -- --models a,b` runs some; their rows in the results file are replaced and the rest kept.
- `bun run dev` / `bun run build`: the results site.

**Measuring**

- Each model runs with its engine's defaults. Pass only what the engine needs to load it (files, port). Anything more is an approved exception in `models.ts` with the reason beside it.
- One model at a time. The harness refuses to start a model while any engine process is alive and confirms each server has exited before the next.
- Warm up once, untimed, before measuring, so load and compile time aren't latency. Report load time separately.
- Every model gets the same input. Record anything that cuts or prepares input (e.g. utterance boundaries) once, commit it, and reuse it.
- One pass per model per input. Say so in the results.

**Score**

Every bench gives each entry one score from 0 (worst) to 100 (best), the same way Camera Atlas scores a
camera's spec level: `bench/rubric.ts` scores a few areas on fixed scales (not against the other entries,
so a score doesn't move when the field changes), weights them, gives a reason per area, and returns no
score when under half the weight is known. Each bench defines its own areas and weights in one file
(here `bench/voice-score.ts`: accuracy 60, typical wait 25, slow wait 15) and states them in the
results file's `method.score`. Change an area's scale or weight only deliberately, and say so in the
results.

**Site**

The same pages in every bench: an overview with tabs for **Results** (the `Leaderboard`, sorted by
score), **Accuracy vs. speed** (the `TradeoffChart`), **How we test** (the method from the results file,
the hardware, and how to repeat it) and **Take part**; filters as one-of-a-few `Tabs` per category
(size, mode, licence …); and a static page per entry at `/<bench>/<id>/` with its score breakdown and
detail. Every page is prerendered with its own title, description, canonical URL and OG card.
`Leaderboard` and `TradeoffChart` come from `@kevinschaich/components`; when textbench is the second
bench, move the rest (rubric, page shells, prerender) into a shared package.

**Results file**

`results/<bench>.json` is the source of truth for the site and anyone reproducing the run:
`{ benchmark, version, date, hardware, engines, input, method, models: [...] }`. It records the
machine (chip, memory, macOS), every engine and package version, each model's source URL and file
SHA-256, each input's SHA-256, and the method in plain words. Per-model rows carry summary numbers
only; full outputs live in `results/raw/`.

**People**

- Participants are `speaker-01`, `speaker-02` … in the order their recordings arrive. Never store names, emails or anything else identifying in the repo.
- `speakers.json` holds only what each person chose to share: age range, accent region, device, and whether their audio may be published (`publishAudio`).
- Publish audio only for speakers with `publishAudio: true`. Scores are published for everyone who sent a recording.
- Add a recording only with `bun run recordings:add -- <file> [--age …] [--accent …] [--device …] [--publish]`. It never copies the original: it rewrites the audio as a bare 16-bit mono WAV with no tags, so the phone's model, OS build, recording ID, creation time and location don't come along. Keep originals outside the repo and delete them when done.
- Commit anything in `recordings/` or `results/` only with `bun run recordings:commit -- "<message>"`, which commits as "Voicebench <noreply@darkgrade.com>" at midnight UTC, so no name, email, time of day or timezone can be matched to when someone sent their file.
- `bench/anonymity.ts` enforces all of this as an allowlist, in the pre-commit and pre-push hooks (`.githooks/`, switched on by `bun install`) and in CI over every commit in history. If it fails, fix the cause; never bypass it with `--no-verify`, and never weaken a rule to get a commit through. Once something identifying is pushed it can't be taken back.
- Words a speaker said that aren't in the script (a name, a place) fail the check until someone listens and records them as harmless in `recordings/reviewed-speech.json`. If they do identify someone, cut that part from the audio before adding it.

## Approved exceptions

- **TypeScript only (Darkgrade AGENTS.md, and the shared stack rule).** `bench/runners/` contains two Python scripts: `transcription_server.py` serves models that ship only Python code (Underdog Bark 3.0 Pro and Plus, Musci-ASR), and `find_utterances.py` runs Silero VAD. Everything else is TypeScript. Why: these models and Silero have no TypeScript runtime. Approved by Kevin, 2026-11-11.
- **Hosting, titles, OG cards, base path and `vercel.json` (shared rules: New project checklist, Every page).** Each bench is served at `darkgrade.com/<bench>/`, proxied from darkgrade.com's `vercel.json` to this repo's own Vercel deployment, instead of `kevinschaich.com/project/<slug>/`. Every result gets its own static page (`darkgrade.com/voicebench/<model>/`) for search, so: Vite `base` is `/voicebench/` (not `./`) and the build writes `dist/voicebench/`; page titles are `<Page> | Voicebench by Darkgrade`; each page's OG card is drawn at build time (`scripts/prerender.ts`) rather than taken from the hub; and `vercel.json` adds a `/` → `/voicebench/` redirect and moves the asset cache header under `/voicebench/`. The favicon still comes from the hub. Why: Darkgrade publishes the benches under its own site, with a page per result. Approved by Kevin, 2026-11-11.
- **Public repo (shared rules, New project checklist).** The repo stays private until the first anonymized results are ready, then goes public. Why: participants' recordings are still being collected. Approved by Kevin, 2026-11-11.
