let audioCtx;
let microphone;
let preAmp;
let gainNode;
let filterNode;
let speechClarifier;
let hissSuppressor; // NEW: Kills the "Rain" sound
let compressor;
let gate;
let limiter;
let analyser;
let isEnabled = false;
let recognition;
let finalTranscript = "";
let shadowTranscript = "";
let lastTranscriptTime = Date.now();

// DOM Elements
const powerBtn = document.getElementById('powerBtn');
const statusText = document.getElementById('statusText');
const transcriptionBox = document.getElementById('transcriptionBox');
const debugConsole = document.getElementById('debugConsole');
const canvas = document.getElementById('visualizer');
let canvasCtx;

if (canvas) canvasCtx = canvas.getContext('2d');
if (debugConsole) debugConsole.innerText = "JS ENGINE: READY (V5.0 CRYSTAL)";

async function initAudio() {
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        microphone = audioCtx.createMediaStreamSource(stream);
        
        preAmp = audioCtx.createGain();
        preAmp.gain.value = 5.0; 

        // 1. HISS SUPPRESSOR (Cuts the "Rain/Water" frequencies)
        hissSuppressor = audioCtx.createBiquadFilter();
        hissSuppressor.type = 'lowpass';
        hissSuppressor.frequency.value = 6000; // Block everything above 6kHz (hiss)

        speechClarifier = audioCtx.createBiquadFilter();
        speechClarifier.type = 'peaking';
        speechClarifier.frequency.value = 3000; 
        speechClarifier.gain.value = 12; 
        
        filterNode = audioCtx.createBiquadFilter();
        filterNode.type = 'bandpass';
        filterNode.frequency.value = 1200;

        gate = audioCtx.createDynamicsCompressor();
        gate.threshold.setValueAtTime(-45, audioCtx.currentTime); 
        gate.ratio.setValueAtTime(20, audioCtx.currentTime);

        compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-30, audioCtx.currentTime);
        compressor.release.setValueAtTime(1.0, audioCtx.currentTime);

        gainNode = audioCtx.createGain();
        gainNode.gain.value = 1.2; 

        limiter = audioCtx.createDynamicsCompressor();
        limiter.threshold.setValueAtTime(-0.5, audioCtx.currentTime);

        analyser = audioCtx.createAnalyser();
        
        // CHAIN: Mic -> PreAmp -> HissSuppressor -> Gate -> Clarifier -> AI Filter -> Compressor -> Output
        microphone.connect(preAmp);
        preAmp.connect(hissSuppressor);
        hissSuppressor.connect(gate);
        gate.connect(speechClarifier);
        speechClarifier.connect(filterNode);
        filterNode.connect(compressor);
        compressor.connect(gainNode);
        gainNode.connect(limiter);
        limiter.connect(analyser);
        analyser.connect(audioCtx.destination);
        
        initProfileHandlers();
        runAutoSense();
        drawVisualizer();
        return true;
    } catch (err) {
        if (debugConsole) debugConsole.innerText = "ERROR: " + err.message;
        return false;
    }
}

function initProfileHandlers() {
    document.querySelectorAll('.profile-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            document.querySelector('.profile-btn.active').classList.remove('active');
            btn.classList.add('active');
            const profile = btn.dataset.profile;
            if (profile === 'crowded') {
                filterNode.type = 'bandpass';
                filterNode.frequency.setTargetAtTime(1000, audioCtx.currentTime, 0.1);
            } else if (profile === 'street') {
                filterNode.type = 'highpass';
                filterNode.frequency.setTargetAtTime(2000, audioCtx.currentTime, 0.1);
            } else {
                filterNode.type = 'allpass';
            }
        };
    });
}

function runAutoSense() {
    if (!isEnabled) { requestAnimationFrame(runAutoSense); return; }
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);
    let average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    
    // SMART ADAPTATION (With Hiss-Floor)
    if (average < 8) {
        preAmp.gain.setTargetAtTime(0.1, audioCtx.currentTime, 0.5); // Silent Floor
    } else if (average < 25) {
        preAmp.gain.setTargetAtTime(10.0, audioCtx.currentTime, 0.5); // Whisper Mode
    } else {
        preAmp.gain.setTargetAtTime(3.0, audioCtx.currentTime, 0.5); // Normal Mode
    }

    if (Date.now() - lastTranscriptTime > 8000 && average > 20) {
        if (recognition) { try { recognition.stop(); } catch(e) {} }
        lastTranscriptTime = Date.now();
    }
    requestAnimationFrame(runAutoSense);
}

powerBtn.addEventListener('click', async () => {
    if (!audioCtx) {
        const success = await initAudio();
        if (!success) return;
        initTranscription();
    }
    isEnabled = !isEnabled;
    if (isEnabled) {
        audioCtx.resume();
        if (recognition) try { recognition.start(); } catch(e) {}
        powerBtn.classList.add('on');
        statusText.innerText = "AUDIOSENSE ACTIVE";
    } else {
        audioCtx.suspend();
        if (recognition) recognition.stop();
        powerBtn.classList.remove('on');
        statusText.innerText = "AUDIOSENSE STANDBY";
    }
});

function initTranscription() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
        lastTranscriptTime = Date.now();
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) { finalTranscript += transcript + " "; shadowTranscript = ""; }
            else { interimTranscript = transcript; shadowTranscript = interimTranscript; }
        }
        transcriptionBox.innerHTML = `<span>${finalTranscript + (interimTranscript || shadowTranscript)}</span>`;
        transcriptionBox.scrollTop = transcriptionBox.scrollHeight;
    };
    recognition.onend = () => { if (isEnabled) recognition.start(); };
}

function drawVisualizer() {
    requestAnimationFrame(drawVisualizer);
    if (!canvasCtx) return;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    const barWidth = (canvas.width / analyser.frequencyBinCount) * 2.5;
    let x = 0;
    for(let i = 0; i < analyser.frequencyBinCount; i++) {
        const barHeight = dataArray[i] / 4;
        canvasCtx.fillStyle = `rgba(0, 255, 102, ${dataArray[i] / 255})`;
        canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
    }
}
