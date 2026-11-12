"""
Serves one speech model over the OpenAI transcription API (POST /v1/audio/transcriptions, multipart
"file" = 16 kHz mono WAV) for models no native server runs: Underdog Bark 3.0 Plus (MLX), Bark 3.0
Pro (transformers on the GPU) and Musci-ASR (the qwen-asr package). Defaults only: no decoding
options beyond what each model's own example code uses.

    python transcription_server.py --model bark-plus|bark-pro|musci --path MODEL_DIR_OR_REPO --port N
"""
import argparse
import io
import json
import sys
from email.parser import BytesParser
from email.policy import default
from http.server import BaseHTTPRequestHandler, HTTPServer

import numpy as np
import soundfile


def load_bark_plus(path):
    sys.path.insert(0, path)
    import bark_mlx

    model = bark_mlx.load_model(f"{path}/model.bark", bits=16, cache_dir=f"{path}/mlx-converted")
    return lambda wave: bark_mlx.transcribe(model, wave, 16000)


def load_bark_pro(path):
    import torch
    from transformers import AutoProcessor, ParakeetForTDT

    processor = AutoProcessor.from_pretrained(path)
    model = ParakeetForTDT.from_pretrained(path, dtype=torch.bfloat16).to("mps").eval()

    def transcribe(wave):
        # As the model's own runtime/transcribe_bark_pro.py: 0.25 s of leading silence, then decode.
        padded = np.concatenate([np.zeros(4000, np.float32), wave])
        inputs = processor(padded, sampling_rate=16000, return_tensors="pt").to("mps", torch.bfloat16)
        with torch.inference_mode():
            output = model.generate(**inputs)
        ids = output.sequences if hasattr(output, "sequences") else output
        return processor.batch_decode(ids, skip_special_tokens=True)[0].strip()

    return transcribe


def load_musci(path):
    import torch
    from qwen_asr import Qwen3ASRModel

    model = Qwen3ASRModel.from_pretrained(path, dtype=torch.bfloat16, device_map="mps")
    return lambda wave: model.transcribe((wave, 16000), language="English")[0].text.strip()


LOADERS = {"bark-plus": load_bark_plus, "bark-pro": load_bark_pro, "musci": load_musci}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", choices=LOADERS, required=True)
    parser.add_argument("--path", required=True)
    parser.add_argument("--port", type=int, required=True)
    arguments = parser.parse_args()
    transcribe = LOADERS[arguments.model](arguments.path)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def reply(self, status, body):
            data = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            self.reply(200, {"status": "ok"})

        def do_POST(self):
            length = int(self.headers["content-length"])
            message = BytesParser(policy=default).parsebytes(
                f"content-type: {self.headers['content-type']}\r\n\r\n".encode() + self.rfile.read(length)
            )
            audio = next(part for part in message.iter_parts() if part.get_param("name", header="content-disposition") == "file")
            wave, rate = soundfile.read(io.BytesIO(audio.get_payload(decode=True)), dtype="float32")
            if wave.ndim > 1:
                wave = wave.mean(axis=1)
            if rate != 16000:
                raise ValueError("send 16 kHz audio")
            try:
                self.reply(200, {"text": transcribe(np.ascontiguousarray(wave))})
            except Exception as error:  # reported to the benchmark as a failed clip
                self.reply(500, {"error": str(error)})

    HTTPServer(("127.0.0.1", arguments.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
