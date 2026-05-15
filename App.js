let audioCtx;
let microphone;
let gainNode;
let filterNode;
let speechClarifier;
let compressor;
let limiter;
let analyser;
let feedbackSuppresor;
let isEnabled = false;
let recognition;
let finalTranscript = "";
let shadowTranscript = "";

const powerBtn = document.getElementById('powerBtn');
const statusText = document.getElementById('statusText');
const transcriptionBox = document.getElementById('transcriptionBox');
const debugConsole = document.getElementById('debugConsole');

// --- THE FIX: Visual Heartbeat to prove JS is running ---
if (debugConsole) debugConsole.innerText = "JS ENGINE: READY (TOUCH POWER TO START)";

async function initAudio() {
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        microphone = audioCtx.createMediaStreamSource(stream);
        
        speechClarifier = audioCtx.createBiquadFilter();
        speechClarifier.type = 'peaking';
        speechClarifier.frequency.value = 3000; 
        speechClarifier.gain.value = 15; 
        
        filterNode = audioCtx.createBiquadFilter();
        filterNode.type = 'bandpass';
        filterNode.frequency.value = 1200;

        compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-24, audioCtx.currentTime);

        gainNode = audioCtx.createGain();
        gainNode.gain.value = 3.0; 

        feedbackSuppresor = audioCtx.createDelay(0.1);
        feedbackSuppresor.delayTime.value = 0.002;

        limiter = audioCtx.createDynamicsCompressor();
        limiter.threshold.setValueAtTime(-1.0, audioCtx.currentTime);

        analyser = audioCtx.createAnalyser();
        
        microphone.connect(speechClarifier);
        speechClarifier.connect(filterNode);
        filterNode.connect(compressor);
        compressor.connect(feedbackSuppresor);
        feedbackSuppresor.connect(gainNode);
        gainNode.connect(limiter);
        limiter.connect(analyser);
        analyser.connect(audioCtx.destination);
        
        runAutoSense();
        return true;
    } catch (err) {
        if (debugConsole) debugConsole.innerText = "ERROR: " + err.message;
        return false;
    }
}

function runAutoSense() {
    if (!isEnabled) { requestAnimationFrame(runAutoSense); return; }
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);
    let average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    if (average < 20) gainNode.gain.setTargetAtTime(4.5, audioCtx.currentTime, 0.2); 
    else if (average > 60) gainNode.gain.setTargetAtTime(1.2, audioCtx.currentTime, 0.2); 
    requestAnimationFrame(runAutoSense);
}

// THE FIX: Global wake-up listener
document.addEventListener('click', () => {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}, { once: true });

powerBtn.addEventListener('click', async () => {
    if (debugConsole) debugConsole.innerText = "POWER CLICKED - WAKING UP...";
    
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
        if (debugConsole) debugConsole.innerText = "SYSTEM ONLINE";
    } else {
        audioCtx.suspend();
        if (recognition) recognition.stop();
        powerBtn.classList.remove('on');
        statusText.innerText = "AUDIOSENSE STANDBY";
        if (debugConsole) debugConsole.innerText = "SYSTEM PAUSED";
    }
});

function initTranscription() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) { finalTranscript += transcript + " "; shadowTranscript = ""; }
            else { interimTranscript = transcript; shadowTranscript = interimTranscript; }
        }
        const displayBody = finalTranscript + (interimTranscript || shadowTranscript);
        transcriptionBox.innerHTML = `<span>${displayBody}</span>`;
        transcriptionBox.scrollTop = transcriptionBox.scrollHeight;
    };
    recognition.onend = () => { if (isEnabled) recognition.start(); };
}
