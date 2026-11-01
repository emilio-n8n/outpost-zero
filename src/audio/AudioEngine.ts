const DAY_CHORDS: number[][] = [
  [146.83, 220.0, 293.66, 369.99],
  [130.81, 196.0, 261.63, 329.63],
  [110.0, 164.81, 220.0, 329.63],
  [123.47, 185.0, 246.94, 369.99],
];

const NIGHT_CHORDS: number[][] = [
  [73.42, 110.0, 146.83, 174.61],
  [65.41, 98.0, 130.81, 155.56],
  [82.41, 123.47, 164.81, 196.0],
  [55.0, 82.41, 110.0, 164.81],
];

const SIEGE_CHORDS: number[][] = [
  [61.74, 92.5, 123.47, 185.0],
  [58.27, 87.31, 116.54, 174.61],
];

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private droneGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private initialized = false;
  private musicTimer = 2;
  private birdTimer = 5;
  private fireTimer = 0;
  private chordIndex = 0;
  private currentNight = 0;
  private currentSiege = false;
  private masterVolume = 0.8;
  private musicVolume = 0.5;
  private sfxVolume = 0.8;

  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const context = new AudioContext();
      this.ctx = context;
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 18;
      compressor.ratio.value = 5;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.25;

      this.masterGain = context.createGain();
      this.musicGain = context.createGain();
      this.sfxGain = context.createGain();
      this.ambientGain = context.createGain();
      this.masterGain.connect(compressor);
      compressor.connect(context.destination);
      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.ambientGain.connect(this.masterGain);

      this.noiseBuffer = this.createNoiseBuffer(context, 3);
      const windSource = context.createBufferSource();
      windSource.buffer = this.noiseBuffer;
      windSource.loop = true;
      this.windFilter = context.createBiquadFilter();
      this.windFilter.type = 'lowpass';
      this.windFilter.frequency.value = 480;
      this.windFilter.Q.value = 0.5;
      this.windGain = context.createGain();
      this.windGain.gain.value = 0.03;
      windSource.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windGain.connect(this.ambientGain);
      windSource.start();

      const droneOscA = context.createOscillator();
      droneOscA.type = 'sine';
      droneOscA.frequency.value = 46;
      const droneOscB = context.createOscillator();
      droneOscB.type = 'sine';
      droneOscB.frequency.value = 68.5;
      const droneFilter = context.createBiquadFilter();
      droneFilter.type = 'lowpass';
      droneFilter.frequency.value = 160;
      this.droneGain = context.createGain();
      this.droneGain.gain.value = 0;
      droneOscA.connect(droneFilter);
      droneOscB.connect(droneFilter);
      droneFilter.connect(this.droneGain);
      this.droneGain.connect(this.ambientGain);
      droneOscA.start();
      droneOscB.start();

      this.initialized = true;
      this.applyVolumes();
    } catch {
      this.ctx = null;
    }
  }

  private createNoiseBuffer(context: AudioContext, seconds: number): AudioBuffer {
    const length = Math.floor(context.sampleRate * seconds);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      previous = (previous + white * 0.02) / 1.02;
      data[i] = previous * 3.2;
    }
    return buffer;
  }

  setVolumes(master: number, music: number, sfx: number): void {
    this.masterVolume = master;
    this.musicVolume = music;
    this.sfxVolume = sfx;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.masterGain?.gain.setTargetAtTime(this.masterVolume, now, 0.05);
    this.musicGain?.gain.setTargetAtTime(this.musicVolume * 0.28, now, 0.05);
    this.sfxGain?.gain.setTargetAtTime(this.sfxVolume * 0.72, now, 0.05);
    this.ambientGain?.gain.setTargetAtTime(0.7 + this.masterVolume * 0.3, now, 0.05);
  }

  update(dt: number, night: number, nearFire: boolean, siege: boolean): void {
    if (!this.ctx || !this.initialized) return;
    this.currentNight = night;
    this.currentSiege = siege;
    const now = this.ctx.currentTime;
    this.windGain?.gain.setTargetAtTime(0.022 + night * 0.045 + (siege ? 0.02 : 0), now, 0.7);
    this.windFilter?.frequency.setTargetAtTime(720 - night * 370, now, 0.8);
    this.droneGain?.gain.setTargetAtTime(night * 0.035 + (siege ? 0.03 : 0), now, 1.2);

    this.musicTimer -= dt;
    if (this.musicTimer <= 0) {
      this.musicTimer = siege ? 3.8 : night > 0.55 ? 6.5 : 8.5;
      this.chordIndex++;
      const chords = siege
        ? SIEGE_CHORDS
        : night > 0.55
          ? NIGHT_CHORDS
          : DAY_CHORDS;
      const chord = chords[this.chordIndex % chords.length] as number[];
      this.playPad(chord, siege ? 3.4 : 7.8, siege ? 0.045 : 0.035, siege);
    }

    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = 3 + Math.random() * 8;
      if (night < 0.35) this.birdChirp();
    }

    if (nearFire) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = 0.08 + Math.random() * 0.5;
        this.noise(0.045, 0.008 + Math.random() * 0.012, 900 + Math.random() * 1800, 'bandpass', 3);
      }
    }
  }

  private playPad(frequencies: number[], duration: number, volume: number, tense: boolean): void {
    if (!this.ctx || !this.musicGain) return;
    const now = this.ctx.currentTime;
    frequencies.forEach((frequency, index) => {
      const oscillator = this.ctx!.createOscillator();
      oscillator.type = index < 2 ? 'sine' : 'triangle';
      oscillator.frequency.value = frequency;
      oscillator.detune.value = (Math.random() - 0.5) * 8;
      const filter = this.ctx!.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = tense ? 900 : 1400;
      filter.Q.value = 0.4;
      const gain = this.ctx!.createGain();
      const peak = volume * (index < 2 ? 1 : 0.55);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(peak, now + 1.6);
      gain.gain.linearRampToValueAtTime(peak * 0.7, now + duration * 0.7);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain!);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.1);
    });
  }

  private tone(
    startFrequency: number,
    endFrequency: number,
    duration: number,
    volume: number,
    type: OscillatorType = 'sine',
    filterFrequency?: number,
  ): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const oscillator = this.ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, startFrequency), now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + Math.min(0.012, duration * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    let node: AudioNode = oscillator;
    if (filterFrequency) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFrequency;
      oscillator.connect(filter);
      node = filter;
    }
    node.connect(gain);
    gain.connect(this.sfxGain);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  }

  private noise(
    duration: number,
    volume: number,
    frequency: number,
    type: BiquadFilterType = 'bandpass',
    q = 1,
  ): void {
    if (!this.ctx || !this.noiseBuffer || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    source.start(now);
    source.stop(now + duration + 0.03);
  }

  private birdChirp(): void {
    if (!this.ctx) return;
    const base = 900 + Math.random() * 800;
    const now = this.ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const delay = i * 0.08;
      const oscillator = this.ctx.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(base, now + delay);
      oscillator.frequency.exponentialRampToValueAtTime(base * 1.5, now + delay + 0.05);
      oscillator.frequency.exponentialRampToValueAtTime(base * 0.9, now + delay + 0.14);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.007, now + delay + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.16);
      oscillator.connect(gain);
      gain.connect(this.ambientGain!);
      oscillator.start(now + delay);
      oscillator.stop(now + delay + 0.2);
    }
  }

  uiClick(): void {
    this.tone(880, 660, 0.05, 0.025, 'sine');
  }

  uiOpen(): void {
    this.tone(330, 620, 0.16, 0.03, 'sine');
    this.noise(0.12, 0.012, 1800, 'highpass', 0.8);
  }

  uiClose(): void {
    this.tone(620, 300, 0.12, 0.025, 'sine');
  }

  gather(): void {
    this.noise(0.18, 0.04, 900, 'bandpass', 1.4);
    this.tone(140, 85, 0.16, 0.022, 'triangle');
  }

  craft(): void {
    this.tone(520, 780, 0.18, 0.035, 'triangle');
    window.setTimeout(() => this.tone(780, 1040, 0.22, 0.03, 'triangle'), 90);
    this.noise(0.12, 0.02, 2200, 'highpass', 0.8);
  }

  build(): void {
    this.noise(0.22, 0.055, 420, 'lowpass', 0.6);
    this.tone(120, 70, 0.24, 0.04, 'triangle');
    window.setTimeout(() => this.tone(960, 620, 0.14, 0.025, 'square', 1800), 60);
  }

  footstep(sprinting: boolean): void {
    this.noise(sprinting ? 0.075 : 0.06, sprinting ? 0.04 : 0.026, sprinting ? 520 : 380, 'lowpass', 0.7);
  }

  jump(): void {
    this.tone(180, 280, 0.12, 0.02, 'sine');
    this.noise(0.08, 0.02, 500, 'lowpass', 0.7);
  }

  land(impact: number): void {
    const volume = Math.min(0.09, 0.02 + impact * 0.004);
    this.noise(0.2, volume, 190, 'lowpass', 0.8);
    this.tone(100, 50, 0.18, volume * 0.5, 'triangle');
  }

  swing(): void {
    this.noise(0.13, 0.03, 760, 'bandpass', 1.1);
    this.tone(240, 120, 0.16, 0.018, 'triangle');
  }

  shoot(): void {
    this.noise(0.08, 0.08, 1600, 'bandpass', 1.2);
    this.tone(320, 70, 0.16, 0.07, 'sawtooth', 1200);
  }

  hit(): void {
    this.noise(0.1, 0.055, 2400, 'bandpass', 1.8);
    this.tone(160, 90, 0.12, 0.04, 'square', 700);
  }

  enemyHit(): void {
    this.noise(0.11, 0.04, 1200, 'bandpass', 1.2);
    this.tone(120, 65, 0.15, 0.025, 'sawtooth', 400);
  }

  enemyDie(): void {
    this.tone(180, 48, 0.55, 0.065, 'sawtooth', 380);
    this.noise(0.35, 0.04, 600, 'lowpass', 0.7);
  }

  hurt(): void {
    this.noise(0.24, 0.065, 280, 'lowpass', 0.6);
    this.tone(130, 54, 0.3, 0.05, 'triangle');
  }

  pickup(): void {
    this.tone(660, 990, 0.1, 0.028, 'sine');
    this.tone(990, 1320, 0.14, 0.02, 'sine');
  }

  eat(): void {
    this.noise(0.12, 0.03, 500, 'lowpass', 0.8);
    this.tone(200, 150, 0.14, 0.02, 'triangle');
  }

  heal(): void {
    this.tone(440, 880, 0.4, 0.025, 'sine');
    this.tone(660, 990, 0.35, 0.018, 'sine');
  }

  flashlight(): void {
    this.tone(420, 980, 0.07, 0.025, 'square', 1600);
    this.tone(980, 420, 0.09, 0.02, 'square', 1600);
  }

  fireAdd(): void {
    this.noise(0.3, 0.045, 700, 'bandpass', 0.9);
    this.tone(90, 45, 0.28, 0.025, 'triangle');
  }

  turretFire(): void {
    this.tone(1400, 320, 0.08, 0.035, 'square', 2600);
    this.noise(0.06, 0.02, 2800, 'highpass', 1);
  }

  alert(): void {
    this.tone(130, 95, 0.7, 0.045, 'sawtooth', 300);
  }

  growl(type: 'stalker' | 'brute' | 'spitter' | 'warden' = 'stalker'): void {
    const base = type === 'brute' ? 42 : type === 'warden' ? 34 : type === 'spitter' ? 82 : 58;
    this.tone(base * 1.4, base, 0.5, 0.04, 'sawtooth', 260);
    this.noise(0.3, 0.025, 320, 'bandpass', 0.8);
  }

  save(): void {
    this.tone(520, 780, 0.12, 0.025, 'sine');
    window.setTimeout(() => this.tone(780, 1040, 0.16, 0.02, 'sine'), 80);
  }

  nightfall(): void {
    this.tone(110, 55, 1.8, 0.045, 'sine');
    this.tone(164.81, 82.41, 1.6, 0.02, 'triangle');
    this.noise(1.2, 0.025, 380, 'lowpass', 0.6);
  }

  dawn(): void {
    this.tone(392, 587, 1.1, 0.03, 'sine');
    this.tone(523, 784, 1.4, 0.024, 'triangle');
  }

  victory(): void {
    const notes = [261.63, 329.63, 392, 523.25];
    notes.forEach((frequency, index) => {
      window.setTimeout(() => this.tone(frequency, frequency * 1.01, 1.4, 0.045, 'triangle'), index * 180);
    });
  }

  defeat(): void {
    this.tone(196, 55, 1.8, 0.05, 'sawtooth', 320);
    this.noise(1.2, 0.03, 300, 'lowpass', 0.7);
  }

  setMuted(muted: boolean): void {
    if (!this.ctx) return;
    this.masterGain?.gain.setTargetAtTime(muted ? 0 : this.masterVolume, this.ctx.currentTime, 0.05);
  }

  dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.initialized = false;
    }
  }
}
