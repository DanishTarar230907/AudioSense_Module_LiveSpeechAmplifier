#include <oboe/Oboe.h>
#include "../../cpp_core/AudioEngineCore.cpp"

class AndroidOboeWrapper : public oboe::AudioStreamCallback {
public:
    AndroidOboeWrapper(const char* modelPath) {
        engineCore = std::make_unique<AudioEngineCore>(modelPath);
    }

    oboe::DataCallbackResult onAudioReady(oboe::AudioStream *audioStream, 
                                        void *audioData, 
                                        int32_t numFrames) override {
        float *floatData = (float *)audioData;
        
        // Use a temporary buffer to avoid in-place processing issues if needed
        // but for 5ms frames we can often process directly or via a small stack buffer
        float outputBuffer[numFrames];
        
        engineCore->processFrame(floatData, outputBuffer, numFrames);
        
        std::copy(outputBuffer, outputBuffer + numFrames, floatData);

        return oboe::DataCallbackResult::Continue;
    }

    void start() {
        oboe::AudioStreamBuilder builder;
        builder.setCallback(this)
            ->setPerformanceMode(oboe::PerformanceMode::LowLatency)
            ->setSharingMode(oboe::SharingMode::Exclusive)
            ->setFormat(oboe::AudioFormat::Float)
            ->setChannelCount(oboe::ChannelCount::Mono)
            ->setSampleRate(16000) // Match model sample rate
            ->openStream(&stream);
        
        stream->requestStart();
    }

    void setEnabled(bool enabled) { engineCore->setEnabled(enabled); }
    void setGain(float gain) { engineCore->setGain(gain); }

private:
    std::unique_ptr<AudioEngineCore> engineCore;
    oboe::AudioStream *stream;
};
