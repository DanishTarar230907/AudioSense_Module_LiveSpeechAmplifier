// ABSOLUTE STABILITY CORE (V9.0)
window.audioCtx = null;
window.analyser = null;
window.isEnabled = false;
window.finalTranscript = "";

const powerBtn = document.getElementById('powerBtn');
const statusText = document.getElementById('statusText');
const transcriptionBox = document.getElementById('transcriptionBox');
const debugConsole = document.getElementById('debugConsole');

if (debugConsole) debugConsole.innerText = "ABSOLUTE SILENCE (V9.0)";

async function initAudio() {
    try {
        window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const microphone = window.audioCtx.createMediaStreamSource(stream);
        
        window.preAmp = window.audioCtx.createGain();
        window.preAmp.gain.value = 0; // Start Muted

        // THE HISS KILLER
        const hissFilter = window.audioCtx.createBiquadFilter();
        hissFilter.type = 'lowpass';
        hissFilter.frequency.value = 4500; // Even tighter focus

        const compressor = window.audioCtx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-30, window.audioCtx.currentTime);

        window.analyser = window.audioCtx.createAnalyser();
        
        microphone.connect(window.preAmp);
        window.preAmp.connect(hissFilter);
        hissFilter.connect(compressor);
        compressor.connect(window.analyser);
        window.analyser.connect(window.audioCtx.destination);
        
        runAutoSense();
        drawVisualizer();
        return true;
    } catch (err) {
        if (debugConsole) debugConsole.innerText = "DSP ERROR: " + err.message;
        return false;
    }
}

function runAutoSense() {
    if (!window.isEnabled || !window.analyser) { requestAnimationFrame(runAutoSense); return; }
    const data = new Uint8Array(window.analyser.frequencyBinCount);
    window.analyser.getByteFrequencyData(data);
    let avg = data.reduce((a, b) => a + b) / data.length;
    
    // THE FIX: ZERO-TOLERANCE GATE
    if (avg < 12) {
        window.preAmp.gain.setTargetAtTime(0.001, window.audioCtx.currentTime, 0.1); // TOTAL SILENCE
    } else {
        window.preAmp.gain.setTargetAtTime(5.0, window.audioCtx.currentTime, 0.2); // HIGH GAIN SPEECH
    }
    requestAnimationFrame(runAutoSense);
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
        powerBtn.classList.add('on');
        statusText.innerText = "AUDIOSENSE ACTIVE";
    } else {
        window.audioCtx.suspend();
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
    const canvasElement = document.getElementById('visualizer'); // Fetch directly to avoid errors
    if (!canvasElement) return;
    const ctx = canvasElement.getContext('2d');
    const data = new Uint8Array(window.analyser.frequencyBinCount);
    window.analyser.getByteFrequencyData(data);
    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    const bw = canvasElement.width / 64;
    for(let i = 0; i < 64; i++) {
        const h = data[i] / 4;
        ctx.fillStyle = "#00ff66";
        ctx.fillRect(i * bw, canvasElement.height - h, bw - 2, h);
    }
}
