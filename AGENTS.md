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
| `bench/` | The harness, in TypeScript, run with bun. `workflow.ts` is the benchmark as a workflow (Outpost's workflows: one task per model, smaller tasks under it, then `publish`), `run.ts` measures, `setup.ts` installs engines and models, `models.ts` lists every model under test. |
| `.claude-plugin/`, `outpost/` | The Outpost app: installed from this repository, it shows the workflow's runs live (Run, Run without cache, Cancel, Retry), and keeps a worker on the Mac running this repository's latest commit. It doesn't show the results: the site does. Never part of the public site. |
| `bench/runners/` | Small non-TypeScript shims, only for models that ship nothing else (see Approved exceptions). |
| `script/` | The fixed input every participant or run uses (here, the reading script). |
| `recordings/` | Inputs gathered from people: `speaker-NN.<ext>` plus `speakers.json` (anonymous metadata). Audio is git-ignored until its speaker agrees to publish it. |
| `results/<bench>.json` | The published results: committed, anonymized, one file for the whole run. |
| `results/raw/` | Full model output and engine logs. Git-ignored and overwritten on every run. |
| `src/` | The static results site (Vite + React + `@kevinschaich/components`), built from `results/` and the published recordings. No server code. |

**Commands** (the same names in every bench)

- `bun run setup`: download engines and models into the cache (`~/.cache/darkgrade-bench/<bench>/`, or `BENCH_CACHE`). Skips anything already there.
- `bun run worker`: serve the workflow's tasks on this Mac. In Outpost, `ops/worker.sh <bench>` keeps it running from Outpost's checkout; on its own it starts a development engine (nothing is published).
- `bun run bench`: start a run on the worker (every model; `-- --models a,b` for some, whose rows are replaced and the rest kept; `--force` redoes what earlier runs kept). In Outpost, start runs from the app instead: a run there ends by committing the results files to `main` through Outpost (`publish`), and Vercel deploys them.
- Results a task produced are kept (`results/raw/cache/`, git-ignored) under a key of everything that affects them (model files, input hashes, settings, harness code), so a run redoes only what changed.
- `bun run dev` / `bun run build`: the results site. Both run `bun run data` first (see Site).

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

Every bench's overview is a full-window set of views over the same published results, each view at its own
path so it can be linked and prerendered. The first is always the **Story**: every measurement as a point of
light (`src/kit/points.ts`, WebGL) that rearranges as captions scroll past (`src/kit/story.tsx`), ending in
the ranking with a link to every entry's page. Here the points are one word of the script as one model heard
it from one speaker, and the other views are **Listen** (a speaker's recording playing, with every model's
text landing as long after each line as it really took, and its mistakes marked against the script),
**Words** (the script with the words models miss most made large; pick one to see what was written instead
and who missed it), **Field** (word errors or score against wait, download or memory; its path is still
`tradeoff/`), **Compare** (two models side by side), **Table** (the `Leaderboard` with filters as
one-of-a-few `Tabs`; its path is `results/`), **Method** (how we test, the hardware, how to repeat it, and
the script) and **Take part**. Views link to each other with query strings read after the page loads, e.g.
`listen/?speaker=speaker-03&model=parakeet-ultra&utterance=7`.

- `src/kit/` (points, story, shell, theme) is the same in all three benches: change one, change the others.
  Move it, with the rubric and prerender, into a shared package when that is worth a release.
- `scripts/build-data.ts` (`bun run data`) runs before `vite` and `vite build`. It writes
  `public/data/heard.json` (for every model and speaker: how each script word came out, what was written for
  each spoken line and how long it took, which the views fetch), `public/data/waves.json` (each recording's
  loudness over time, so a waveform shows before any audio loads), `public/data/audio/` (the published WAVs
  of the speakers listed in the results file, copied unchanged and loaded only when someone presses play)
  and `src/facts.json` (the tallies the story's captions quote, bundled so they are prerendered). None of
  these is committed. Every number in a caption comes from the results, never typed in.
- `src/spoken.ts` divides a recording's word-by-word alignment into the lines as spoken and marks the wrong,
  dropped and added words in what was written. The build and each model's page both use it, with
  `bench/scoring.ts`'s normalizer, so they always agree with the scores.
- Long text (Method, Take part) is an `<article class="typeset typeset-kevinschaich">` with real headings,
  lists and tables (`src/views/method.tsx`).
- A static page per entry at `/<bench>/<id>/` (`src/entry.tsx`, `src/pages/model.tsx`), in the same frame as
  the overview: its score, every word it heard as points of light, its transcript of each speaker line by
  line with the recording and each line's wait, where it stands in the field and the words it missed most,
  all but the lights in the prerendered page. It loads only its own detail file (`src/details.ts`),
  separately from the overview's code. These are the pages search engines have indexed: never change their
  address, title, description or canonical URL, and keep their substance in the HTML.
- Every page is prerendered with its own title, description, canonical URL and OG card.

**Results file**

`results/<bench>.json` is the source of truth for the site and anyone reproducing the run:
`{ benchmark, version, date, hardware, engines, input, method, models: [...] }`. It records the
machine (chip, memory, macOS), every engine and package version, each model's source URL and file
SHA-256, each input's SHA-256, and the method in plain words. Per-model rows carry summary numbers
only; full outputs live in `results/raw/`.

**People**

- Participants are `speaker-01`, `speaker-02` … in the order their recordings arrive. Never store names, emails or anything else identifying in the repo.
- `speakers.json` holds only each speaker's number and file (`publishAudio` is always true). Nothing about the person: no age, accent, region, device or anything else.
- A file in `recordings/` means its speaker agreed to take part and to their audio being published.
- Add recordings only with `bun run publish`: it rewrites each new file in `recordings/` as a bare 16-bit mono WAV with no tags (so the phone's model, OS build, recording ID, creation time and location don't come along), moves the original to the Trash, and commits and pushes the recordings. Then run the workflow: its `publish` task commits the results.
- `bench/anonymity.ts` enforces all of this as an allowlist, in the pre-commit and pre-push hooks (`.githooks/`, switched on by `bun install`) and in CI over every commit in history. If it fails, fix the cause; never bypass it with `--no-verify`, and never weaken a rule to get a commit through. Once something identifying is pushed it can't be taken back.
- Take part links to a new GitHub issue with its title and description filled in (`src/pages/take-part.tsx`), for volunteers we aren't already in touch with. A recording that arrives that way is added with `bun run publish` like any other; the issue's author is never copied into the repo, and the page says the issue itself is public.
- Words a speaker said that aren't in the script (a name, a place) fail the check until someone listens and records them as harmless in `recordings/reviewed-speech.json`. If they do identify someone, cut that part from the audio before adding it.

## Approved exceptions

- **TypeScript only (Darkgrade AGENTS.md, and the shared stack rule).** `bench/runners/` contains two Python scripts: `transcription_server.py` serves models that ship only Python code (Underdog Bark 3.0 Pro and Plus, Musci-ASR), and `find_utterances.py` runs Silero VAD. Everything else is TypeScript. Why: these models and Silero have no TypeScript runtime. Approved by Kevin, 2026-11-11.
- **Hosting, titles, OG cards, base path and `vercel.json` (shared rules: New project checklist, Every page).** Each bench is served at `darkgrade.com/<bench>/`, proxied from darkgrade.com's `vercel.json` to this repo's own Vercel deployment, instead of `kevinschaich.com/project/<slug>/`. Every result gets its own static page (`darkgrade.com/voicebench/<model>/`) for search, so: Vite `base` is `/voicebench/` (not `./`) and the build writes `dist/voicebench/`; page titles are `<Page> | Voicebench by Darkgrade`; each page's OG card is drawn at build time (`scripts/prerender.ts`) rather than taken from the hub; and `vercel.json` adds a `/` → `/voicebench/` redirect and moves the asset cache header under `/voicebench/`. The favicon still comes from the hub. Why: Darkgrade publishes the benches under its own site, with a page per result. Approved by Kevin, 2026-11-11.
- **Public repo (shared rules, New project checklist).** The repo stays private until the first anonymized results are ready, then goes public. Why: participants' recordings are still being collected. Approved by Kevin, 2026-11-11.
