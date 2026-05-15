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

const powerBtn = document.getElementById('powerBtn');
const statusText = document.getElementById('statusText');
const transcriptionBox = document.getElementById('transcriptionBox');
const volumeSlider = document.getElementById('volumeSlider');
const intensitySlider = document.getElementById('intensitySlider');
const canvas = document.getElementById('visualizer');
const canvasCtx = canvas.getContext('2d');

async function initAudio() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        microphone = audioCtx.createMediaStreamSource(stream);
        
        // 1. SPEECH CLARIFIER (Equalizer for Intelligibility)
        speechClarifier = audioCtx.createBiquadFilter();
        speechClarifier.type = 'peaking';
        speechClarifier.frequency.value = 3000; 
        speechClarifier.gain.value = 15; // 15dB boost for speech crispness
        
        // 2. BACKGROUND SUPPRESSOR
        filterNode = audioCtx.createBiquadFilter();
        filterNode.type = 'bandpass';
        filterNode.frequency.value = 1200;
        filterNode.Q.value = 1.0;

        // 3. SOFT-KNEE COMPRESSOR (Smooths out loudness jumps)
        compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-24, audioCtx.currentTime);
        compressor.knee.setValueAtTime(30, audioCtx.currentTime);
        compressor.ratio.setValueAtTime(12, audioCtx.currentTime);

        // 4. MASTER GAIN (Extreme Amplification)
        gainNode = audioCtx.createGain();
        gainNode.gain.value = 3.0; // Start at 300% volume

        // 5. ANTI-HOWLING / FEEDBACK SUPPRESSOR
        feedbackSuppresor = audioCtx.createDelay(0.1);
        feedbackSuppresor.delayTime.value = 0.002;

        // 6. LIMITER (Prevents distortion and "Beeping")
        limiter = audioCtx.createDynamicsCompressor();
        limiter.threshold.setValueAtTime(-1.0, audioCtx.currentTime);
        limiter.ratio.setValueAtTime(20, audioCtx.currentTime);

        analyser = audioCtx.createAnalyser();
        
        // --- ROUTING: The DSP Pipeline ---
        microphone.connect(speechClarifier);
        speechClarifier.connect(filterNode);
        filterNode.connect(compressor);
        compressor.connect(feedbackSuppresor);
        feedbackSuppresor.connect(gainNode);
        gainNode.connect(limiter);
        limiter.connect(analyser);
        analyser.connect(audioCtx.destination);
        
        // LFO for Feedback Suppression
        const lfo = audioCtx.createOscillator();
        const lfoGain = audioCtx.createGain();
        lfo.frequency.value = 0.5;
        lfoGain.gain.value = 0.001;
        lfo.connect(lfoGain);
        lfoGain.connect(feedbackSuppresor.delayTime);
        lfo.start();

        runAutoSense();
        drawVisualizer();
        return true;
    } catch (err) {
        statusText.innerText = "MIC ACCESS DENIED";
        return false;
    }
}

function runAutoSense() {
    if (!isEnabled) {
        requestAnimationFrame(runAutoSense);
        return;
    }

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);
    let average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    
    // SMART ADAPTATION
    // If quiet, boost gain and lower suppression
    if (average < 20) {
        gainNode.gain.setTargetAtTime(4.0, audioCtx.currentTime, 0.2); // 400% Gain
        filterNode.Q.setTargetAtTime(0.5, audioCtx.currentTime, 0.2);
    } 
    // If noisy, suppress more and protect hearing
    else if (average > 60) {
        gainNode.gain.setTargetAtTime(1.5, audioCtx.currentTime, 0.2); 
        filterNode.Q.setTargetAtTime(4.0, audioCtx.currentTime, 0.2);
    }

    requestAnimationFrame(runAutoSense);
}

powerBtn.onclick = async () => {
    if (!audioCtx) {
        const success = await initAudio();
        if (!success) return;
        initTranscription();
    }
    
    isEnabled = !isEnabled;
    if (isEnabled) {
        audioCtx.resume();
        if (recognition) recognition.start();
        powerBtn.classList.add('on');
        statusText.innerText = "AUDIOSENSE ACTIVE";
    } else {
        audioCtx.suspend();
        if (recognition) recognition.stop();
        powerBtn.classList.remove('on');
        statusText.innerText = "AUDIOSENSE STANDBY";
    }
};

function initTranscription() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript + " ";
            } else {
                interimTranscript += transcript;
            }
        }
        transcriptionBox.innerHTML = `<span style="color:#fff">${finalTranscript}</span><span style="color:#00ff66; font-style:italic;">${interimTranscript}</span>`;
        transcriptionBox.scrollTop = transcriptionBox.scrollHeight;
    };

    recognition.onend = () => { if (isEnabled) recognition.start(); };
}

function drawVisualizer() {
    requestAnimationFrame(drawVisualizer);
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    const barWidth = (canvas.width / bufferLength) * 2.5;
    let x = 0;
    for(let i = 0; i < bufferLength; i++) {
        const barHeight = dataArray[i] / 4;
        canvasCtx.fillStyle = `rgba(0, 255, 102, ${dataArray[i] / 255})`;
        canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
    }
}
