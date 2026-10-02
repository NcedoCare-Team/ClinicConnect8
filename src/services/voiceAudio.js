import {
  AudioModule,
  AudioQuality,
  IOSOutputFormat,
  createAudioPlayer,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';

export { requestRecordingPermissionsAsync };

const PCM_WAV_OPTIONS = {
  extension: '.wav',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 128000,
  android: {
    extension: '.wav',
    outputFormat: 'default',
    audioEncoder: 'default',
    sampleRate: 16000,
  },
  ios: {
    extension: '.wav',
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.HIGH,
    sampleRate: 16000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/wav',
    bitsPerSecond: 256000,
  },
};

function releaseNative(nativeObject) {
  if (!nativeObject) return;
  try {
    if (typeof nativeObject.release === 'function') nativeObject.release();
    else if (typeof nativeObject.remove === 'function') nativeObject.remove();
  } catch {
    /* already released */
  }
}

export async function configureVoiceAudioMode(recording) {
  await setAudioModeAsync({
    allowsRecording: recording,
    playsInSilentMode: true,
    shouldPlayInBackground: false,
    interruptionMode: 'doNotMix',
    shouldRouteThroughEarpiece: false,
  });
}

export async function startWavRecorder() {
  const recorder = new AudioModule.AudioRecorder({
    extension: '.wav',
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 128000,
    isMeteringEnabled: false,
  });
  await recorder.prepareToRecordAsync(PCM_WAV_OPTIONS);
  recorder.record();
  return recorder;
}

export async function finishWavRecorder(recorder) {
  if (!recorder) return null;
  let uri = null;
  try {
    await recorder.stop();
    uri = recorder.uri;
  } catch {
    uri = recorder.uri;
  }
  releaseNative(recorder);
  return uri;
}

export function playFile(uri, { volume = 1, onFinish } = {}) {
  const player = createAudioPlayer({ uri }, { updateInterval: 100 });
  player.volume = volume;
  let settled = false;

  const subscription = player.addListener('playbackStatusUpdate', (status) => {
    if (!status?.didJustFinish || settled) return;
    settled = true;
    try { subscription.remove(); } catch { /* ignore */ }
    releaseNative(player);
    onFinish?.();
  });

  player.play();

  return {
    stop() {
      if (settled) return;
      settled = true;
      try { subscription.remove(); } catch { /* ignore */ }
      try { player.pause(); } catch { /* ignore */ }
      releaseNative(player);
    },
  };
}
