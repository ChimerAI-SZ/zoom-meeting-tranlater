// AudioWorkletProcessor: Resample to 16kHz mono and emit 80ms PCM16 frames (1280 samples)
// Aligns with Swift AudioManager (16kHz mono, 80ms framing)

class PCM16KFramer extends AudioWorkletProcessor {
  constructor() {
    super();
    // Target params
    this.targetRate = 16000;
    this.frameSamples = 1280; // 80ms @ 16kHz
    this.acc = new Float32Array(0);
    this.ratio = sampleRate / this.targetRate; // inputRate / 16000
  }

  static get parameterDescriptors() { return []; }

  // Simple resampler: take every ratio-th sample with linear interpolation
  _resampleMono(input) {
    if (this.ratio === 1) return input.slice(0);
    const inLen = input.length;
    const outLen = Math.floor(inLen / this.ratio);
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const pos = i * this.ratio;
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const s0 = input[idx] || 0;
      const s1 = input[Math.min(idx + 1, inLen - 1)] || 0;
      out[i] = s0 + (s1 - s0) * frac;
    }
    return out;
  }

  _appendAndEmit(fr) {
    // Append
    const combined = new Float32Array(this.acc.length + fr.length);
    combined.set(this.acc, 0);
    combined.set(fr, this.acc.length);
    this.acc = combined;

    // Emit 80ms frames
    while (this.acc.length >= this.frameSamples) {
      const chunk = this.acc.slice(0, this.frameSamples);
      this.acc = this.acc.slice(this.frameSamples);

      // Float32 [-1,1] -> PCM16 LE
      const out = new Int16Array(this.frameSamples);
      for (let i = 0; i < this.frameSamples; i++) {
        const v = Math.max(-1, Math.min(1, chunk[i])) * 32767;
        out[i] = v | 0;
      }
      this.port.postMessage({ type: 'frame', pcm16: out.buffer }, [out.buffer]);
    }
  }

  process(inputs) {
    if (!inputs || inputs.length === 0) return true;
    const chs = inputs[0];
    if (!chs || chs.length === 0) return true;
    // Mixdown to mono if needed
    const left = chs[0];
    const right = chs[1];
    const mono = new Float32Array(left.length);
    if (right && right.length === left.length) {
      for (let i = 0; i < left.length; i++) mono[i] = 0.5 * (left[i] + right[i]);
    } else {
      mono.set(left);
    }
    const res = this._resampleMono(mono);
    this._appendAndEmit(res);
    return true;
  }
}

registerProcessor('pcm16k-framer', PCM16KFramer);

