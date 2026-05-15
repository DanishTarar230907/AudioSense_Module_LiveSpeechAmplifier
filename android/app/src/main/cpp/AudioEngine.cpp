#include <oboe/Oboe.h>
#include "tensorflow/lite/interpreter.h"
#include "tensorflow/lite/kernels/register.h"
#include "tensorflow/lite/model.h"

class AudioEngine : public oboe::AudioStreamCallback {
public:
    AudioEngine() {
        // Initialize TFLite model
        model = tflite::FlatBufferModel::BuildFromFile("model_quant.tflite");
        tflite::ops::builtin::BuiltinOpResolver resolver;
        tflite::InterpreterBuilder(*model, resolver)(&interpreter);
        
        interpreter->AllocateTensors();
        input_tensor = interpreter->typed_input_tensor<float>(0);
        output_tensor = interpreter->typed_output_tensor<float>(0);
    }

    oboe::DataCallbackResult onAudioReady(oboe::AudioStream *audioStream, 
                                        void *audioData, 
                                        int32_t numFrames) override {
        float *floatData = (float *)audioData;

        // Process 5ms frames (80 samples at 16kHz)
        // Note: Real implementation would use a ring buffer if numFrames != 80
        for (int i = 0; i < numFrames; ++i) {
            input_buffer[buffer_ptr++] = floatData[i];
            
            if (buffer_ptr == 80) {
                // Perform Inference
                std::copy(input_buffer, input_buffer + 80, input_tensor);
                interpreter->Invoke();
                std::copy(output_tensor, output_tensor + 80, output_buffer);
                
                // Copy processed data back to output stream (wired headphones)
                // In a real bionic ear, we'd output here.
                buffer_ptr = 0;
            }
            
            // For simplicity, we just pass back the output buffer
            floatData[i] = output_buffer[i % 80] * gain; 
        }

        return oboe::DataCallbackResult::Continue;
    }

    void start() {
        oboe::AudioStreamBuilder builder;
        builder.setCallback(this)
            ->setPerformanceMode(oboe::PerformanceMode::LowLatency)
            ->setSharingMode(oboe::SharingMode::Exclusive)
            ->setFormat(oboe::AudioFormat::Float)
            ->setChannelCount(oboe::ChannelCount::Mono)
            ->setSampleRate(16000)
            ->openStream(&stream);
        
        stream->requestStart();
    }

private:
    std::unique_ptr<tflite::FlatBufferModel> model;
    std::unique_ptr<tflite::Interpreter> interpreter;
    float* input_tensor;
    float* output_tensor;
    
    float input_buffer[80];
    float output_buffer[80];
    int buffer_ptr = 0;
    float gain = 1.5f; // User adjustable via UI
    
    oboe::AudioStream *stream;
};
