#import <AudioToolbox/AudioToolbox.h>
#import <AVFoundation/AVFoundation.h>
#include "../../cpp_core/AudioEngineCore.cpp"

@interface IOSAudioUnitWrapper : NSObject {
    AudioUnit _audioUnit;
    std::unique_ptr<AudioEngineCore> _engineCore;
}
@end

@implementation IOSAudioUnitWrapper

- (instancetype)initWithModelPath:(NSString *)modelPath {
    self = [super init];
    if (self) {
        _engineCore = std::make_unique<AudioEngineCore>([modelPath UTF8String]);
        [self setupAudioUnit];
    }
    return self;
}

static OSStatus playbackCallback(void *inRefCon, 
                                AudioUnitRenderActionFlags *ioActionFlags, 
                                const AudioTimeStamp *inTimeStamp, 
                                UInt32 inBusNumber, 
                                UInt32 inNumberFrames, 
                                AudioBufferList *ioData) {
    
    IOSAudioUnitWrapper *wrapper = (__bridge IOSAudioUnitWrapper *)inRefCon;
    
    // Render input from microphone into ioData
    AudioUnitRender(wrapper->_audioUnit, ioActionFlags, inTimeStamp, 1, inNumberFrames, ioData);
    
    float *buffer = (float *)ioData->mBuffers[0].mData;
    
    // Process via Shared C++ Core
    wrapper->_engineCore->processFrame(buffer, buffer, inNumberFrames);
    
    return noErr;
}

- (void)setupAudioUnit {
    AudioComponentDescription desc;
    desc.componentType = kAudioUnitType_Output;
    desc.componentSubType = kAudioUnitSubType_RemoteIO;
    desc.componentFlags = 0;
    desc.componentFlagsMask = 0;
    desc.componentManufacturer = kAudioUnitManufacturer_Apple;
    
    AudioComponent inputComponent = AudioComponentFindNext(NULL, &desc);
    AudioComponentInstanceNew(inputComponent, &_audioUnit);
    
    // Enable IO for both input and output
    UInt32 flag = 1;
    AudioUnitSetProperty(_audioUnit, kAudioOutputUnitProperty_EnableIO, kAudioUnitScope_Input, 1, &flag, sizeof(flag));
    AudioUnitSetProperty(_audioUnit, kAudioOutputUnitProperty_EnableIO, kAudioUnitScope_Output, 0, &flag, sizeof(flag));
    
    // Set format (Mono, 16kHz, Float)
    AudioStreamBasicDescription streamFormat;
    streamFormat.mSampleRate = 16000.0;
    streamFormat.mFormatID = kAudioFormatLinearPCM;
    streamFormat.mFormatFlags = kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked;
    streamFormat.mFramesPerPacket = 1;
    streamFormat.mChannelsPerFrame = 1;
    streamFormat.mBitsPerChannel = 32;
    streamFormat.mBytesPerPacket = 4;
    streamFormat.mBytesPerFrame = 4;
    
    AudioUnitSetProperty(_audioUnit, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Input, 0, &streamFormat, sizeof(streamFormat));
    AudioUnitSetProperty(_audioUnit, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Output, 1, &streamFormat, sizeof(streamFormat));
    
    // Set callback
    AURenderCallbackStruct callbackStruct;
    callbackStruct.inputProc = playbackCallback;
    callbackStruct.inputProcRefCon = (__bridge void *)(self);
    AudioUnitSetProperty(_audioUnit, kAudioUnitProperty_SetRenderCallback, kAudioUnitScope_Global, 0, &callbackStruct, sizeof(callbackStruct));
    
    AudioUnitInitialize(_audioUnit);
    AudioOutputUnitStart(_audioUnit);
}

- (void)setEnabled:(BOOL)enabled { _engineCore->setEnabled(enabled); }
- (void)setGain:(float)gain { _engineCore->setGain(gain); }

@end
