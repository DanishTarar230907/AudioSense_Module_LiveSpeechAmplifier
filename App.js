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
const canvas = document.getElementById('visualizer');
const canvasCtx = canvas.getContext('2d');

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
        filterNode.Q.value = 1.0;

        compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-24, audioCtx.currentTime);
        compressor.knee.setValueAtTime(30, audioCtx.currentTime);
        compressor.ratio.setValueAtTime(12, audioCtx.currentTime);

        gainNode = audioCtx.createGain();
        gainNode.gain.value = 3.0; 

        feedbackSuppresor = audioCtx.createDelay(0.1);
        feedbackSuppresor.delayTime.value = 0.002;

        limiter = audioCtx.createDynamicsCompressor();
        limiter.threshold.setValueAtTime(-1.0, audioCtx.currentTime);
        limiter.ratio.setValueAtTime(20, audioCtx.currentTime);

        analyser = audioCtx.createAnalyser();
        
        microphone.connect(speechClarifier);
        speechClarifier.connect(filterNode);
        filterNode.connect(compressor);
        compressor.connect(feedbackSuppresor);
        feedbackSuppresor.connect(gainNode);
        gainNode.connect(limiter);
        limiter.connect(analyser);
        analyser.connect(audioCtx.destination);
        
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
        console.error(err);
        statusText.innerText = "ERROR: " + err.message;
        statusText.style.color = "red";
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
    
    if (average < 20) {
        gainNode.gain.setTargetAtTime(4.5, audioCtx.currentTime, 0.2); 
    } else if (average > 60) {
        gainNode.gain.setTargetAtTime(1.2, audioCtx.currentTime, 0.2); 
    }
    requestAnimationFrame(runAutoSense);
}

// THE FIX: Robust Event Listener for Mobile
powerBtn.addEventListener('click', async () => {
    if (!audioCtx) {
        statusText.innerText = "INITIALIZING...";
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
        statusText.style.color = "#00ff66";
    } else {
        audioCtx.suspend();
        if (recognition) recognition.stop();
        powerBtn.classList.remove('on');
        statusText.innerText = "AUDIOSENSE STANDBY";
        statusText.style.color = "#888";
    }
});

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
                shadowTranscript = ""; 
            } else {
                interimTranscript = transcript;
                shadowTranscript = interimTranscript;
            }
        }
        const displayBody = finalTranscript + (interimTranscript || shadowTranscript);
        transcriptionBox.innerHTML = `<span>${displayBody}</span>`;
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
