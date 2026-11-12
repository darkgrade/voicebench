"""
Finds where each utterance in the recording ends, once, so every model is measured from the same
points. Silero VAD with its defaults, except that a pause must last END_OF_UTTERANCE_SECONDS to end
an utterance (Silero's default of 0.1 s splits mid-sentence at every breath).

    python find_utterances.py RECORDING.wav OUTPUT.json
"""
import json
import sys

import soundfile
import torch
from silero_vad import get_speech_timestamps, load_silero_vad

END_OF_UTTERANCE_SECONDS = 0.5


def main():
    recording_path, output_path = sys.argv[1], sys.argv[2]
    wave, rate = soundfile.read(recording_path, dtype="float32")
    if rate != 16000:
        raise ValueError("expects 16 kHz mono")
    speech = get_speech_timestamps(
        torch.from_numpy(wave),
        load_silero_vad(),
        sampling_rate=16000,
        min_silence_duration_ms=int(END_OF_UTTERANCE_SECONDS * 1000),
        return_seconds=True,
    )
    utterances = [{"startSeconds": part["start"], "endSeconds": part["end"]} for part in speech]
    with open(output_path, "w") as output:
        json.dump({"detector": "silero-vad 6.2.1", "endOfUtteranceSeconds": END_OF_UTTERANCE_SECONDS, "utterances": utterances}, output, indent=2)
    print(f"{len(utterances)} utterances")


if __name__ == "__main__":
    main()
