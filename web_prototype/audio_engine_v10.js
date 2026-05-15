// AUDIOSENSE UNIVERSAL ENGINE (V10.0)
window.audioCtx = null;
window.analyser = null;
window.isEnabled = false;
window.finalTranscript = "";

const powerBtn = document.getElementById('powerBtn');
const statusText = document.getElementById('statusText');
const transcriptionBox = document.getElementById('transcriptionBox');
const debugConsole = document.getElementById('debugConsole');

if (debugConsole) debugConsole.innerText = "UNIVERSAL ENGINE: READY (V10.0)";

async function initAudio() {
    try {
        window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const microphone = window.audioCtx.createMediaStreamSource(stream);
        
        window.gainNode = window.audioCtx.createGain();
        window.gainNode.gain.value = 5.0; // Powerful Default Amplification

        window.filterNode = window.audioCtx.createBiquadFilter();
        window.filterNode.type = 'bandpass';
        window.filterNode.frequency.value = 1200;

        const clarifier = window.audioCtx.createBiquadFilter();
        clarifier.type = 'peaking';
        clarifier.frequency.value = 3000;
        clarifier.gain.value = 15;

        const limiter = window.audioCtx.createDynamicsCompressor();
        limiter.threshold.setValueAtTime(-1.0, window.audioCtx.currentTime);

        window.analyser = window.audioCtx.createAnalyser();
        
        // SIMPLE, ROBUST CHAIN
        microphone.connect(window.filterNode);
        window.filterNode.connect(clarifier);
        clarifier.connect(window.gainNode);
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
            // Remove active from all safely
            btns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            if (!window.filterNode) return;
            const p = btn.dataset.profile;
            if (p === 'crowded') {
                window.filterNode.type = 'bandpass';
                window.filterNode.frequency.setTargetAtTime(1200, window.audioCtx.currentTime, 0.1);
            } else if (p === 'street') {
                window.filterNode.type = 'highpass';
                window.filterNode.frequency.setTargetAtTime(2000, window.audioCtx.currentTime, 0.1);
            } else {
                window.filterNode.type = 'allpass';
            }
        });
    });
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
        statusText.innerText = "AUDIOSENSE ACTIVE";
    } else {
        window.audioCtx.suspend();
        if (window.recognition) window.recognition.stop();
        powerBtn.classList.remove('on');
        statusText.innerText = "STANDBY";
    }
});

function initTranscription() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    window.recognition = new SR();
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
    const bw = canvas.width / 64;
    for(let i = 0; i < 64; i++) {
        const h = data[i] / 4;
        ctx.fillStyle = "#00ff66";
        ctx.fillRect(i * bw, canvas.height - h, bw - 2, h);
    }
}
