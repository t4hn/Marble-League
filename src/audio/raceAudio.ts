/**
 * Procedural Web Audio synthesizer for Marble League Sprint broadcasts.
 * Zero external audio files — all tones and rolling noise are synthesized cleanly.
 */
export class RaceAudioEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private rollGain: GainNode | null = null;
  private rollFilter: BiquadFilterNode | null = null;
  private rollSource: AudioBufferSourceNode | null = null;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.rollGain && this.ctx) {
      this.rollGain.gain.setTargetAtTime(muted ? 0 : 0.0, this.ctx.currentTime, 0.04);
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playStartTone(isGo: boolean): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = isGo ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(isGo ? 880 : 440, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(isGo ? 0.14 : 0.09, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (isGo ? 0.34 : 0.16));

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + (isGo ? 0.36 : 0.18));
  }

  public playFinishChime(position: number): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const baseFreq = position === 1 ? 784 : position <= 3 ? 659.25 : 523.25;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, now);
    if (position === 1) {
      osc.frequency.setValueAtTime(1046.5, now + 0.09);
    }
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(position === 1 ? 0.13 : 0.06, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (position === 1 ? 0.45 : 0.22));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.48);
  }

  public updateRollingBed(active: boolean, averageSpeed: number): void {
    if (this.muted || !active) {
      if (this.rollGain && this.ctx) {
        this.rollGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
      }
      return;
    }
    const ctx = this.ensureContext();
    if (!ctx) return;

    if (!this.rollSource) {
      const bufferSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.35;
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 320;
      filter.Q.value = 2.2;

      const gain = ctx.createGain();
      gain.gain.value = 0;

      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start();

      this.rollSource = src;
      this.rollFilter = filter;
      this.rollGain = gain;
    }

    if (this.rollGain && this.rollFilter) {
      const normSpeed = Math.max(0, Math.min(1, averageSpeed / 13));
      this.rollFilter.frequency.setTargetAtTime(220 + normSpeed * 520, ctx.currentTime, 0.08);
      this.rollGain.gain.setTargetAtTime(normSpeed * 0.045, ctx.currentTime, 0.08);
    }
  }

  public dispose(): void {
    try {
      this.rollSource?.stop();
      this.rollSource?.disconnect();
      if (this.ctx && this.ctx.state !== 'closed') {
        void this.ctx.close();
      }
    } catch {
      // Ignore audio cleanup errors
    }
    this.rollSource = null;
    this.rollGain = null;
    this.rollFilter = null;
    this.ctx = null;
  }
}
