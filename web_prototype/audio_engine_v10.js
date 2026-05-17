// AUDIOSENSE UNIVERSAL ENGINE (V10.1)
window.audioCtx = null;
window.analyser = null;
window.isEnabled = false;
window.finalTranscript = "";

const powerBtn = document.getElementById('powerBtn');
const statusText = document.getElementById('statusText');
const transcriptionBox = document.getElementById('transcriptionBox');
const debugConsole = document.getElementById('debugConsole');

if (debugConsole) debugConsole.innerText = "UNIVERSAL ENGINE: READY (V10.1)";

async function initAudio() {
    try {
        window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Use browser's native echo cancellation and noise suppression
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: false
            } 
        });
        
        const microphone = window.audioCtx.createMediaStreamSource(stream);
        
        // Highpass to remove rumble/handling noise
        window.filterNode = window.audioCtx.createBiquadFilter();
        window.filterNode.type = 'highpass';
        window.filterNode.frequency.value = 150;

        // Presence boost (clarifier) - gentle boost for speech intelligibility
        const clarifier = window.audioCtx.createBiquadFilter();
        clarifier.type = 'peaking';
        clarifier.frequency.value = 3000;
        clarifier.gain.value = 5.0; // Reduced from 15 (which caused creepy ringing)

        // Compressor acting as Automatic Gain Control (AGC)
        const agc = window.audioCtx.createDynamicsCompressor();
        agc.threshold.setValueAtTime(-40, window.audioCtx.currentTime); 
        agc.knee.setValueAtTime(30, window.audioCtx.currentTime); 
        agc.ratio.setValueAtTime(4, window.audioCtx.currentTime); 
        agc.attack.setValueAtTime(0.01, window.audioCtx.currentTime);
        agc.release.setValueAtTime(0.1, window.audioCtx.currentTime);

        // Make-up gain
        window.gainNode = window.audioCtx.createGain();
        window.gainNode.gain.value = 2.0; // Reasonable amplification

        // Limiter for safety (prevents clipping/sudden loud noises)
        const limiter = window.audioCtx.createDynamicsCompressor();
        limiter.threshold.setValueAtTime(-3.0, window.audioCtx.currentTime);
        limiter.knee.setValueAtTime(0, window.audioCtx.currentTime);
        limiter.ratio.setValueAtTime(20, window.audioCtx.currentTime); // Brickwall
        limiter.attack.setValueAtTime(0.001, window.audioCtx.currentTime);
        limiter.release.setValueAtTime(0.1, window.audioCtx.currentTime);

        window.analyser = window.audioCtx.createAnalyser();
        window.analyser.fftSize = 256;
        
        // Connect the chain
        microphone.connect(window.filterNode);
        window.filterNode.connect(clarifier);
        clarifier.connect(agc);
        agc.connect(window.gainNode);
        window.gainNode.connect(limiter);
        limiter.connect(window.analyser);
        window.analyser.connect(window.audioCtx.destination);
        
        initProfileHandlers();
        drawVisualizer();
        return true;
    } catch (err) {
        if (debugConsole) debugConsole.innerText = "ENGINE ERROR: " + err.message;
        return false;
    }
}

function initProfileHandlers() {
    const btns = document.querySelectorAll('.profile-btn');
    btns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            btns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            if (!window.filterNode) return;
            const p = btn.dataset.profile;
            
            if (p === 'crowded') {
                // Focus heavily on speech band
                window.filterNode.type = 'bandpass';
                window.filterNode.frequency.setTargetAtTime(1500, window.audioCtx.currentTime, 0.1);
                window.filterNode.Q.setTargetAtTime(0.5, window.audioCtx.currentTime, 0.1);
            } else if (p === 'street') {
                // Cut low traffic rumble strongly
                window.filterNode.type = 'highpass';
                window.filterNode.frequency.setTargetAtTime(600, window.audioCtx.currentTime, 0.1);
                window.filterNode.Q.setTargetAtTime(1, window.audioCtx.currentTime, 0.1);
            } else {
                // 'quiet' - Full spectrum but cut sub-bass
                window.filterNode.type = 'highpass';
                window.filterNode.frequency.setTargetAtTime(150, window.audioCtx.currentTime, 0.1);
                window.filterNode.Q.setTargetAtTime(1, window.audioCtx.currentTime, 0.1);
            }
        });
    });
}

powerBtn.addEventListener('click', async () => {
    if (!window.audioCtx) {
        const success = await initAudio();
        if (!success) {
            statusText.innerText = "MIC ACCESS DENIED";
            return;
        }
        initTranscription();
    }
    window.isEnabled = !window.isEnabled;
    if (window.isEnabled) {
        window.audioCtx.resume();
        if (window.recognition) {
            try { window.recognition.start(); } catch(e) {}
        }
        powerBtn.classList.add('on');
        statusText.innerText = "AUDIOSENSE ACTIVE";
    } else {
        window.audioCtx.suspend();
        if (window.recognition) {
            try { window.recognition.stop(); } catch(e) {}
        }
        powerBtn.classList.remove('on');
        statusText.innerText = "STANDBY";
    }
});

function initTranscription() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        if (debugConsole) debugConsole.innerText = "TRANSCRIPTION ERROR: Speech Recognition API not supported.";
        transcriptionBox.innerHTML = `<span style="color:red">Speech Recognition not supported in this browser. Please use Chrome.</span>`;
        return;
    }
    
    window.recognition = new SR();
    window.recognition.continuous = true;
    window.recognition.interimResults = true;
    window.recognition.lang = 'en-US';

    window.recognition.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                window.finalTranscript += event.results[i][0].transcript + " ";
            } else {
                interim += event.results[i][0].transcript;
            }
        }
        // Use a slightly dimmer color for interim results to distinguish them
        transcriptionBox.innerHTML = `<span>${window.finalTranscript}</span><span style="color: #aaa;">${interim}</span>`;
        transcriptionBox.scrollTop = transcriptionBox.scrollHeight;
    };
    
    window.recognition.onerror = (event) => {
        if (debugConsole) debugConsole.innerText = "TRANSCRIPTION ERROR: " + event.error;
        if (event.error === 'not-allowed') {
            transcriptionBox.innerHTML += `<br><span style="color:red">[Microphone access denied or protocol error. Use HTTPS or localhost.]</span>`;
        }
    };

    window.recognition.onend = () => { 
        if (window.isEnabled) {
            try {
                window.recognition.start();
            } catch (e) {}
        }
    };
}

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
    
    for(let i = 0; i < data.length; i++) {
        const h = data[i] / 2; // scale height
        ctx.fillStyle = `rgba(0, 255, 102, ${data[i] / 255})`;
        ctx.fillRect(i * bw, canvas.height - h, bw - 1, h);
    }
}
