#import <AudioToolbox/AudioToolbox.h>
#import <AVFoundation/AVFoundation.h>
#include "../../cpp_core/EngineCore.cpp"

@interface IOSVoiceWrapper : NSObject {
    AudioUnit _voiceIOUnit;
    std::unique_ptr<EngineCore> _engine;
}
@end

@implementation IOSVoiceWrapper

- (void)setupVoiceProcessingIO {
    // 1. Setup Audio Session for Voice Processing
    AVAudioSession *session = [AVAudioSession sharedInstance];
    [session setCategory:AVAudioSessionCategoryPlayAndRecord 
             withOptions:AVAudioSessionCategoryOptionAllowBluetooth | AVAudioSessionCategoryOptionDefaultToSpeaker
                   error:nil];
    [session setMode:AVAudioSessionModeVoiceChat error:nil];
    [session setActive:YES error:nil];

    // 2. Use VoiceProcessingIO instead of RemoteIO for Hardware AEC
    AudioComponentDescription desc;
    desc.componentType = kAudioUnitType_Output;
    desc.componentSubType = kAudioUnitSubType_VoiceProcessingIO; // Mandatory for AEC
    desc.componentManufacturer = kAudioUnitManufacturer_Apple;
    
    AudioComponent comp = AudioComponentFindNext(NULL, &desc);
    AudioComponentInstanceNew(comp, &_voiceIOUnit);

    // 3. Enable Input/Output and Set Callbacks...
    // (Similar to previous wrapper but with VPIO specific properties)
    
    // Enable Hardware AEC explicitly (if not already enabled by subtype)
    UInt32 echoCancellation = 1;
    AudioUnitSetProperty(_voiceIOUnit, kAUVoiceIOProperty_BypassVoiceProcessing, 
                        kAudioUnitScope_Global, 0, &echoCancellation, sizeof(echoCancellation));

    AudioUnitInitialize(_voiceIOUnit);
    AudioOutputUnitStart(_voiceIOUnit);
}

// Callback will pass data to _engine->processAudio(...)
@end
