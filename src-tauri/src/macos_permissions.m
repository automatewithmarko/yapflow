#import <AVFoundation/AVFoundation.h>
#import <AVFAudio/AVFAudio.h>
#import <AppKit/AppKit.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#import <CoreMedia/CoreMedia.h>
#import <CoreAudio/CoreAudio.h>
#import <Vision/Vision.h>

// Read the permission of this application, not the WKWebView origin. No audio
// device is opened and this function never presents a permission prompt.
int yapflow_microphone_status(void) {
    return (int)[AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio];
}

// Request microphone access through the signed native process and do not
// return until macOS has delivered the user's decision. Returning immediately
// caused the setup wizard to advance before TCC had registered YapFlow, which
// could leave System Settings with no YapFlow row to enable.
int yapflow_request_microphone(void) {
    AVAuthorizationStatus current = [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio];
    if (current != AVAuthorizationStatusNotDetermined) return (int)current;

    dispatch_semaphore_t finished = dispatch_semaphore_create(0);
    __block BOOL callbackFinished = NO;
    void (^completion)(BOOL) = ^(BOOL granted) {
        (void)granted;
        callbackFinished = YES;
        dispatch_semaphore_signal(finished);
    };

    // AVAudioApplication is Apple's current macOS recording-permission API.
    // Keep AVCaptureDevice as the supported fallback for macOS 13.
    if (@available(macOS 14.0, *)) {
        [AVAudioApplication requestRecordPermissionWithCompletionHandler:completion];
    } else {
        [AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio completionHandler:completion];
    }

    NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:90.0];
    if ([NSThread isMainThread]) {
        // Keep the AppKit event loop alive while the native permission sheet is
        // visible so its completion handler can be delivered on the main queue.
        while (!callbackFinished && [deadline timeIntervalSinceNow] > 0) {
            [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode
                                      beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
        }
    } else {
        dispatch_semaphore_wait(finished, dispatch_time(DISPATCH_TIME_NOW, 90 * NSEC_PER_SEC));
    }

    return (int)[AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio];
}

// Bit 0 = Zoom has live input; bit 1 = Zoom has live output. This reads
// macOS' per-process HAL state rather than relying on YapFlow history.
static int yapflow_audio_activity_for_bundle_prefix(NSString *bundlePrefix) {
    AudioObjectPropertyAddress processList = {
        kAudioHardwarePropertyProcessObjectList,
        kAudioObjectPropertyScopeGlobal,
        kAudioObjectPropertyElementMain
    };
    UInt32 byteCount = 0;
    if (AudioObjectGetPropertyDataSize(kAudioObjectSystemObject, &processList, 0, NULL, &byteCount) != noErr || byteCount == 0) return 0;

    AudioObjectID *processes = malloc(byteCount);
    if (!processes) return 0;
    if (AudioObjectGetPropertyData(kAudioObjectSystemObject, &processList, 0, NULL, &byteCount, processes) != noErr) {
        free(processes);
        return 0;
    }

    int activity = 0;
    UInt32 count = byteCount / sizeof(AudioObjectID);
    for (UInt32 index = 0; index < count; index++) {
        AudioObjectPropertyAddress bundleProperty = {
            kAudioProcessPropertyBundleID,
            kAudioObjectPropertyScopeGlobal,
            kAudioObjectPropertyElementMain
        };
        CFStringRef bundleID = NULL;
        UInt32 bundleSize = sizeof(bundleID);
        if (AudioObjectGetPropertyData(processes[index], &bundleProperty, 0, NULL, &bundleSize, &bundleID) != noErr || !bundleID) continue;
        BOOL matches = [(__bridge NSString *)bundleID hasPrefix:bundlePrefix];
        CFRelease(bundleID);
        if (!matches) continue;

        UInt32 runningInput = 0;
        UInt32 runningOutput = 0;
        UInt32 valueSize = sizeof(UInt32);
        AudioObjectPropertyAddress inputProperty = {
            kAudioProcessPropertyIsRunningInput,
            kAudioObjectPropertyScopeGlobal,
            kAudioObjectPropertyElementMain
        };
        AudioObjectPropertyAddress outputProperty = {
            kAudioProcessPropertyIsRunningOutput,
            kAudioObjectPropertyScopeGlobal,
            kAudioObjectPropertyElementMain
        };
        AudioObjectGetPropertyData(processes[index], &inputProperty, 0, NULL, &valueSize, &runningInput);
        valueSize = sizeof(UInt32);
        AudioObjectGetPropertyData(processes[index], &outputProperty, 0, NULL, &valueSize, &runningOutput);
        if (runningInput) activity |= 1;
        if (runningOutput) activity |= 2;
    }
    free(processes);
    return activity;
}

int yapflow_zoom_audio_activity(void) {
    return yapflow_audio_activity_for_bundle_prefix(@"us.zoom.");
}

int yapflow_chrome_audio_activity(void) {
    return yapflow_audio_activity_for_bundle_prefix(@"com.google.Chrome");
}

@interface YapFlowSystemAudioOutput : NSObject <SCStreamOutput>
@property(nonatomic, strong) NSMutableData *samples;
@end

@implementation YapFlowSystemAudioOutput
- (instancetype)init {
    self = [super init];
    if (self) _samples = [NSMutableData data];
    return self;
}

- (void)stream:(SCStream *)stream didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer ofType:(SCStreamOutputType)type {
    (void)stream;
    if (type != SCStreamOutputTypeAudio || !CMSampleBufferDataIsReady(sampleBuffer)) return;
    AudioBufferList buffers;
    CMBlockBufferRef block = NULL;
    size_t needed = 0;
    OSStatus status = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
        sampleBuffer, &needed, &buffers, sizeof(buffers), NULL, NULL,
        kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment, &block);
    if (status == noErr) {
        @synchronized (self) {
            for (UInt32 index = 0; index < buffers.mNumberBuffers; index++) {
                AudioBuffer buffer = buffers.mBuffers[index];
                if (buffer.mData && buffer.mDataByteSize) [_samples appendBytes:buffer.mData length:buffer.mDataByteSize];
            }
        }
    }
    if (block) CFRelease(block);
}
@end

static SCStream *yapflow_audio_stream = nil;
static YapFlowSystemAudioOutput *yapflow_audio_output = nil;

int yapflow_start_system_audio(void) {
    if (@available(macOS 13.0, *)) {
        if (yapflow_audio_stream) return 0;
        dispatch_semaphore_t contentReady = dispatch_semaphore_create(0);
        __block SCShareableContent *content = nil;
        __block NSError *contentError = nil;
        [SCShareableContent getShareableContentExcludingDesktopWindows:YES onScreenWindowsOnly:YES completionHandler:^(SCShareableContent *result, NSError *error) {
            content = result; contentError = error; dispatch_semaphore_signal(contentReady);
        }];
        if (dispatch_semaphore_wait(contentReady, dispatch_time(DISPATCH_TIME_NOW, 8 * NSEC_PER_SEC)) != 0 || contentError || content.displays.count == 0) return -1;

        SCContentFilter *filter = [[SCContentFilter alloc] initWithDisplay:content.displays.firstObject excludingWindows:@[]];
        SCStreamConfiguration *configuration = [SCStreamConfiguration new];
        configuration.width = 2;
        configuration.height = 2;
        configuration.minimumFrameInterval = CMTimeMake(1, 1);
        configuration.capturesAudio = YES;
        configuration.excludesCurrentProcessAudio = YES;
        configuration.sampleRate = 16000;
        configuration.channelCount = 1;

        YapFlowSystemAudioOutput *output = [YapFlowSystemAudioOutput new];
        SCStream *stream = [[SCStream alloc] initWithFilter:filter configuration:configuration delegate:nil];
        NSError *outputError = nil;
        if (![stream addStreamOutput:output type:SCStreamOutputTypeAudio sampleHandlerQueue:dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0) error:&outputError] || outputError) return -2;

        dispatch_semaphore_t started = dispatch_semaphore_create(0);
        __block NSError *startError = nil;
        [stream startCaptureWithCompletionHandler:^(NSError *error) { startError = error; dispatch_semaphore_signal(started); }];
        if (dispatch_semaphore_wait(started, dispatch_time(DISPATCH_TIME_NOW, 8 * NSEC_PER_SEC)) != 0 || startError) return -3;
        yapflow_audio_output = output;
        yapflow_audio_stream = stream;
        return 0;
    }
    return -4;
}

int yapflow_stop_system_audio(float **samples, size_t *sample_count) {
    if (!samples || !sample_count || !yapflow_audio_stream || !yapflow_audio_output) return -1;
    dispatch_semaphore_t stopped = dispatch_semaphore_create(0);
    __block NSError *stopError = nil;
    [yapflow_audio_stream stopCaptureWithCompletionHandler:^(NSError *error) { stopError = error; dispatch_semaphore_signal(stopped); }];
    if (dispatch_semaphore_wait(stopped, dispatch_time(DISPATCH_TIME_NOW, 8 * NSEC_PER_SEC)) != 0 || stopError) return -2;
    @synchronized (yapflow_audio_output) {
        *sample_count = yapflow_audio_output.samples.length / sizeof(float);
        *samples = malloc(yapflow_audio_output.samples.length);
        if (!*samples && *sample_count > 0) return -3;
        memcpy(*samples, yapflow_audio_output.samples.bytes, yapflow_audio_output.samples.length);
    }
    yapflow_audio_stream = nil;
    yapflow_audio_output = nil;
    return 0;
}

void yapflow_free_system_audio(float *samples) { free(samples); }

// Fast, on-device fallback for custom-drawn controls that are missing from the
// Accessibility tree. Vision runs in its speed-prioritized mode and returns
// only text plus click coordinates; no screenshot leaves the process.
char *yapflow_fast_front_window_ocr_json(void) {
    @autoreleasepool {
        pid_t pid = [NSWorkspace sharedWorkspace].frontmostApplication.processIdentifier;
        CFArrayRef rawWindows = CGWindowListCopyWindowInfo(
            kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
            kCGNullWindowID);
        NSArray *windows = CFBridgingRelease(rawWindows);
        NSDictionary *selected = nil;
        double largestArea = 0;
        for (NSDictionary *window in windows) {
            if ([window[(id)kCGWindowOwnerPID] intValue] != pid ||
                [window[(id)kCGWindowLayer] intValue] != 0 ||
                [window[(id)kCGWindowAlpha] doubleValue] <= 0) continue;
            CGRect bounds = CGRectZero;
            if (!CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)window[(id)kCGWindowBounds], &bounds)) continue;
            double area = bounds.size.width * bounds.size.height;
            if (area > largestArea) { selected = window; largestArea = area; }
        }
        if (!selected) return NULL;
        CGRect windowBounds = CGRectZero;
        if (!CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)selected[(id)kCGWindowBounds], &windowBounds)) return NULL;
        CGWindowID windowID = [selected[(id)kCGWindowNumber] unsignedIntValue];
        dispatch_semaphore_t contentReady = dispatch_semaphore_create(0);
        __block SCShareableContent *content = nil;
        [SCShareableContent getShareableContentExcludingDesktopWindows:YES onScreenWindowsOnly:YES completionHandler:^(SCShareableContent *result, NSError *error) {
            (void)error; content = result; dispatch_semaphore_signal(contentReady);
        }];
        if (dispatch_semaphore_wait(contentReady, dispatch_time(DISPATCH_TIME_NOW, 2 * NSEC_PER_SEC)) != 0 || !content) return NULL;
        SCWindow *screenWindow = nil;
        for (SCWindow *candidate in content.windows) {
            if (candidate.windowID == windowID) { screenWindow = candidate; break; }
        }
        if (!screenWindow) return NULL;
        SCContentFilter *filter = [[SCContentFilter alloc] initWithDesktopIndependentWindow:screenWindow];
        SCStreamConfiguration *configuration = [SCStreamConfiguration new];
        configuration.width = MAX(1, (size_t)windowBounds.size.width);
        configuration.height = MAX(1, (size_t)windowBounds.size.height);
        configuration.showsCursor = NO;
        dispatch_semaphore_t imageReady = dispatch_semaphore_create(0);
        __block CGImageRef image = NULL;
        if (@available(macOS 14.0, *)) {
            [SCScreenshotManager captureImageWithFilter:filter configuration:configuration completionHandler:^(CGImageRef result, NSError *error) {
                (void)error;
                if (result) image = CGImageRetain(result);
                dispatch_semaphore_signal(imageReady);
            }];
        } else {
            return NULL;
        }
        if (dispatch_semaphore_wait(imageReady, dispatch_time(DISPATCH_TIME_NOW, 2 * NSEC_PER_SEC)) != 0) return NULL;
        if (!image) return NULL;

        VNRecognizeTextRequest *request = [VNRecognizeTextRequest new];
        request.recognitionLevel = VNRequestTextRecognitionLevelFast;
        request.usesLanguageCorrection = NO;
        request.automaticallyDetectsLanguage = YES;
        request.minimumTextHeight = 0.012;
        VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:image options:@{}];
        NSError *error = nil;
        BOOL succeeded = [handler performRequests:@[request] error:&error];
        CGImageRelease(image);
        if (!succeeded || error) return NULL;

        NSMutableArray *items = [NSMutableArray array];
        for (VNRecognizedTextObservation *observation in request.results) {
            VNRecognizedText *candidate = [[observation topCandidates:1] firstObject];
            if (!candidate || candidate.string.length == 0 || candidate.confidence < 0.30) continue;
            CGRect box = observation.boundingBox;
            double x = windowBounds.origin.x + (box.origin.x + box.size.width / 2.0) * windowBounds.size.width;
            double y = windowBounds.origin.y + (1.0 - box.origin.y - box.size.height / 2.0) * windowBounds.size.height;
            [items addObject:@{ @"text": candidate.string, @"x": @(x), @"y": @(y) }];
            if (items.count >= 100) break;
        }
        NSData *json = [NSJSONSerialization dataWithJSONObject:items options:0 error:&error];
        if (!json || error) return NULL;
        NSString *string = [[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding];
        return string ? strdup(string.UTF8String) : NULL;
    }
}

void yapflow_free_c_string(char *value) { free(value); }
