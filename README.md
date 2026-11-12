[![Voicebench by kevinschaich](https://kevinschaich.com/og/voicebench.png)](https://kevinschaich.com/project/voicebench/)

# Voicebench

Which speech model hears real people best, and fastest?

**[Try it →](https://kevinschaich.com/project/voicebench/)**

## How it works

Volunteers read the same twenty lines (`script/reading-script.md`), things people say to a voice
assistant, into their own phones. English only for now; the results page states how many speakers and
lines each result rests on. Every recording goes through open speech-to-text models running
locally on a Mac, one model at a time, each with its engine's default settings.

- **Accuracy** is word error rate: substitutions, deletions and insertions against the script, pooled
  across every speaker, after lower-casing, removing punctuation and treating number words, digits and
  contractions as equal.
- **Latency** is the time from the end of each spoken line to its final text. Each recording is cut into
  lines once with Silero VAD, and every model gets the same cuts. Streaming models hear the whole
  recording at real speed instead and are timed from the end of each line to its last word.
- Engines: [CrispASR](https://github.com/CrispStrobe/CrispASR) for most models, llama.cpp's
  `llama-server` for the speech models it supports, and a small Python runner for models that ship only
  Python code.

`results/voicebench.json` has every number, plus the hardware, engine and package versions, and the
checksum of each model file and recording, so a run can be reproduced exactly.

Recordings are anonymous (`speaker-01` …). Audio is published only for speakers who agreed to it.

## Privacy

Volunteers stay anonymous, and a check enforces it before every commit and push (and in CI over all
history). Anything it doesn't explicitly allow fails:

- **Recordings** are rewritten as bare WAVs with no tags, so the phone's model, OS, recording ID, creation
  time and location never enter the repo. Originals are never copied.
- **Nothing about the person**: speakers are only `speaker-01`, `speaker-02` …, with no age, accent,
  region, device or anything else.
- **Speech**: words a speaker said that aren't in the script (a name, a place) block the commit until
  someone listens and marks them harmless.
- **Commits** that carry participant data are made as "Voicebench" at midnight UTC, so they show no name,
  email, time of day or timezone. Commit messages may not contain emails, phone numbers or links.

### Publishing recordings

Drop volunteers' files into `recordings/` as they arrive (any format: M4A, CAF, MP3, WAV). Being in that
folder means the speaker agreed to take part and to their audio being published. Then:

```sh
bun install       # once: switches on the checks
bun run publish
```

That scrubs each file into the next `speaker-NN.wav`, moves the original to the Trash, checks everything,
commits the recordings as "Voicebench" and pushes. Then start a run (Voicebench in Outpost, or below): it
transcribes them with every model and publishes the results. If a check fails, nothing is committed: fix what it
names. Don't bypass the checks with `--no-verify`, and add recordings only from a Mac with the checks on,
never through GitHub's web upload. Once something identifying is pushed, it can't be taken back.

## Run locally

```sh
bun install && bun run setup   # engines and models (about 40 GB), once
bun run worker                 # serves the benchmark's tasks (leave it running)
bun run bench                  # starts a run: every model; `-- --models a,b` for some, `--force` to redo all
bun run dev                    # the results site
```

Needs Apple Silicon, macOS, Node 24, bun, ffmpeg, Python 3.11 and the Hugging Face CLI (`hf`).

