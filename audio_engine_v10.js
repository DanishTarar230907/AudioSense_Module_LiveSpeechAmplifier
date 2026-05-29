// AUDIOSENSE UNIVERSAL ENGINE (V11.0)
// Fixes: Echo removal, smooth amplification, reliable transcription
window.audioCtx = null;
window.analyser = null;
window.isEnabled = false;
window.finalTranscript = "";

const powerBtn = document.getElementById('powerBtn');
const statusText = document.getElementById('statusText');
const transcriptionBox = document.getElementById('transcriptionBox');
const debugConsole = document.getElementById('debugConsole');

if (debugConsole) debugConsole.innerText = "UNIVERSAL ENGINE: READY (V11.0)";

// ─── State for transcription robustness ───
let _recognitionRestarting = false;
let _restartTimer = null;

async function initAudio() {
    try {
        window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        // ── Get mic stream WITH echo cancellation + noise suppression ──
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true   // let the browser handle basic leveling
            }
        });

        const microphone = window.audioCtx.createMediaStreamSource(stream);

        // ── 1. HIGHPASS: remove rumble / handling noise (below 120 Hz) ──
        window.filterNode = window.audioCtx.createBiquadFilter();
        window.filterNode.type = 'highpass';
        window.filterNode.frequency.value = 120;
        window.filterNode.Q.value = 0.7;

        // ── 2. SPEECH PRESENCE BOOST: gentle clarity lift ──
        const clarifier = window.audioCtx.createBiquadFilter();
        clarifier.type = 'peaking';
        clarifier.frequency.value = 2800;
        clarifier.Q.value = 1.0;
        clarifier.gain.value = 3.0;  // subtle 3 dB — no ringing

        // ── 3. DE-ESS: tame sibilance to avoid harshness ──
        const deEss = window.audioCtx.createBiquadFilter();
        deEss.type = 'peaking';
        deEss.frequency.value = 6500;
        deEss.Q.value = 2.0;
        deEss.gain.value = -4.0;  // cut 4 dB of sibilance

        // ── 4. COMPRESSOR (AGC): smooth out volume differences ──
        const agc = window.audioCtx.createDynamicsCompressor();
        agc.threshold.setValueAtTime(-35, window.audioCtx.currentTime);
        agc.knee.setValueAtTime(20, window.audioCtx.currentTime);
        agc.ratio.setValueAtTime(3, window.audioCtx.currentTime);
        agc.attack.setValueAtTime(0.02, window.audioCtx.currentTime);
        agc.release.setValueAtTime(0.25, window.audioCtx.currentTime);

        // ── 5. MAKE-UP GAIN: the actual "amplifier" ──
        window.gainNode = window.audioCtx.createGain();
        window.gainNode.gain.value = 1.5;  // start conservative

        // ── 6. BRICKWALL LIMITER: safety net against clipping ──
        const limiter = window.audioCtx.createDynamicsCompressor();
        limiter.threshold.setValueAtTime(-2.0, window.audioCtx.currentTime);
        limiter.knee.setValueAtTime(0, window.audioCtx.currentTime);
        limiter.ratio.setValueAtTime(20, window.audioCtx.currentTime);
        limiter.attack.setValueAtTime(0.001, window.audioCtx.currentTime);
        limiter.release.setValueAtTime(0.05, window.audioCtx.currentTime);

        // ── 7. ANALYSER for the visualizer ──
        window.analyser = window.audioCtx.createAnalyser();
        window.analyser.fftSize = 256;

        // ── CHAIN: Mic → Highpass → Clarifier → De-Ess → AGC → Gain → Limiter → Analyser → Speakers ──
        microphone.connect(window.filterNode);
        window.filterNode.connect(clarifier);
        clarifier.connect(deEss);
        deEss.connect(agc);
        agc.connect(window.gainNode);
        window.gainNode.connect(limiter);
        limiter.connect(window.analyser);
        window.analyser.connect(window.audioCtx.destination);

        initProfileHandlers();
        initSliderHandlers();
        drawVisualizer();
        return true;
    } catch (err) {
        if (debugConsole) debugConsole.innerText = "ENGINE ERROR: " + err.message;
        return false;
    }
}

// ─── PROFILE HANDLERS ──────────────────────────────────────────
function initProfileHandlers() {
    const btns = document.querySelectorAll('.profile-btn');
    btns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            btns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            if (!window.filterNode || !window.audioCtx) return;
            const p = btn.dataset.profile;
            const t = window.audioCtx.currentTime;

            if (p === 'crowded') {
                // Focus on speech: bandpass centred on 1.5 kHz, wider Q
                window.filterNode.type = 'bandpass';
                window.filterNode.frequency.setTargetAtTime(1500, t, 0.15);
                window.filterNode.Q.setTargetAtTime(0.6, t, 0.15);
            } else if (p === 'street') {
                // Cut traffic rumble below 500 Hz
                window.filterNode.type = 'highpass';
                window.filterNode.frequency.setTargetAtTime(500, t, 0.15);
                window.filterNode.Q.setTargetAtTime(0.7, t, 0.15);
            } else {
                // 'quiet' — wide open, just cut sub-bass
                window.filterNode.type = 'highpass';
                window.filterNode.frequency.setTargetAtTime(120, t, 0.15);
                window.filterNode.Q.setTargetAtTime(0.7, t, 0.15);
            }
        });
    });
}

// ─── SLIDER HANDLERS ───────────────────────────────────────────
function initSliderHandlers() {
    const volSlider = document.getElementById('volumeSlider');
    const volVal = document.getElementById('volumeVal');
    const intSlider = document.getElementById('intensitySlider');
    const intVal = document.getElementById('intensityVal');

    if (volSlider) {
        volSlider.addEventListener('input', () => {
            const v = parseFloat(volSlider.value);
            if (window.gainNode) {
                window.gainNode.gain.setTargetAtTime(v, window.audioCtx.currentTime, 0.05);
            }
            if (volVal) volVal.textContent = Math.round((v / 5) * 100) + '%';
        });
    }

    if (intSlider) {
        intSlider.addEventListener('input', () => {
            const v = parseFloat(intSlider.value);
            if (intVal) intVal.textContent = Math.round(v * 100) + '%';
        });
    }
}

// ─── POWER BUTTON ──────────────────────────────────────────────
powerBtn.addEventListener('click', async () => {
    if (!window.audioCtx) {
        const success = await initAudio();
        if (!success) {
            statusText.innerText = "MIC ACCESS DENIED";
            return;
        }
        initTranscription();
        // Show controls after first init
        const controls = document.querySelector('.controls');
        if (controls) controls.style.display = 'block';
    }

    window.isEnabled = !window.isEnabled;

    if (window.isEnabled) {
        window.audioCtx.resume();
        safeStartRecognition();
        powerBtn.classList.add('on');
        statusText.innerText = "AUDIOSENSE ACTIVE";
    } else {
        window.audioCtx.suspend();
        safeStopRecognition();
        powerBtn.classList.remove('on');
        statusText.innerText = "STANDBY";
    }
});

// ─── TRANSCRIPTION ENGINE (robust) ─────────────────────────────
function initTranscription() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        if (debugConsole) debugConsole.innerText = "TRANSCRIPTION: Not supported — use Chrome.";
        transcriptionBox.innerHTML = `<span style="color:#ff4444">Speech Recognition not supported. Please use Chrome.</span>`;
        return;
    }

    window.recognition = new SR();
    window.recognition.continuous = true;
    window.recognition.interimResults = true;
    window.recognition.lang = 'en-US';
    window.recognition.maxAlternatives = 1;

    window.recognition.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                window.finalTranscript += transcript + ' ';
            } else {
                interim += transcript;
            }
        }

        // Show final in white, interim (in-progress) in dim gray
        transcriptionBox.innerHTML =
            `<span>${window.finalTranscript}</span>` +
            `<span style="color:#666">${interim}</span>`;
        transcriptionBox.scrollTop = transcriptionBox.scrollHeight;
    };

    window.recognition.onerror = (event) => {
        // 'no-speech' and 'aborted' are normal — just restart silently
        if (event.error === 'no-speech' || event.error === 'aborted') {
            scheduleRestart(300);
            return;
        }
        if (debugConsole) debugConsole.innerText = "TRANSCRIPTION ERROR: " + event.error;
        if (event.error === 'not-allowed') {
            transcriptionBox.innerHTML += `<br><span style="color:#ff4444">[Microphone denied — use HTTPS or localhost]</span>`;
        } else if (event.error === 'network') {
            // Network blip — retry after short delay
            scheduleRestart(1000);
        }
    };

    window.recognition.onend = () => {
        // Only auto-restart if the system is supposed to be active
        if (window.isEnabled && !_recognitionRestarting) {
            scheduleRestart(200);
        }
    };
}

function scheduleRestart(delayMs) {
    if (_restartTimer) clearTimeout(_restartTimer);
    _restartTimer = setTimeout(() => {
        safeStartRecognition();
    }, delayMs);
}

function safeStartRecognition() {
    if (!window.recognition || !window.isEnabled) return;
    _recognitionRestarting = true;
    try {
        window.recognition.start();
    } catch (e) {
        // Already running — that's fine
    }
    _recognitionRestarting = false;
}

function safeStopRecognition() {
    if (_restartTimer) clearTimeout(_restartTimer);
    if (!window.recognition) return;
    _recognitionRestarting = true;
    try {
        window.recognition.stop();
    } catch (e) {}
    _recognitionRestarting = false;
}

// ─── VISUALIZER ────────────────────────────────────────────────
function drawVisualizer() {
    requestAnimationFrame(drawVisualizer);
    if (!window.analyser || !window.isEnabled) return;

    const canvas = document.getElementById('visualizer');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const data = new Uint8Array(window.analyser.frequencyBinCount);
    window.analyser.getByteFrequencyData(data);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const bw = canvas.width / data.length;

    for (let i = 0; i < data.length; i++) {
        const h = data[i] / 2.5;
        const alpha = data[i] / 255;
        ctx.fillStyle = `rgba(0, 255, 102, ${alpha * 0.8})`;
        ctx.fillRect(i * bw, canvas.height - h, bw - 1, h);
    }
}
