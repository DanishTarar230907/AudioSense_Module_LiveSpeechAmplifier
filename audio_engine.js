window.audioCtx = null;
window.analyser = null;
window.isEnabled = false;
window.finalTranscript = "";

const powerBtn = document.getElementById('powerBtn');
const statusText = document.getElementById('statusText');
const transcriptionBox = document.getElementById('transcriptionBox');
const debugConsole = document.getElementById('debugConsole');

if (debugConsole) debugConsole.innerText = "AUDIOSENSE RESTORED (V9.5)";

async function initAudio() {
    try {
        window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const microphone = window.audioCtx.createMediaStreamSource(stream);
        
        window.preAmp = window.audioCtx.createGain();
        window.preAmp.gain.value = 0; 

        window.filterNode = window.audioCtx.createBiquadFilter();
        window.filterNode.type = 'bandpass';
        window.filterNode.frequency.value = 1200;

        const compressor = window.audioCtx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-30, window.audioCtx.currentTime);

        window.analyser = window.audioCtx.createAnalyser();
        
        microphone.connect(window.preAmp);
        window.preAmp.connect(window.filterNode);
        window.filterNode.connect(compressor);
        compressor.connect(window.analyser);
        window.analyser.connect(window.audioCtx.destination);
        
        initProfileHandlers();
        runAutoSense();
        drawVisualizer();
        return true;
    } catch (err) {
        if (debugConsole) debugConsole.innerText = "DSP ERROR: " + err.message;
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
                window.filterNode.type = 'bandpass';
                window.filterNode.frequency.setTargetAtTime(1000, window.audioCtx.currentTime, 0.1);
            } else if (profile === 'street') {
                window.filterNode.type = 'highpass';
                window.filterNode.frequency.setTargetAtTime(2000, window.audioCtx.currentTime, 0.1);
            } else {
                window.filterNode.type = 'allpass';
            }
        };
    });
}

function runAutoSense() {
    if (!window.isEnabled || !window.analyser) { requestAnimationFrame(runAutoSense); return; }
    const data = new Uint8Array(window.analyser.frequencyBinCount);
    window.analyser.getByteFrequencyData(data);
    let avg = data.reduce((a, b) => a + b) / data.length;
    
    // NEW: Improved Sensitivity (Lower threshold = easier to hear)
    if (avg < 5) {
        window.preAmp.gain.setTargetAtTime(0.001, window.audioCtx.currentTime, 0.1); 
    } else {
        window.preAmp.gain.setTargetAtTime(6.0, window.audioCtx.currentTime, 0.2); 
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
    const canvasElement = document.getElementById('visualizer');
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
