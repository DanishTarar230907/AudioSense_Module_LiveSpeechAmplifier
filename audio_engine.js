let audioCtx;
let microphone;
let preAmp;
let gainNode;
let filterNode;
let speechClarifier;
let compressor;
let gate; // NEW: Noise Gate
let limiter;
let analyser;
let isEnabled = false;
let recognition;
let finalTranscript = "";
let shadowTranscript = "";
let lastTranscriptTime = Date.now();

const powerBtn = document.getElementById('powerBtn');
const statusText = document.getElementById('statusText');
const transcriptionBox = document.getElementById('transcriptionBox');
const debugConsole = document.getElementById('debugConsole');

async function initAudio() {
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        microphone = audioCtx.createMediaStreamSource(stream);
        
        preAmp = audioCtx.createGain();
        preAmp.gain.value = 8.0; 

        speechClarifier = audioCtx.createBiquadFilter();
        speechClarifier.type = 'peaking';
        speechClarifier.frequency.value = 3000; 
        speechClarifier.gain.value = 15; 
        
        filterNode = audioCtx.createBiquadFilter();
        filterNode.type = 'bandpass';
        filterNode.frequency.value = 1200;

        // --- THE FIX: Surgical Noise Gate (Kills breathing/hiss) ---
        gate = audioCtx.createDynamicsCompressor();
        gate.threshold.setValueAtTime(-50, audioCtx.currentTime); // Silence everything below this
        gate.ratio.setValueAtTime(20, audioCtx.currentTime);
        gate.attack.setValueAtTime(0.01, audioCtx.currentTime);
        gate.release.setValueAtTime(0.1, audioCtx.currentTime);

        compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-30, audioCtx.currentTime);
        compressor.release.setValueAtTime(1.0, audioCtx.currentTime);

        gainNode = audioCtx.createGain();
        gainNode.gain.value = 1.5; 

        limiter = audioCtx.createDynamicsCompressor();
        limiter.threshold.setValueAtTime(-0.5, audioCtx.currentTime);

        analyser = audioCtx.createAnalyser();
        
        // CHAIN: Mic -> PreAmp -> Gate -> Clarifier -> AI Filter -> Compressor -> Output
        microphone.connect(preAmp);
        preAmp.connect(gate);
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
            console.log("Profile Changed:", btn.dataset.profile);
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
    
    // GATING LOGIC: If silent, kill the pre-amp gain to stop "breathing" noise
    if (average < 10) {
        preAmp.gain.setTargetAtTime(0.1, audioCtx.currentTime, 0.2); 
    } else {
        preAmp.gain.setTargetAtTime(8.0, audioCtx.currentTime, 0.2);
    }

    // --- THE FIX: Transcription Heartbeat ---
    if (Date.now() - lastTranscriptTime > 5000 && average > 20) {
        console.log("Transcription stalled. Restarting...");
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
        lastTranscriptTime = Date.now(); // Reset heartbeat
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
const canvasCtx = document.getElementById('visualizer').getContext('2d');
