[![Voicebench by kevinschaich](https://kevinschaich.com/og/voicebench.png)](https://kevinschaich.com/project/voicebench/)

# Voicebench

Which speech model hears real people best, and fastest?

**[Try it →](https://kevinschaich.com/project/voicebench/)**

## How it works

Volunteers read the same twenty lines (`script/reading-script.md`), things people say to a voice
assistant, into their own phones. Every recording goes through open speech-to-text models running
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

## Run locally

```sh
bun install && bun run setup   # engines and models (about 40 GB), once
bun run bench                  # every model; `-- --models a,b` for some
bun run dev                    # the results site
```

Needs Apple Silicon, macOS, Node 24, bun, ffmpeg, Python 3.11 and the Hugging Face CLI (`hf`).
