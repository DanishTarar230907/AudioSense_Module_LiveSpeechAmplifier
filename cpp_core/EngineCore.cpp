#include <thread>
#include <mutex>
#include <queue>
#include <vector>
#include "tensorflow/lite/interpreter.h"
#include "whisper.h" // whisper.cpp

/**
 * EngineCore: Concurrent Dual-Stream Engine
 * Thread A: Real-time Audio Enhancement (5ms)
 * Thread B: Async Transcription (Whisper.cpp)
 */
class EngineCore {
public:
    EngineCore(const char* tflitePath, const char* whisperPath) {
        // Init TFLite (Thread A)
        initTFLite(tflitePath);
        
        // Init Whisper (Thread B)
        struct whisper_context_params params = whisper_context_default_params();
        w_ctx = whisper_init_from_file_with_params(whisperPath, params);
        
        running = true;
        transcriptionThread = std::thread(&EngineCore::transcriptionLoop, this);
    }

    ~EngineCore() {
        running = false;
        if (transcriptionThread.joinable()) transcriptionThread.join();
        whisper_free(w_ctx);
    }

    // Called from Native Audio Thread (Oboe/VPIO)
    void processAudio(const float* input, float* output, int numSamples) {
        // 1. Thread A: Immediate Enhancement
        runTFLiteInference(input, output, numSamples);
        
        // 2. Feed Thread B: Transcription Buffer
        std::lock_guard<std::mutex> lock(queueMutex);
        for(int i=0; i<numSamples; ++i) {
            transcriptionQueue.push(input[i]);
        }
    }

    std::string getLastTranscription() {
        std::lock_guard<std::mutex> lock(textMutex);
        return latestText;
    }

private:
    void transcriptionLoop() {
        std::vector<float> pcm_buffer;
        while (running) {
            {
                std::lock_guard<std::mutex> lock(queueMutex);
                while (!transcriptionQueue.empty()) {
                    pcm_buffer.push_back(transcriptionQueue.front());
                    transcriptionQueue.pop();
                }
            }

            // Process in 2-second chunks (32000 samples @ 16kHz)
            if (pcm_buffer.size() >= 32000) {
                whisper_full_params w_params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
                w_params.print_progress = false;
                
                if (whisper_full(w_ctx, w_params, pcm_buffer.data(), pcm_buffer.size()) == 0) {
                    const int n_segments = whisper_full_n_segments(w_ctx);
                    std::string result = "";
                    for (int i = 0; i < n_segments; ++i) {
                        result += whisper_full_get_segment_text(w_ctx, i);
                    }
                    std::lock_guard<std::mutex> lock(textMutex);
                    latestText = result;
                }
                pcm_buffer.clear();
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
        }
    }

    void initTFLite(const char* path) { /* TFLite init logic as before */ }
    void runTFLiteInference(const float* in, float* out, int n) { /* TFLite invoke logic */ }

    // Synchronisation
    std::thread transcriptionThread;
    bool running;
    std::mutex queueMutex;
    std::queue<float> transcriptionQueue;
    
    std::mutex textMutex;
    std::string latestText;
    
    struct whisper_context * w_ctx;
};
