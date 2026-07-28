import math
import struct
import wave
from pathlib import Path

sample_rate = 22050


def synth(freq, duration, start=0.0, volume=0.9, fade_out_duration=0.04):
    n = int(sample_rate * duration)
    fade_out_samples = int(sample_rate * fade_out_duration)
    out = []
    for i in range(n):
        t = (start + i / sample_rate)
        v = math.sin(2 * math.pi * freq * t) * 0.6
        v += 0.35 * math.sin(2 * math.pi * freq * 1.5 * t)
        v *= math.exp(-3.0 * i / n)

        if fade_out_samples > 0 and i >= max(0, n - fade_out_samples):
            fade_index = (i - (n - fade_out_samples)) / fade_out_samples
            fade = 1.0 - fade_index
            v *= fade

        out.append(int(max(-32768, min(32767, v * volume * 12000))))
    return out


def append_tail(samples, duration=0.30):
    if not samples:
        return

    tail_samples = int(sample_rate * duration)
    last_value = samples[-1]
    for i in range(tail_samples):
        fade = 1.0 - (i + 1) / tail_samples
        samples.append(int(last_value * fade))


samples = []
for note, dur, start, vol in [(440.0, 0.10, 0.00, 0.95), (349.23, 0.11, 0.10, 0.9), (523.25, 0.14, 0.22, 0.95)]:
    samples.extend(synth(note, dur, start=start, volume=vol, fade_out_duration=0.04))

append_tail(samples, duration=0.30)

out_path = Path(__file__).with_name('notification-tone.wav')
with wave.open(str(out_path), 'wb') as wf:
    wf.setnchannels(1)
    wf.setsampwidth(2)
    wf.setframerate(sample_rate)
    wf.writeframes(b''.join(struct.pack('<h', x) for x in samples))

print(out_path.resolve())
