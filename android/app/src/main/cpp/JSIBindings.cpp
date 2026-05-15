#include <jsi/jsi.h>
#include "AudioEngine.cpp"

using namespace facebook;

class AudioEngineJSI : public jsi::HostObject {
public:
    AudioEngineJSI(std::shared_ptr<AudioEngine> engine) : engine_(engine) {}

    jsi::Value get(jsi::Runtime &runtime, const jsi::PropNameID &name) override {
        auto methodName = name.utf8(runtime);

        if (methodName == "setProcessingEnabled") {
            return jsi::Function::createFromHostFunction(
                runtime, name, 1,
                [this](jsi::Runtime &runtime, const jsi::Value &thisValue, const jsi::Value *arguments, size_t count) -> jsi::Value {
                    bool enabled = arguments[0].asBool();
                    engine_->setEnabled(enabled);
                    return jsi::Value::undefined();
                });
        }

        if (methodName == "setGain") {
            return jsi::Function::createFromHostFunction(
                runtime, name, 1,
                [this](jsi::Runtime &runtime, const jsi::Value &thisValue, const jsi::Value *arguments, size_t count) -> jsi::Value {
                    float gain = (float)arguments[0].asNumber();
                    engine_->setGain(gain);
                    return jsi::Value::undefined();
                });
        }

        return jsi::Value::undefined();
    }

private:
    std::shared_ptr<AudioEngine> engine_;
};

// Installation function (to be called from NativeModule)
void installAudioJSI(jsi::Runtime &runtime, std::shared_ptr<AudioEngine> engine) {
    auto engineHostObject = std::make_shared<AudioEngineJSI>(engine);
    jsi::Object engineObject = jsi::Object::createFromHostObject(runtime, engineHostObject);
    runtime.global().setProperty(runtime, "AudioEngine", std::move(engineObject));
}
