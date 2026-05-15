#include <vector>
#include <memory>
#include "tensorflow/lite/interpreter.h"
#include "tensorflow/lite/kernels/register.h"
#include "tensorflow/lite/model.h"

/**
 * AudioEngineCore: Platform-agnostic C++ logic for TFLite inference.
 * Designed to be called from Oboe (Android) or Core Audio (iOS).
 */
class AudioEngineCore {
public:
    AudioEngineCore(const char* modelPath) {
        model = tflite::FlatBufferModel::BuildFromFile(modelPath);
        tflite::ops::builtin::BuiltinOpResolver resolver;
        tflite::InterpreterBuilder(*model, resolver)(&interpreter);
        
        interpreter->AllocateTensors();
        input_tensor = interpreter->typed_input_tensor<float>(0);
        output_tensor = interpreter->typed_output_tensor<float>(0);
        
        enabled = false;
        gain = 1.0f;
    }

    // Process a 5ms frame (80 samples @ 16kHz)
    void processFrame(const float* input, float* output, int numSamples) {
        if (!enabled) {
            std::copy(input, input + numSamples, output);
            return;
        }

        // Copy input to TFLite input tensor
        std::copy(input, input + numSamples, input_tensor);

        // Run Inference
        interpreter->Invoke();

        // Copy from TFLite output tensor to output buffer with gain
        for (int i = 0; i < numSamples; ++i) {
            output[i] = output_tensor[i] * gain;
        }
    }

    void setEnabled(bool isEnabled) { enabled = isEnabled; }
    void setGain(float newGain) { gain = newGain; }

private:
    std::unique_ptr<tflite::FlatBufferModel> model;
    std::unique_ptr<tflite::Interpreter> interpreter;
    float* input_tensor;
    float* output_tensor;
    
    bool enabled;
    float gain;
};
