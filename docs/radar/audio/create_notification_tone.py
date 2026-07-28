import math
import struct
import wave
from pathlib import Path

sample_rate = 22050


def synth(freq, duration, start=0.0, volume=0.9):
    n = int(sample_rate * duration)
    out = []
    for i in range(n):
        t = (start + i / sample_rate)
        v = math.sin(2 * math.pi * freq * t) * 0.6
        v += 0.35 * math.sin(2 * math.pi * freq * 1.5 * t)
        v *= math.exp(-3.0 * i / n)
        out.append(int(max(-32768, min(32767, v * volume * 12000))))
    return out

samples = []
for note, dur, start, vol in [(440.0, 0.10, 0.00, 0.95), (349.23, 0.11, 0.10, 0.9), (523.25, 0.14, 0.22, 0.95)]:
    samples.extend(synth(note, dur, start=start, volume=vol))

out_path = Path(__file__).with_name('notification-tone.wav')
with wave.open(str(out_path), 'wb') as wf:
    wf.setnchannels(1)
    wf.setsampwidth(2)
    wf.setframerate(sample_rate)
    wf.writeframes(b''.join(struct.pack('<h', x) for x in samples))

print(out_path.resolve())
