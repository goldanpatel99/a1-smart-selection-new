/**
 * Romantic Wedding Ambient Melody Synthesizer
 * Uses Web Audio API to generate soft, dreamy wedding chords & flute-like ambient tones.
 * Works 100% offline, zero network requests, zero MP3 buffering delays!
 */

class RomanticWeddingAudio {
  private ctx: AudioContext | null = null;
  private isPlaying = false;
  private intervalId: any = null;
  private gainNode: GainNode | null = null;

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Raag Yaman / Romantic Pentatonic Scale frequencies (Hz)
  // Gentle, soothing, emotional notes for Indian wedding ceremonies
  private notes = [
    261.63, // C4 (Sa)
    293.66, // D4 (Re)
    329.63, // E4 (Ga)
    392.00, // G4 (Pa)
    440.00, // A4 (Dha)
    493.88, // B4 (Ni)
    523.25, // C5 (Taar Sa)
    587.33, // D5 (Taar Re)
  ];

  // Gentle acoustic chord progressions
  private chordProgressions = [
    [261.63, 329.63, 392.00], // C Maj
    [220.00, 261.63, 329.63], // A Min
    [174.61, 261.63, 329.63], // F Maj
    [196.00, 246.94, 293.66], // G Maj
  ];

  private chordIndex = 0;

  private playTone(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.08) {
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const noteGain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      // Soft envelope (slow attack, long decay for romantic ambient feel)
      const now = this.ctx.currentTime;
      noteGain.gain.setValueAtTime(0.001, now);
      noteGain.gain.exponentialRampToValueAtTime(volume, now + 1.2);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(noteGain);
      if (this.gainNode) {
        noteGain.connect(this.gainNode);
      } else {
        noteGain.connect(this.ctx.destination);
      }

      osc.start(now);
      osc.stop(now + duration + 0.1);
    } catch {
      // AudioContext might be blocked until user gesture
    }
  }

  public play() {
    this.initContext();
    if (!this.ctx) return;
    this.isPlaying = true;

    // Master volume
    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.setValueAtTime(0.5, this.ctx.currentTime);
    this.gainNode.connect(this.ctx.destination);

    // Initial chord
    this.playChordStep();

    // Loop steps every 4.5 seconds for relaxing wedding ambiance
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = setInterval(() => {
      if (this.isPlaying) {
        this.playChordStep();
      }
    }, 4500);
  }

  private playChordStep() {
    if (!this.ctx || !this.isPlaying) return;

    // Play base chord
    const chord = this.chordProgressions[this.chordIndex % this.chordProgressions.length];
    chord.forEach((freq, idx) => {
      // Soft warm sine chord
      this.playTone(freq, 4.0, 'sine', 0.05);
      // Delicate octave harmonic
      setTimeout(() => {
        if (this.isPlaying) {
          this.playTone(freq * 2, 2.5, 'triangle', 0.02);
        }
      }, idx * 600);
    });

    // Gentle flute-like lead note
    const leadNote = this.notes[Math.floor(Math.random() * this.notes.length)];
    setTimeout(() => {
      if (this.isPlaying) {
        this.playTone(leadNote, 3.0, 'sine', 0.06);
      }
    }, 1800);

    this.chordIndex++;
  }

  public pause() {
    this.isPlaying = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.ctx && this.gainNode) {
      try {
        this.gainNode.gain.setValueAtTime(0, this.ctx.currentTime);
      } catch {}
    }
  }

  public toggle(): boolean {
    if (this.isPlaying) {
      this.pause();
      return false;
    } else {
      this.play();
      return true;
    }
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }
}

export const romanticAudio = new RomanticWeddingAudio();
