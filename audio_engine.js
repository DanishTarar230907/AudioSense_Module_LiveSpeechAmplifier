let audioCtx;
let microphone;
let preAmp; // NEW: Stage 1 Gain
let gainNode; // Stage 2 Gain
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

if (debugConsole) debugConsole.innerText = "JS ENGINE: READY (DSP V4.0)";

async function initAudio() {
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        microphone = audioCtx.createMediaStreamSource(stream);
        
        // 1. PRE-AMP (Boosts whispers 10x before processing)
        preAmp = audioCtx.createGain();
        preAmp.gain.value = 10.0; 

        // 2. SPEECH CLARIFIER
        speechClarifier = audioCtx.createBiquadFilter();
        speechClarifier.type = 'peaking';
        speechClarifier.frequency.value = 3000; 
        speechClarifier.gain.value = 18; 
        
        // 3. AI BANDPASS
        filterNode = audioCtx.createBiquadFilter();
        filterNode.type = 'bandpass';
        filterNode.frequency.value = 1200;

        // 4. THE "SMOOTH" COMPRESSOR (Prevents cutting)
        compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-40, audioCtx.currentTime); // Catch very faint sounds
        compressor.knee.setValueAtTime(40, audioCtx.currentTime);
        compressor.ratio.setValueAtTime(12, audioCtx.currentTime);
        compressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
        compressor.release.setValueAtTime(1.2, audioCtx.currentTime); // LONG RELEASE: No more word-cutting

        gainNode = audioCtx.createGain();
        gainNode.gain.value = 2.0; 

        feedbackSuppresor = audioCtx.createDelay(0.1);
        feedbackSuppresor.delayTime.value = 0.002;

        limiter = audioCtx.createDynamicsCompressor();
        limiter.threshold.setValueAtTime(-0.5, audioCtx.currentTime);

        analyser = audioCtx.createAnalyser();
        
        // DSP CHAIN: Mic -> PreAmp -> Clarifier -> AI Filter -> Compressor -> Gain -> Output
        microphone.connect(preAmp);
        preAmp.connect(speechClarifier);
        speechClarifier.connect(filterNode);
        filterNode.connect(compressor);
        compressor.connect(feedbackSuppresor);
        feedbackSuppresor.connect(gainNode);
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
        btn.onclick = () => {
            document.querySelector('.profile-btn.active').classList.remove('active');
            btn.classList.add('active');
            const profile = btn.dataset.profile;
            if (profile === 'crowded') {
                filterNode.type = 'bandpass';
                filterNode.frequency.setTargetAtTime(1000, audioCtx.currentTime, 0.1);
                speechClarifier.gain.setTargetAtTime(18, audioCtx.currentTime, 0.1);
            } else if (profile === 'street') {
                filterNode.type = 'highpass';
                filterNode.frequency.setTargetAtTime(1800, audioCtx.currentTime, 0.1);
                speechClarifier.gain.setTargetAtTime(10, audioCtx.currentTime, 0.1);
            } else {
                filterNode.type = 'allpass';
                speechClarifier.gain.setTargetAtTime(5, audioCtx.currentTime, 0.1);
            }
        };
    });
}

function runAutoSense() {
    if (!isEnabled) { requestAnimationFrame(runAutoSense); return; }
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);
    let average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    
    // SMART ADAPTATION
    if (average < 15) {
        preAmp.gain.setTargetAtTime(15.0, audioCtx.currentTime, 0.5); // HEAVILY BOOST WHISPERS
    } else if (average > 50) {
        preAmp.gain.setTargetAtTime(5.0, audioCtx.currentTime, 0.5); // NORMAL GAIN
    }
    requestAnimationFrame(runAutoSense);
}

powerBtn.addEventListener('click', async () => {
    if (!audioCtx) {
        statusText.innerText = "INITIALIZING DSP...";
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
