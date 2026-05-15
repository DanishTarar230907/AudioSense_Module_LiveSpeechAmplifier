#include <jsi/jsi.h>

using namespace facebook;

/**
 * Platform-agnostic JSI Bridge.
 * Wraps the calls to whichever platform-specific wrapper is active.
 */
class UnifiedAudioJSI : public jsi::HostObject {
public:
    // We pass in pointers to the enable/gain functions of the respective wrapper
    UnifiedAudioJSI(std::function<void(bool)> setEnabled, std::function<void(float)> setGain)
        : setEnabled_(setEnabled), setGain_(setGain) {}

    jsi::Value get(jsi::Runtime &runtime, const jsi::PropNameID &name) override {
        auto methodName = name.utf8(runtime);

        if (methodName == "setEnabled") {
            return jsi::Function::createFromHostFunction(
                runtime, name, 1,
                [this](jsi::Runtime &runtime, const jsi::Value &thisValue, const jsi::Value *arguments, size_t count) -> jsi::Value {
                    setEnabled_(arguments[0].asBool());
                    return jsi::Value::undefined();
                });
        }

        if (methodName == "setGain") {
            return jsi::Function::createFromHostFunction(
                runtime, name, 1,
                [this](jsi::Runtime &runtime, const jsi::Value &thisValue, const jsi::Value *arguments, size_t count) -> jsi::Value {
                    setGain_((float)arguments[0].asNumber());
                    return jsi::Value::undefined();
                });
        }

        return jsi::Value::undefined();
    }

private:
    std::function<void(bool)> setEnabled_;
    std::function<void(float)> setGain_;
};

// Global installation function
void installUnifiedAudioJSI(jsi::Runtime &runtime, std::function<void(bool)> setEnabled, std::function<void(float)> setGain) {
    auto hostObject = std::make_shared<UnifiedAudioJSI>(setEnabled, setGain);
    runtime.global().setProperty(runtime, "AudioCore", jsi::Object::createFromHostObject(runtime, hostObject));
}
