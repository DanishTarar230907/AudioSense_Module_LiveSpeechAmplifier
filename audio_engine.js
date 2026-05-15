window.audioCtx = null;
window.analyser = null;
window.isEnabled = false;
window.finalTranscript = "";

const powerBtn = document.getElementById('powerBtn');
const statusText = document.getElementById('statusText');
const transcriptionBox = document.getElementById('transcriptionBox');
const debugConsole = document.getElementById('debugConsole');

if (debugConsole) debugConsole.innerText = "BT OPTIMIZED (V7.0)";

async function initAudio() {
    try {
        // --- THE FIX: Request Ultra-Low Latency ---
        window.audioCtx = new (window.AudioContext || window.webkitAudioContext)({
            latencyHint: 'interactive',
            sampleRate: 44100
        });

        // --- THE FIX: Enable Echo Cancellation for Bluetooth ---
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            } 
        });
        
        const microphone = window.audioCtx.createMediaStreamSource(stream);
        const preAmp = window.audioCtx.createGain();
        preAmp.gain.value = 4.0;

        const hissKiller = window.audioCtx.createBiquadFilter();
        hissKiller.type = 'lowpass';
        hissKiller.frequency.value = 5000; 

        const gate = window.audioCtx.createDynamicsCompressor();
        gate.threshold.setValueAtTime(-45, window.audioCtx.currentTime);

        const gainNode = window.audioCtx.createGain();
        gainNode.gain.value = 1.0;

        window.analyser = window.audioCtx.createAnalyser();
        
        microphone.connect(preAmp);
        preAmp.connect(hissKiller);
        hissKiller.connect(gate);
        gate.connect(gainNode);
        gainNode.connect(window.analyser);
        window.analyser.connect(window.audioCtx.destination);
        
        drawVisualizer();
        return true;
    } catch (err) {
        if (debugConsole) debugConsole.innerText = "BT ERROR: " + err.message;
        return false;
    }
}

powerBtn.addEventListener('click', async () => {
    if (!window.audioCtx) {
        const success = await initAudio();
        if (!success) return;
        initTranscription();
    }
    window.isEnabled = !window.isEnabled;
    if (window.isEnabled) {
        window.audioCtx.resume();
        if (window.recognition) try { window.recognition.start(); } catch(e) {}
        powerBtn.classList.add('on');
        statusText.innerText = "BT ACTIVE";
    } else {
        window.audioCtx.suspend();
        if (window.recognition) window.recognition.stop();
        powerBtn.classList.remove('on');
        statusText.innerText = "STANDBY";
    }
});

function initTranscription() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    window.recognition = new SpeechRecognition();
    window.recognition.continuous = true;
    window.recognition.interimResults = true;
    window.recognition.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) window.finalTranscript += event.results[i][0].transcript + " ";
            else interim = event.results[i][0].transcript;
        }
        transcriptionBox.innerHTML = `<span>${window.finalTranscript + interim}</span>`;
        transcriptionBox.scrollTop = transcriptionBox.scrollHeight;
    };
    window.recognition.onend = () => { if (window.isEnabled) window.recognition.start(); };
}

function drawVisualizer() {
    requestAnimationFrame(drawVisualizer);
    if (!window.analyser) return;
    const canvas = document.getElementById('visualizer');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const data = new Uint8Array(window.analyser.frequencyBinCount);
    window.analyser.getByteFrequencyData(data);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const barWidth = (canvas.width / 128);
    for(let i = 0; i < 128; i++) {
        const h = data[i] / 4;
        ctx.fillStyle = "#00ff66";
        ctx.fillRect(i * barWidth, canvas.height - h, barWidth - 1, h);
    }
}
