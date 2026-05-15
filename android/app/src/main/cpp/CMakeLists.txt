cmake_minimum_required(VERSION 3.18.1)

project(LiveSpeechAmplifier)

# Find Oboe (assuming it's installed or added as a dependency)
find_package(oboe REQUIRED)

# Add Shared Core and Wrappers
add_library(
    live-speech-amplifier
    SHARED
    AndroidOboeWrapper.cpp
    ../../../../src/native/JSIBridge.cpp
)

# Include directories
target_include_directories(
    live-speech-amplifier
    PRIVATE
    ../../../../cpp_core
    ../../../../src/native
)

# Link libraries
target_link_libraries(
    live-speech-amplifier
    oboe::oboe
    tensorflowlite
    log
    android
)
