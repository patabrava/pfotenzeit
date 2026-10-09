/**
 * Tiny WebAudio synth cues (06 Audio und Feedback). No files required.
 *  - confirm: soft two-note confirmation for helpful decisions
 *  - chime: soft rising chime for upgrade / mark / growth
 *  - soft: single quiet tone for care actions
 *  - sniff: faint filtered noise breath; never a substitute for body language (DOM text carries meaning)
 * Unlocks on the first user gesture; global toggle; every failure is swallowed (audio never blocks play).
 */

export type Cue = 'confirm' | 'chime' | 'soft' | 'sniff';

export interface AudioManager {
  /** Register the one-time unlock listeners on `target` (document by default). */
  installUnlock(target?: EventTarget): void;
  setEnabled(enabled: boolean): void;
  isEnabled(): boolean;
  play(cue: Cue): void;
  /** Stop everything and suspend (interruptions, hidden tab). */
  stop(): void;
  dispose(): void;
}

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export function createAudioManager(initialEnabled = false): AudioManager {
  let enabled = initialEnabled;
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let unlocked = false;
  let unlockCleanup: (() => void) | null = null;
  const activeNodes = new Set<AudioScheduledSourceNode>();

  function ensureContext(): AudioContext | null {
    if (context) return context;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return null;
    try {
      context = new Ctor();
      master = context.createGain();
      master.gain.value = 0.35;
      master.connect(context.destination);
      return context;
    } catch (error) {
      console.warn('[audio] context unavailable', error);
      context = null;
      master = null;
      return null;
    }
  }

  async function unlock(): Promise<void> {
    const ctx = ensureContext();
    if (!ctx) return;
    try {
      if (ctx.state === 'suspended') await ctx.resume();
      unlocked = ctx.state === 'running';
    } catch (error) {
      console.warn('[audio] unlock failed', error);
    }
  }

  function tone(ctx: AudioContext, out: AudioNode, freq: number, start: number, duration: number, peak: number, type: OscillatorType): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(out);
    osc.start(start);
    osc.stop(start + duration + 0.05);
    activeNodes.add(osc);
    osc.onended = () => activeNodes.delete(osc);
  }

  function breath(ctx: AudioContext, out: AudioNode, start: number): void {
    const length = Math.floor(ctx.sampleRate * 0.35);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      const env = Math.sin((i / length) * Math.PI);
      data[i] = (Math.random() * 2 - 1) * env * env;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.value = 0.12;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    source.start(start);
    activeNodes.add(source);
    source.onended = () => activeNodes.delete(source);
  }

  function play(cue: Cue): void {
    if (!enabled) return;
    const ctx = ensureContext();
    if (!ctx || !master) return;
    if (!unlocked) {
      // Try to resume silently; if the gesture requirement blocks it, skip this cue.
      void unlock();
      if (ctx.state !== 'running') return;
    }
    try {
      const now = ctx.currentTime + 0.01;
      switch (cue) {
        case 'confirm':
          tone(ctx, master, 523.25, now, 0.18, 0.5, 'sine');
          tone(ctx, master, 659.25, now + 0.12, 0.26, 0.45, 'sine');
          break;
        case 'chime':
          tone(ctx, master, 587.33, now, 0.22, 0.4, 'triangle');
          tone(ctx, master, 783.99, now + 0.14, 0.26, 0.4, 'triangle');
          tone(ctx, master, 1046.5, now + 0.28, 0.5, 0.35, 'sine');
          break;
        case 'soft':
          tone(ctx, master, 440, now, 0.3, 0.35, 'sine');
          break;
        case 'sniff':
          breath(ctx, master, now);
          break;
        default:
          break;
      }
    } catch (error) {
      console.warn('[audio] cue failed', error);
    }
  }

  function stop(): void {
    for (const node of activeNodes) {
      try {
        node.stop();
      } catch {
        /* already stopped */
      }
    }
    activeNodes.clear();
    if (context && context.state === 'running') {
      context.suspend().catch(() => undefined);
      unlocked = false;
    }
  }

  return {
    installUnlock(target = document) {
      if (unlockCleanup) return;
      const handler = (): void => {
        void unlock();
      };
      const opts: AddEventListenerOptions = { passive: true };
      target.addEventListener('pointerdown', handler, opts);
      target.addEventListener('keydown', handler, opts);
      target.addEventListener('touchend', handler, opts);
      unlockCleanup = () => {
        target.removeEventListener('pointerdown', handler);
        target.removeEventListener('keydown', handler);
        target.removeEventListener('touchend', handler);
      };
    },
    setEnabled(next) {
      enabled = next;
      if (!next) stop();
    },
    isEnabled: () => enabled,
    play,
    stop,
    dispose() {
      stop();
      unlockCleanup?.();
      unlockCleanup = null;
      if (context) {
        context.close().catch(() => undefined);
        context = null;
        master = null;
      }
    },
  };
}
