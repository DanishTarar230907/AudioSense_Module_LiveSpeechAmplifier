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
let shadowTranscript = ""; // Buffer for unfinalized words

const powerBtn = document.getElementById('powerBtn');
const statusText = document.getElementById('statusText');
const transcriptionBox = document.getElementById('transcriptionBox');
const canvas = document.getElementById('visualizer');
const canvasCtx = canvas.getContext('2d');

async function initAudio() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    try {
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
    
    if (average < 20) {
        gainNode.gain.setTargetAtTime(4.5, audioCtx.currentTime, 0.2); 
        filterNode.Q.setTargetAtTime(0.5, audioCtx.currentTime, 0.2);
    } else if (average > 60) {
        gainNode.gain.setTargetAtTime(1.2, audioCtx.currentTime, 0.2); 
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
                shadowTranscript = ""; 
            } else {
                interimTranscript = transcript;
                shadowTranscript = interimTranscript;
            }
        }
        // THE FIX: Use Shadow Buffering to prevent word-cut
        const displayBody = finalTranscript + (interimTranscript || shadowTranscript);
        transcriptionBox.innerHTML = `<span style="color:#fff">${displayBody}</span>`;
        transcriptionBox.scrollTop = transcriptionBox.scrollHeight;
    };

    let _restartDelay = 250;

    recognition.onstart = () => {
        _restartDelay = 250; // Reset delay on successful start
    };

    recognition.onend = () => { 
        if (isEnabled) {
            if (shadowTranscript) {
                finalTranscript += shadowTranscript + " ";
                shadowTranscript = "";
            }
            setTimeout(() => {
                if (isEnabled) {
                    try { recognition.start(); } catch(err) {}
                }
            }, _restartDelay); 
        }
    };
    
    recognition.onerror = (e) => {
        if (e.error === 'no-speech' || e.error === 'aborted') {
            return;
        }

        if (e.error === 'network') {
            _restartDelay = Math.min(_restartDelay * 2, 8000);
            transcriptionBox.innerHTML = `<span style="color:#ffa500">[Transcription Network Error. Ensure you have active internet. If using Brave/Edge, use official Google Chrome (non-Chrome browsers block this private Google API).]</span>`;
        }

        if (e.error === 'not-allowed') {
            transcriptionBox.innerHTML = `<span style="color:#ff4444">[Microphone denied — use HTTPS or localhost]</span>`;
        }
    };
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
