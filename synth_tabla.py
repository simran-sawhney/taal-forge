import math
import struct
import random
import os

SR = 44100

def generate_osc(freq, duration, decay, harmonics, amplitudes, decay_mults, is_bayan=False):
    length = int(SR * duration)
    signal = [0.0] * length
    
    for h, amp, d_mult in zip(harmonics, amplitudes, decay_mults):
        phase = 0.0
        for i in range(length):
            t = i / SR
            if is_bayan:
                # pitch glide down
                f_env = freq * h * math.exp(-12 * t)
                phase += f_env * 2 * math.pi / SR
            else:
                phase += freq * h * 2 * math.pi / SR
                
            env = math.exp(-t / (decay * d_mult))
            
            # fast attack
            if t < 0.005:
                env *= (t / 0.005)
                
            signal[i] += amp * env * math.sin(phase)
            
    return signal

def add_noise_transient(length, decay):
    noise = [0.0] * length
    for i in range(length):
        t = i / SR
        env = math.exp(-t / decay)
        noise[i] = (random.random() * 2 - 1) * env
    return noise

def add_signals(sig1, sig2):
    length = max(len(sig1), len(sig2))
    out = [0.0] * length
    for i in range(length):
        v1 = sig1[i] if i < len(sig1) else 0.0
        v2 = sig2[i] if i < len(sig2) else 0.0
        out[i] = v1 + v2
    return out

def save_wav(filename, signal):
    max_val = max(max(signal), -min(signal))
    if max_val == 0: max_val = 1
    
    with open(filename, 'wb') as f:
        # WAV header
        data_length = len(signal) * 2
        f.write(b'RIFF')
        f.write(struct.pack('<I', 36 + data_length))
        f.write(b'WAVEfmt ')
        f.write(struct.pack('<IHHIIHH', 16, 1, 1, SR, SR * 2, 2, 16))
        f.write(b'data')
        f.write(struct.pack('<I', data_length))
        
        # Audio data
        for s in signal:
            val = int((s / max_val) * 0.8 * 32767) # -2dB
            if val > 32767: val = 32767
            if val < -32768: val = -32768
            f.write(struct.pack('<h', val))

def generate_dayan(freq, duration, is_tin=False, is_ti=False):
    harmonics = [1.0, 2.0, 2.9, 3.9, 4.8]
    if is_tin:
        amplitudes = [0.2, 1.0, 0.5, 0.1, 0.05]
        decay_mults = [1.0, 0.8, 0.5, 0.3, 0.1]
    elif is_ti:
        amplitudes = [0.8, 0.4, 0.2, 0.1, 0.05]
        decay_mults = [0.2, 0.1, 0.05, 0.05, 0.05]
    else: # Na / Ta
        amplitudes = [1.0, 0.4, 0.2, 0.1, 0.05]
        decay_mults = [1.0, 0.6, 0.4, 0.2, 0.1]
        
    sig = generate_osc(freq, duration, 0.4, harmonics, amplitudes, decay_mults)
    noise = add_noise_transient(len(sig), 0.015)
    
    out = [0.0] * len(sig)
    for i in range(len(sig)):
        out[i] = sig[i] + noise[i] * 0.05
    return out

def generate_bayan(freq, duration, is_open=True):
    harmonics = [1.0, 2.1, 3.2]
    amplitudes = [1.0, 0.3, 0.1]
    
    if is_open:
        decay = 0.8
        decay_mults = [1.0, 0.5, 0.2]
        sig = generate_osc(freq, duration, decay, harmonics, amplitudes, decay_mults, is_bayan=True)
        noise = add_noise_transient(len(sig), 0.03)
        out = [0.0] * len(sig)
        for i in range(len(sig)): out[i] = sig[i] + noise[i] * 0.03
        return out
    else:
        decay = 0.1
        decay_mults = [0.2, 0.1, 0.1]
        sig = generate_osc(freq*1.5, duration, decay, harmonics, amplitudes, decay_mults, is_bayan=False)
        noise = add_noise_transient(len(sig), 0.02)
        out = [0.0] * len(sig)
        for i in range(len(sig)): out[i] = sig[i] + noise[i] * 0.15
        return out

os.makedirs('public/audio/tabla', exist_ok=True)

print("Generating samples...")
ta = generate_dayan(320, 1.0, is_tin=False)
tin = generate_dayan(320, 1.0, is_tin=True)
ti = generate_dayan(420, 0.3, is_ti=True)
ge = generate_bayan(125, 1.5, is_open=True)
ka = generate_bayan(140, 0.3, is_open=False)

dha = add_signals(ta, ge)
dhin = add_signals(tin, ge)

save_wav('public/audio/tabla/ta.wav', ta)
save_wav('public/audio/tabla/na.wav', ta)
save_wav('public/audio/tabla/tin.wav', tin)
save_wav('public/audio/tabla/ti.wav', ti)
save_wav('public/audio/tabla/ge.wav', ge)
save_wav('public/audio/tabla/ka.wav', ka)
save_wav('public/audio/tabla/dha.wav', dha)
save_wav('public/audio/tabla/dhin.wav', dhin)
save_wav('public/audio/tabla/kat.wav', add_signals(ka, ti))

print("Samples generated!")
