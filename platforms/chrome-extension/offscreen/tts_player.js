// TTS Audio Player for Chrome Extension
// Mirrors Swift AudioPlayer.swift implementation:
// - 48kHz mono PCM playback
// - 2ms cosine fade-out (96 samples @ 48kHz)
// - Direct scheduling for continuous playback

// Debug mode (set to false in production)
const DEBUG_TTS = false;

export class TTSPlayer {
  constructor() {
    this.audioContext = null;
    this.nextStartTime = 0;
    this.isRunning = false;
  }

  async start() {
    if (this.audioContext) return;

    // Create AudioContext with 48kHz sample rate (matching Swift)
    this.audioContext = new (self.AudioContext || self.webkitAudioContext)({
      sampleRate: 48000
    });

    // Resume if suspended
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.nextStartTime = this.audioContext.currentTime;
    this.isRunning = true;
    if (DEBUG_TTS) console.log('[TTSPlayer] Started with 48kHz sample rate');
  }

  stop() {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.isRunning = false;
    this.nextStartTime = 0;
    if (DEBUG_TTS) console.log('[TTSPlayer] Stopped');
  }

  /**
   * Enqueue PCM16 audio data for playback
   * Mirrors Swift AudioPlayer.enqueuePCM16(_ data: Data)
   *
   * @param {ArrayBuffer} pcmBytes - PCM S16LE audio data (48kHz mono)
   */
  enqueuePCM16(pcmBytes) {
    if (!this.audioContext || !this.isRunning) {
      if (DEBUG_TTS) console.warn('[TTSPlayer] Not started, ignoring audio data');
      return;
    }

    // Convert PCM S16LE to Float32 (mirroring Swift: Float($0) / 32768.0)
    const int16Array = new Int16Array(pcmBytes);
    const frameCount = int16Array.length;

    if (frameCount === 0) return;

    const float32Array = new Float32Array(frameCount);
    for (let i = 0; i < frameCount; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }

    // Apply 2ms cosine fade-out to prevent popping (Swift: 96 samples @ 48kHz)
    const fadeSamples = Math.min(96, frameCount); // 2ms @ 48kHz ≈ 96 samples
    if (fadeSamples > 0) {
      for (let i = 0; i < fadeSamples; i++) {
        // Swift formula: let t = Double(i) / Double(fadeSamples - 1)
        //                let gain = Float(cos((.pi / 2.0) * t)) // 1 -> 0
        const t = i / (fadeSamples - 1);
        const gain = Math.cos((Math.PI / 2.0) * t); // 1 → 0
        const idx = frameCount - fadeSamples + i;
        float32Array[idx] *= gain;
      }
    }

    // Create AudioBuffer (mirroring Swift AVAudioPCMBuffer)
    const buffer = this.audioContext.createBuffer(
      1,           // mono (Swift: channels: 1)
      frameCount,
      48000        // 48kHz (Swift: sampleRate: 48_000)
    );
    buffer.getChannelData(0).set(float32Array);

    // Schedule playback (mirroring Swift player.scheduleBuffer)
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);

    // Continuous playback scheduling
    const now = this.audioContext.currentTime;
    const startTime = Math.max(now, this.nextStartTime);
    source.start(startTime);

    // Update next start time for seamless playback
    this.nextStartTime = startTime + buffer.duration;

    if (DEBUG_TTS) {
      console.log(`[TTSPlayer] Scheduled ${frameCount} samples (${(buffer.duration * 1000).toFixed(1)}ms) at ${startTime.toFixed(3)}s`);
    }
  }

  getState() {
    return {
      isRunning: this.isRunning,
      sampleRate: this.audioContext?.sampleRate || 0,
      currentTime: this.audioContext?.currentTime || 0,
      nextStartTime: this.nextStartTime
    };
  }
}
