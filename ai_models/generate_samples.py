import wave
import struct
import math
import os
import random

def create_sample_wav(filepath, type_name, freq=440, duration=2.0, sr=16000):
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    num_samples = int(sr * duration)
    
    with wave.open(filepath, 'w') as wav_file:
        # Channels=1, SampleSize=2 bytes (16-bit), SampleRate=16000, Number of frames
        wav_file.setparams((1, 2, sr, num_samples, 'NONE', 'not compressed'))
        
        for i in range(num_samples):
            t = i / sr
            if type_name == 'clean_speech':
                # Simulating a multi-tone human voice (vowel-like formant structure)
                val = (0.5 * math.sin(2.0 * math.pi * freq * t) +
                       0.3 * math.sin(2.0 * math.pi * (freq * 2) * t) +
                       0.2 * math.sin(2.0 * math.pi * (freq * 3) * t))
            elif type_name == 'fan_hum':
                # Simulating 50Hz/60Hz AC electrical fan hum
                val = 0.8 * math.sin(2.0 * math.pi * 60 * t)
            elif type_name == 'white_noise':
                # Simulating static white noise
                val = random.uniform(-0.5, 0.5)
            else:
                val = 0.0
                
            # Clamp and scale to 16-bit integer range [-32768, 32767]
            val = max(-1.0, min(1.0, val))
            int_val = int(val * 32767.0)
            wav_file.writeframes(struct.pack('<h', int_val))
            
    print(f"Generated sample: {filepath}")

if __name__ == "__main__":
    base_dir = os.path.dirname(os.path.abspath(__file__))
    samples_dir = os.path.join(base_dir, 'dataset_samples')
    
    # Generate clean speech samples
    create_sample_wav(os.path.join(samples_dir, 'clean', 'clean_speech_1.wav'), 'clean_speech', freq=300)
    create_sample_wav(os.path.join(samples_dir, 'clean', 'clean_speech_2.wav'), 'clean_speech', freq=450)
    
    # Generate noise samples
    create_sample_wav(os.path.join(samples_dir, 'noise', 'fan_hum_noise.wav'), 'fan_hum')
    create_sample_wav(os.path.join(samples_dir, 'noise', 'static_white_noise.wav'), 'white_noise')
    
    print("\nAll dataset samples generated successfully inside 'ai_models/dataset_samples/'!")
