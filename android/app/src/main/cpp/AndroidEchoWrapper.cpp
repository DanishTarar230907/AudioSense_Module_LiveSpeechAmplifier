#include <oboe/Oboe.h>
#include <android/log.h>
#include "../../cpp_core/EngineCore.cpp"

class AndroidEchoWrapper : public oboe::AudioStreamCallback {
public:
    void startStream() {
        oboe::AudioStreamBuilder builder;
        builder.setDirection(oboe::Direction::Input)
               ->setPerformanceMode(oboe::PerformanceMode::LowLatency)
               ->setSharingMode(oboe::SharingMode::Exclusive)
               ->setFormat(oboe::AudioFormat::Float)
               ->setCallback(this)
               ->openStream(mStream);

        // Retrieve the Session ID to attach Hardware AEC
        int32_t sessionId = mStream->getSessionId();
        if (sessionId != oboe::SessionId::None) {
            enableAndroidHardwareAEC(sessionId);
        }
        
        mStream->requestStart();
    }

    oboe::DataCallbackResult onAudioReady(oboe::AudioStream *oboeStream, void *audioData, int32_t numFrames) override {
        float *input = (float *)audioData;
        float output[numFrames];
        
        mEngine->processAudio(input, output, numFrames);
        
        // Output stream logic...
        return oboe::DataCallbackResult::Continue;
    }

private:
    void enableAndroidHardwareAEC(int32_t sessionId) {
        // This usually involves a JNI call to Java's AcousticEchoCanceler.create(sessionId)
        // because the AEC API is predominantly Java-side in Android.
        __android_log_print(ANDROID_LOG_INFO, "LiveSpeech", "Attaching Hardware AEC to Session %d", sessionId);
    }

    oboe::AudioStream *mStream;
    std::unique_ptr<EngineCore> mEngine;
};
