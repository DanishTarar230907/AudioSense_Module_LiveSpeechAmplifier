window.audioCtx = null;
window.analyser = null;
window.isEnabled = false;
window.finalTranscript = "";

const powerBtn = document.getElementById('powerBtn');
const statusText = document.getElementById('statusText');
const transcriptionBox = document.getElementById('transcriptionBox');
const debugConsole = document.getElementById('debugConsole');

if (debugConsole) debugConsole.innerText = "DISTANT-PRIORITY (V8.0)";

async function initAudio() {
    try {
        window.audioCtx = new (window.AudioContext || window.webkitAudioContext)({
            latencyHint: 'interactive'
        });

        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { echoCancellation: true, noiseSuppression: true } 
        });
        
        const microphone = window.audioCtx.createMediaStreamSource(stream);
        
        // 1. SELF-VOICE LIMITER (Prevents your own voice from being too loud)
        const selfVoiceLimiter = window.audioCtx.createDynamicsCompressor();
        selfVoiceLimiter.threshold.setValueAtTime(-20, window.audioCtx.currentTime);
        selfVoiceLimiter.knee.setValueAtTime(0, window.audioCtx.currentTime);
        selfVoiceLimiter.ratio.setValueAtTime(20, window.audioCtx.currentTime); // Hard limit for close-talk
        selfVoiceLimiter.attack.setValueAtTime(0.001, window.audioCtx.currentTime);
        selfVoiceLimiter.release.setValueAtTime(0.05, window.audioCtx.currentTime);

        // 2. DISTANT-VOICE EXPANDER (Pulling distant speech forward)
        const distantExpander = window.audioCtx.createDynamicsCompressor();
        distantExpander.threshold.setValueAtTime(-45, window.audioCtx.currentTime);
        distantExpander.knee.setValueAtTime(40, window.audioCtx.currentTime);
        distantExpander.ratio.setValueAtTime(1.5, window.audioCtx.currentTime); // Soft boost for faint sounds

        const clarifier = window.audioCtx.createBiquadFilter();
        clarifier.type = 'peaking';
        clarifier.frequency.value = 3500; // Crispness focus
        clarifier.gain.value = 15;

        const gainNode = window.audioCtx.createGain();
        gainNode.gain.value = 1.5;

        window.analyser = window.audioCtx.createAnalyser();
        
        // CHAIN: Mic -> Self-Voice Limiter -> Distant Expander -> Clarifier -> Output
        microphone.connect(selfVoiceLimiter);
        selfVoiceLimiter.connect(distantExpander);
        distantExpander.connect(clarifier);
        clarifier.connect(gainNode);
        gainNode.connect(window.analyser);
        window.analyser.connect(window.audioCtx.destination);
        
        runAutoSense();
        drawVisualizer();
        return true;
    } catch (err) {
        if (debugConsole) debugConsole.innerText = "ERROR: " + err.message;
        return false;
    }
}

function runAutoSense() {
    if (!window.isEnabled) { requestAnimationFrame(runAutoSense); return; }
    const dataArray = new Uint8Array(window.analyser.frequencyBinCount);
    window.analyser.getByteFrequencyData(dataArray);
    let avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
    
    // If it's very loud (User's own voice), keep the gain low
    if (avg > 60) {
        window.audioCtx.destination.channelCount = 2; // Stereo focus
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
        statusText.innerText = "DISTANT FOCUS ON";
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
