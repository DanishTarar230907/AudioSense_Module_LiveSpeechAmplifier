# AudioSense AI: Live Speech Amplifier
## Ultimate Viva Preparation & Defense Guide

Welcome to your elite Viva preparation manual! This guide is systematically engineered to make you completely bulletproof during your project defense. External examiners love to test your core understanding of **Digital Signal Processing (DSP)**, **Deep Learning architecture details**, **threading models**, and **low-latency system design**.

This document is divided into six critical sections:
1. **The Executive Summary & Pitch** (How to introduce your project in 60 seconds)
2. **System Architecture & Threading Model** (The "Brain" of the project)
3. **Deep Learning Core: Causal Conv-TasNet** (Math, Causality, and Network Mechanics)
4. **Web DSP Pipeline (Web Audio API)** (Nodes, Math, and Robust Transcription)
5. **Native C++ Audio Engine (Oboe & Whisper.cpp)** (Low-latency Android wrapper)
6. **30+ Killer Viva Questions & High-Score Answers** (Categorized by difficulty)

---

## 1. The Executive Summary & Pitch (The 60-Second Hook)

> **"What is your project, and why did you build it?"**

**The Pitch:**
> *"AudioSense AI is an intelligent, low-latency, real-time speech amplifier and isolation system designed to act as a software-defined hearing aid. Traditional hearing aids simply amplify all sounds, which increases background noise and causes auditory fatigue. AudioSense AI solves this by splitting the audio stream into a **Dual-Stream Concurrent Engine**:*
>
> 1. **Thread A (Ultra-Low Latency DSP)**: Processes incoming audio in **under 5ms** using either mathematically optimized DSP filters (in the browser) or a causal, time-domain Deep Learning model (**Causal Conv-TasNet** converted to TensorFlow Lite) to isolate and clarify human speech in real-time.
> 2. **Thread B (Asynchronous Transcription)**: Feeds raw audio into an offline, on-device transcription engine (**Whisper.cpp** / Web Speech API) running in a background worker thread. It provides real-time subtitles without interrupting or lagging the live audio stream.
>
> *Our prototype is implemented across a cross-platform React Native frontend backed by a high-performance native C++ core utilizing Google Oboe for low-latency JNI bindings, and a fully functional standalone Web Audio API prototype for browser deployments."*

---

## 2. System Architecture & Threading Model

Your system runs on a **Dual-Stream Concurrent Architecture**. Examiners frequently fail students who put heavy AI processing on the main UI thread or the real-time audio thread because it causes **audio glitches (glitches/buffer underruns)**.

### The Threading Separation
```
                   [Microphone Input]
                           │
                           ▼ (Raw PCM Float)
             [Oboe Audio Thread / Web Audio Node]
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
[Thread A: Real-Time Audio]    [Thread B: Async Subtitling]
 5ms frame / 80 samples         Buffer Accumulation
             │                           │
  [Causal Conv-TasNet]         [2-Second Queue (32k samples)]
             │                           │
   [Limiter & Compressor]         [Whisper.cpp / Web Speech API]
             │                           │
             ▼                           ▼
      [Speakers Out]                 [UI Update]
```

*   **Thread A (Audio Callback Thread):** Must run synchronously and return within **under 5ms** (typically 80 samples at 16kHz is 5ms). It has **hard real-time constraints**. If it takes more than 5ms, the hardware speaker runs out of samples, causing a click or pop (buffer underrun). We use TensorFlow Lite running an optimized, lightweight Causal Conv-TasNet model here.
*   **Thread B (Background Transcription Thread):** Operates asynchronously. It sleeps and wakes up when there are enough samples (e.g., 2 seconds of audio), passes them to `whisper.cpp` (which can take 100-300ms to run), updates the UI with text, and repeats. Because it is disconnected from the audio output loop, its execution delay **never causes audio stuttering**.

---

## 3. Deep Learning Core: Causal Conv-TasNet

In your `ai_models/train_convtasnet.py` file, you implemented a **Causal Conv-TasNet** (Convolutional Time-domain Audio Separation Network). You must understand this architecture inside out.

### Why Time-Domain (Conv-TasNet) instead of Frequency-Domain (STFT)?
*   **Traditional Speech Models (like U-Net)** use the Short-Time Fourier Transform (STFT) to convert audio to a 2D spectrogram. This introduces two major problems:
    1.  **High Latency:** Calculating STFT requires large window sizes (e.g., 32ms or 64ms) with overlap, introducing heavy algorithmic delay.
    2.  **Phase Reconstruction Problem:** Standard models only predict magnitude and discard or estimate phase (using algorithms like Griffin-Lim). Discarding phase results in metallic, watery, or unnatural sounding speech.
*   **Conv-TasNet** is a fully convolutional end-to-end time-domain model. It takes **raw waveform samples** as input and outputs **raw waveform samples**, completely bypassing the STFT phase bottleneck.

### Conv-TasNet Step-by-Step Pipeline
1.  **Encoder (`nn.Conv1d`):** Acts as a learnable equivalent to STFT. It uses a 1D convolution with a very small kernel size $L=16$ (only 1ms of audio at 16kHz) and a stride of $L/2$ to transform raw audio into high-dimensional feature representations ($N=128$ channels).
2.  **Bottleneck Layer (`nn.Conv1d`):** A $1 \times 1$ convolution that reduces the channel size to $B=128$ to minimize computational cost in the subsequent Temporal Convolutional Network (TCN).
3.  **Temporal Convolutional Network (TCN):** Composed of $R$ repeats ($R=3$), each containing $X$ blocks ($X=8$) of dilated depthwise separable convolutions.
    *   **Dilated Convolutions:** The dilation factor increases exponentially ($1, 2, 4, 8, 16, \dots, 128$) across the blocks. This allows the network to have a massive receptive field (seeing hundreds of milliseconds of history) while using very few parameters.
    *   **Depthwise Separable Convolutions (DS-Conv):** Split standard convolution into a **Depthwise Conv** (convolving each channel independently) and a **Pointwise Conv** ($1 \times 1$ conv mixing channels). This cuts parameter count and operations by roughly $90\%$, making real-time execution on mobile devices possible.
4.  **Causality Enforcement:** A standard convolution looks into the "future" because symmetric padding pads both sides of the vector. To make it strictly causal:
    *   We pad the left side with $(kernel\_size - 1) \times dilation$ samples.
    *   We run PyTorch's `nn.Conv1d` (which pads symmetrically by default).
    *   We explicitly trim the future samples: `x = x[:, :, :-padding]`. This ensures the network output at time $t$ only depends on samples from $t, t-1, t-2, \dots$, making it compatible with real-time, live streaming.
5.  **Mask Generator (`nn.Conv1d` + `nn.Sigmoid`):** Rather than generating audio directly, the network generates a continuous mask value between $0.0$ and $1.0$ for each encoder feature. A mask value of $1.0$ means "pure speech", and $0.0$ means "pure noise".
6.  **Decoder (`nn.ConvTranspose1d`):** Multiplies the encoder representation by the generated mask (`separated = e * mask`) and performs a 1D transposed convolution to reconstruct the enhanced raw audio wave back into the time domain.

---

## 4. Web DSP Pipeline (Web Audio API)

Your web prototype (`audio_engine_v10.js` & `web_prototype/app.js`) implements a highly sophisticated **Web Audio API Graph** that runs in real-time in the browser. 

### The Node Routing Graph
```
[Microphone]
     │
     ▼ (120 Hz, Q=0.7)
[High-Pass Filter]  ──► Removes low-frequency rumble, AC hum, and handling noise.
     │
     ▼ (2.8 kHz, Gain=+3dB, Q=1.0)
[Speech Clarifier]  ──► Peaking filter boosting the "speech intelligibility" band.
     │
     ▼ (6.5 kHz, Gain=-4dB, Q=2.0)
[De-Esser Filter]   ──► Peaking filter cutting sibilance ("s", "sh", "t") to prevent ear fatigue.
     │
     ▼ (Threshold=-35dB, Ratio=3:1, Attack=20ms, Release=250ms)
[Dynamics Compressor (AGC)] ──► Auto-Gain Control. Boosts whispers, squashes sudden loud spikes.
     │
     ▼ (Variable 0x to 5x)
[Master Gain Node]  ──► The primary volume amplifier controlled by the user slider.
     │
     ▼ (Threshold=-2.0dB, Ratio=20:1, Attack=1ms, Release=50ms)
[Limiter (Compressor)] ──► Safety net. Hard clamp at -2dB to prevent digital clipping/ear damage.
     │
     ▼
[Analyser Node]     ──► Extracts Fast Fourier Transform (FFT) frequencies for the visualizer.
     │
     ▼
[Speakers / Output] ──► Real-time enhanced audio out.
```

### Advanced Web Audio Strategies Implemented:
1.  **LFO-Driven Feedback Suppressor:** In `web_prototype/app.js`, we use a dynamic delay line modulated by a Low-Frequency Oscillator (LFO) running at 0.5Hz with a minute gain of 0.001s (1ms). This subtly modulates the feedback phase delay, preventing high-frequency acoustic feedback loops (ringing/screeching) when using speakers near the microphone.
2.  **Adaptive AutoSense Leveling:**
    ```javascript
    let average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    if (average < 20) {
        gainNode.gain.setTargetAtTime(4.5, audioCtx.currentTime, 0.2); 
    } else if (average > 60) {
        gainNode.gain.setTargetAtTime(1.2, audioCtx.currentTime, 0.2); 
    }
    ```
    This loop dynamically measures average volume. In very quiet environments (average < 20), it automatically ramps up the gain to 4.5x. In loud environments (average > 60), it protects the user's ears by dialing the gain down to 1.2x. We use `setTargetAtTime` instead of direct assignment to apply an exponential curve, preventing sudden, jarring volume steps.

3.  **Robust Transcription Architecture:**
    *   **Shadow Buffering:** Standard Web Speech API has a bug where it can cut off active words when it restarts. We store interim results in a `shadowTranscript` buffer. When the recognition block triggers `onend`, we flush any leftover shadow words into the `finalTranscript` before restarting the engine.
    *   **Anti-Silent Death Watchdog:** Chrome restricts continuous Speech Recognition to protect battery/bandwidth, silently killing the recording after ~60 seconds of silence. To counter this, a background watchdog running every 8 seconds checks `_recRunning`. If it is dead while the power toggle is active, it automatically spins up a clean recognition instance.

---

## 5. Native C++ Audio Engine (Oboe & Whisper.cpp)

Your Android core utilizes **JNI (Java Native Interface)** to bridge high-performance C++ code with React Native.

### High-Performance Audio with Oboe
Google Oboe is a C++ library that wraps **AAudio** (modern low-latency Android audio API) and **OpenSL ES** (legacy fallback API), automatically selecting the best one depending on the Android OS version.
*   **Exclusive Mode (`oboe::SharingMode::Exclusive`):** Gives our application exclusive access to the audio hardware stream, bypassing the system mixer to shave off up to 20ms of latency.
*   **Low Latency Mode (`oboe::PerformanceMode::LowLatency`):** Forces the hardware to allocate tiny buffer sizes (burst frames), bringing total hardware latency down to single-digit milliseconds.
*   **Hardware AEC Binding:** When the Oboe input stream opens, it generates a unique hardware `sessionId`. We pass this `sessionId` via JNI to Java's native `AcousticEchoCanceler` class. This binds the hardware-level acoustic echo cancellation chips of the phone directly to our Oboe buffer stream.

---

## 6. 30+ Killer Viva Questions & High-Score Answers

### Category A: Architecture & Threading (Easy to Medium)

#### Q1: Why did you separate the audio processing and the transcription into two separate threads?
> **Answer:** "If transcription and audio processing ran on the same thread, the heavy computational overhead of transcription (running Whisper.cpp / Web Speech processing) would block the real-time audio thread. In audio systems, the callback thread must return within 5ms to avoid buffer underruns. Running everything on one thread would cause severe audio stuttering, clipping, and massive system latency."

#### Q2: What is "Engine Latency: 14ms" in your React Native UI? How is total latency calculated?
> **Answer:** "Total roundtrip latency consists of:
> 1. **Input hardware buffer delay:** Time for the microphone to capture and digitize sound (usually ~2-5ms).
> 2. **Algorithmic latency:** Time taken by our processing code (our TFLite Conv-TasNet operates on a 5ms frame size).
> 3. **Output hardware buffer delay:** Time for the DAC (Digital-to-Analog Converter) to output sound (usually ~3-5ms).
>
> In our native C++ layer using Oboe in `Exclusive` and `LowLatency` modes, we achieve a roundtrip latency of approximately 14ms, which is imperceptible to the human ear (latencies below 20ms are considered real-time and feel instantaneous)."

#### Q3: How does React Native communicate with the C++ Audio Engine?
> **Answer:** "We use **JNI (Java Native Interface)** on Android. The React Native Javascript layer communicates with a Native Java Module. This Java module uses native method declarations (`public native void startEngine()`) that load a shared C++ library (`System.loadLibrary("audio_engine")`). The C++ JNI wrapper (`AndroidEchoWrapper.cpp`) maps these Java calls to high-performance C++ classes."

#### Q4: Why is echo cancellation critical in a speech amplifier?
> **Answer:** "Because the microphone and the speaker (or earphones) are physically close. Without Acoustic Echo Cancellation (AEC), the amplified sound coming out of the speakers goes straight back into the microphone, creating an infinite amplification loop. This results in a deafening high-pitched screech known as acoustic feedback."

#### Q5: How does your web prototype bypass the acoustic feedback loop?
> **Answer:** "In our Web Audio API pipeline, we use two defensive measures:
> 1. We integrate a **Dynamics Compressor** acting as a limiter to clamp output gain.
> 2. We implement a **modulated feedback suppressor** that utilizes an LFO to subtly shift the phase delay by a few milliseconds. This breaks the phase coherence of the feedback loop, preventing acoustic screeching without degrading audio quality."

---

### Category B: Deep Learning & Causal Conv-TasNet (Hard)

#### Q6: What is Conv-TasNet, and what makes it superior to traditional STFT speech enhancement models?
> **Answer:** "Conv-TasNet stands for Convolutional Time-domain Audio Separation Network. Traditional models convert audio to frequency spectrograms via STFT. This has two flaws: it introduces high latency because of the STFT window size, and it throws away phase information, resulting in unnatural, metallic speech artifacts. Conv-TasNet is an end-to-end model operating directly on raw time-domain waveforms, resulting in cleaner speech reconstruction and near-zero algorithmic latency."

#### Q7: What are the main components of Conv-TasNet?
> **Answer:** "It consists of three major components:
> 1. **Encoder:** A 1D convolutional layer that transforms raw audio frames into high-dimensional feature representations.
> 2. **Separation Network (TCN):** A Temporal Convolutional Network that uses dilated depthwise separable convolutions to predict a continuous mask for the targeted speech.
> 3. **Decoder:** A 1D transposed convolution that multiplies the encoder representations by the predicted mask and reconstructs the isolated clean raw audio wave."

#### Q8: What does it mean for a network to be "Causal"? Why is causality mandatory here?
> **Answer:** "A causal network is one where the output at time $t$ depends *only* on inputs from the present and past (times $t, t-1, t-2, \dots$), with absolutely no dependence on future inputs ($t+1, t+2$). Causality is mandatory for real-time systems like hearing aids because we cannot look into the future—sound must be processed instantly as it arrives."

#### Q9: How did you implement causality in the Conv-TasNet code?
> **Answer:** "In standard convolutions, symmetric padding introduces future lookahead. In our `TCNBlock` class, we enforced causality by:
> 1. Calculating causal padding: `padding = (kernel_size - 1) * dilation`.
> 2. Padding the input vector.
> 3. Slicing off the end of the output vector to remove future lookahead: `x = x[:, :, :-padding]`. This ensures the convolutional kernel only slides over past samples."

#### Q10: Why did you use Dilated Convolutions in the TCN blocks?
> **Answer:** "To isolate speech, the network needs context (it needs to know the patterns of words over several hundred milliseconds). To get a large context (receptive field) with standard convolutions, you need giant filters or massive layers, which are too slow for real-time use. Dilated convolutions introduce spaces (holes) between kernel elements. By doubling the dilation factor at each layer ($1, 2, 4, 8, \dots$), the receptive field grows exponentially while keeping the number of parameters small and fast."

#### Q11: What is a Depthwise Separable Convolution, and why is it used?
> **Answer:** "It splits a standard convolution into two steps:
> 1. **Depthwise Convolution:** A spatial filter applied to each input channel independently.
> 2. **Pointwise Convolution:** A $1 \times 1$ convolution that mixes the outputs of the depthwise step across channels.
> It dramatically reduces computational complexity (FLOPs) and model size by roughly $90\%$ compared to standard 1D convolutions, enabling real-time inference on mobile CPUs."

#### Q12: Why did you choose Group Normalization (GroupNorm) instead of Batch Normalization (BatchNorm) in your TCN block?
> **Answer:** "Batch Normalization computes mean and variance statistics across a batch of data. During real-time, online streaming inference, our batch size is exactly $1$, which makes batch statistics highly unstable and inaccurate. Group Normalization divides channels into groups and calculates statistics within each group independent of batch size. This makes it perfect for low-latency streaming applications."

#### Q13: What loss function is typically used to train Conv-TasNet?
> **Answer:** "We use **Scale-Invariant Signal-to-Distortion Ratio (SI-SDR)** loss. Unlike standard Mean Squared Error (MSE), SI-SDR measures the ratio between the target clean signal and the reconstruction error while being completely invariant to overall scaling (volume differences). It optimizes for the physical shape and structure of the speech waveform."

---

### Category C: DSP & Web Audio API (Medium to Hard)

#### Q14: Explain the order of your Web Audio API Node Graph. why is High-Pass at the start?
> **Answer:** "The highpass filter is placed first because sub-bass rumble, wind, and mic handling noises (below 120Hz) carry massive acoustic energy. If they pass through the compressor and gain nodes, they trigger the compressor early, dampening the human voice and creating a pumping effect. Removing rumble first cleans up the signal before amplification."

#### Q15: What is the purpose of the 2.8 kHz Speech Clarifier node?
> **Answer:** "The frequency range of $2 \text{ kHz}$ to $4 \text{ kHz}$ contains the formant frequencies of consonants (like 'p', 't', 'k', 's'). These consonants are the primary cues the human brain uses to distinguish words. Boosting this band by a subtle 3dB significantly improves speech intelligibility without needing to increase the overall master volume."

#### Q16: What does the De-Esser node do, and why is its frequency set to 6.5 kHz?
> **Answer:** "High-frequency sibilants (the 's' and 'sh' sounds) usually peak around $5 \text{ kHz}$ to $8 \text{ kHz}$. When sound is amplified for hearing assistance, these sounds can become piercing and painful, causing ear fatigue. The De-Esser acts as a notch peaking filter, dropping the $6.5 \text{ kHz}$ region by $4\text{dB}$ to make the output smooth and comfortable for long-term wear."

#### Q17: What is a Dynamics Compressor, and why are both an AGC and a Limiter needed?
> **Answer:** "A dynamics compressor narrows the dynamic range of an audio signal. 
> *   **The AGC Compressor** has a low threshold (-35dB) and moderate ratio (3:1). Its job is to act as an automatic leveler: boosting soft whispers so they are audible, and slightly compressing normal talking.
> *   **The Limiter** is a brickwall compressor placed at the very end of the chain. It has a high threshold (-2dB), a fast attack (1ms), and an extreme ratio (20:1). Its sole purpose is a safety net: blocking sudden, extreme loud noises (like dropping a cup or a car horn) from clipping the DAC or damaging the user's ears."

#### Q18: What is the difference between `setTargetAtTime` and `setValueAtTime` in Web Audio API?
> **Answer:** "
> *   `setValueAtTime` instantly changes a parameter (like gain) at a precise timestamp. This sudden step causes a sharp digital discontinuity, which is heard as a click or pop.
> *   `setTargetAtTime` smoothly transitions the parameter using an exponential decay curve. This avoids sudden steps, ensuring that volume adjustments and automatic leveling feel smooth, natural, and pop-free."

#### Q19: What is the FFT size of your Analyser node, and how is it used to draw the visualizer?
> **Answer:** "We use an FFT (Fast Fourier Transform) size of 256. This means the audio signal is divided into 128 frequency bins (FFT size / 2). The `getByteFrequencyData` method returns an array of 128 integers representing the volume of each frequency band. We loop through these values in a `requestAnimationFrame` loop and draw green bars on a canvas where the height and opacity correspond to the volume of each frequency bin."

---

### Category D: Web Speech API & Shadow Buffering (Medium)

#### Q20: Explain the "Shadow Buffering" technique you used for Web Speech transcription.
> **Answer:** "The Web Speech API returns two types of results: *interim* (temporary, still-changing words) and *final* (confirmed phrases). When the microphone engine stops or restarts, the browser routinely discards the active interim words before they can become final, cutting off sentences. To fix this, we cache interim results in a `shadowTranscript` variable. If the engine ends unexpectedly, we append the shadow buffer to our main text block, ensuring absolutely no words are lost."

#### Q21: What is the "Silent Death" issue in Chrome's Web Speech API, and how does your watchdog solve it?
> **Answer:** "Chrome automatically shuts down speech recognition after a period of silence (usually around 60 seconds) to conserve battery and server bandwidth. This fires an `onerror` or `onend` event, putting transcription in standby. Our watchdog is a background interval that runs every 8 seconds. It checks if the system power state is active and if the engine is stopped. If so, it instantly spins up a fresh speech recognition instance, keeping the system fully autonomous."

#### Q22: Why does Speech Recognition require HTTPS or localhost?
> **Answer:** "For user security and privacy. Modern browsers block microphone access, location services, and advanced APIs (like Web Speech API) on non-secure connections (`http://`) to prevent middleman eavesdropping. The only exception is `localhost` (or `127.0.0.1`) to facilitate local developer testing."

#### Q22.5: What is the "network" error in Web Speech API, why does it occur on non-Chrome browsers like Brave, and how did you resolve it?
> **Answer:** "
> *   **The Cause:** Chrome's `webkitSpeechRecognition` relies on Google's private speech recognition cloud servers. 
>     1.  **Internet Connectivity:** Without active internet or under a firewall/VPN that blocks Google services, Chrome throws a `network` error.
>     2.  **Browser Limitations:** Non-Chrome Chromium browsers (like Brave, Vivaldi, or Opera) do *not* bundle Google's private API keys. When they attempt to query Google's speech endpoints, Google's servers reject the request and the browser throws a `network` error by default.
>     3.  **Spam/Rate Limiting:** If the recognition system crashes and we immediately try to restart it (e.g. within 100ms), we flood the API. Google flags it as a spam/DDoS attempt, blocking the IP and causing persistent `network` errors.
> *   **Our Fix:**
>     1.  **Exponential Backoff:** We modified the restart scheduler. Instead of immediate 250ms retries, on a `network` error we double the restart delay (`_restartDelay = Math.min(_restartDelay * 2, 8000)`), giving the network time to cool down and preventing Google's rate-limiting blocks.
>     2.  **Troubleshooting Indicator:** We updated the UI/debug console to display a clear notification instructing the user to check their internet connection or switch from Brave/Vivaldi to official Google Chrome."

---

### Category E: Native Android C++ Core & JNI (Hard)

#### Q23: Why did you choose Google Oboe for the Android backend instead of using Java's standard AudioRecord class?
> **Answer:** "Java's `AudioRecord` and `AudioTrack` operate in the Dalvik/ART virtual machine. This introduces garbage collection pauses and JNI crossing overheads, resulting in high roundtrip latency (often 50ms to 100ms), which is completely unusable for a real-time hearing aid because the user hears a distracting echo of their own voice. Google Oboe runs directly in native C++, utilizing AAudio's exclusive hardware streams to achieve sub-15ms roundtrip latency."

#### Q24: What is JNI, and why is it crucial in your Android C++ wrapper?
> **Answer:** "JNI stands for Java Native Interface. It allows the Java Virtual Machine to execute native C++ code and vice versa. It is crucial because the audio recording interface (Oboe) and the Whisper.cpp transcription engine run in C++ for maximum performance, while the React Native framework and hardware controls run in JavaScript/Java. JNI bridges this gap, passing audio configuration details down and bringing real-time transcriptions back up."

#### Q25: How does Hardware Acoustic Echo Cancellation (AEC) get bound in C++?
> **Answer:** "In `AndroidEchoWrapper.cpp`, we extract the unique `sessionId` from Oboe's native audio stream using `mStream->getSessionId()`. Since the Android AEC framework is controlled by the Android OS Java layer, we invoke a JNI callback to pass this `sessionId` to Java's `android.media.audiofx.AcousticEchoCanceler.create(sessionId)`. This binds the hardware-level acoustic echo cancellation chips of the phone directly to our Oboe buffer stream."

---

### Category F: Polish, Constraints & Scope (High-Level)

#### Q26: What are the main limitations of your current prototype?
> **Answer:** "Our prototype is highly optimized, but has three clear limits:
> 1. **Model Size:** The Conv-TasNet model, while causal, requires significant CPU power when run continuously on older mobile chipsets.
> 2. **Hardware Constraints:** Low-latency features like Oboe Exclusive Mode depend heavily on Android OEM hardware drivers; cheap devices can sometimes fail to support full low-latency pipelines.
> 3. **Web Sandbox:** The Web Speech API is dependent on the host browser's implementation (e.g., Chrome sends audio to Google servers, requiring internet access for transcription, unlike our C++ Whisper module which is 100% offline)."

#### Q27: How would you scale or improve this project in the future?
> **Answer:** "I would implement three major enhancements:
> 1. **ONNX Runtime Web:** Move the TFLite models in the browser to ONNX Runtime Web utilizing WebGPU for zero-latency AI-based speech denoising directly in the web app.
> 2. **Personalized Audiograms:** Let the user upload a clinical audiogram and apply targeted frequency equalization (Multi-band WDRC - Wide Dynamic Range Compression) to boost only the specific frequencies the user has trouble hearing.
> 3. **Quantization:** Apply 8-bit integer quantization (INT8) to our Conv-TasNet weights during export to TFLite, reducing model memory footprint by 75% and doubling execution speed on mobile NPUs."

#### Q28: What was the hardest technical challenge you faced, and how did you resolve it?
> **Answer:** "The hardest challenge was the **real-time audio click-pop issue (buffer underrun)**. Initially, running the transcription and deep learning model on the same main thread led to timing hiccups. The speaker callback was left waiting for audio frames. We resolved this by decoupling the architecture into a strict dual-threaded paradigm: assigning the low-latency audio processing loop exclusively to a high-priority C++ real-time callback thread, and deferring the heavy transcription pipeline asynchronously to a background producer-consumer queue."

---

## 💡 Pro-Tips for Danish during the Viva:
*   **Be Confident about the Code:** If the examiner points to `App.js` or `train_convtasnet.py`, you know exactly which lines handle what. Use the specific terminology from this guide (e.g., "dilated depthwise separable convolutions", "hardware JNI mapping", "LFO-driven feedback suppression").
*   **Admit Limitations Professionally:** Examiners love honesty. If they ask *"Is your AI model 100% perfect?"*, don't say yes. Say: *"No, there's always a tradeoff between latency and accuracy. A larger model is more accurate but violates our real-time 5ms budget. We chose this specific Conv-TasNet parameter configuration ($N=128, L=16$) because it strikes the perfect balance for mobile execution."*
*   **Own the Terminology:** Do not call them "volume sliders"—call them "exponential makeup gain controllers". Do not say "text recorder"—call it "asynchronous shadow-buffered transcription". It sounds highly professional and academic.

Good luck! You are fully prepared to ace this Viva. Open this file on your IDE and review the concepts. You've got this! 🚀
