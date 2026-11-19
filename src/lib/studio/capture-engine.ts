/**
 * Sample-locked multi-channel Web Audio PCM capture engine + RØDECaster Pro II hardware helpers.
 *
 * Captures up to 4 mono stems (Mic 1, Mic 2, and optional Ch 1-2 Safety Mix L/R) on the exact same
 * AudioContext render quantum so dual-mic room setups never suffer inter-track drift or bleed echo.
 */

export type StudioCaptureMode = "rcp2-multitrack" | "stereo-split" | "dual-device" | "single";

export type MicDeviceOption = {
  deviceId: string;
  groupId: string;
  label: string;
  isRodeCaster: boolean;
  rodeKind: "multitrack" | "main-stereo" | "chat" | "secondary" | "generic" | null;
};

export interface RodeCasterDetection {
  detected: boolean;
  multitrackDevice: MicDeviceOption | null;
  mainStereoDevice: MicDeviceOption | null;
  chatDevice: MicDeviceOption | null;
  secondaryDevice: MicDeviceOption | null;
  allMatches: MicDeviceOption[];
}

export const RODECASTER_CHANNEL_LABELS: readonly string[] = [
  "Ch 1 · Main Mix L",
  "Ch 2 · Main Mix R",
  "Ch 3 · Combo 1 (Mic 1)",
  "Ch 4 · Combo 2 (Mic 2)",
  "Ch 5 · Combo 3",
  "Ch 6 · Combo 4",
  "Ch 7 · Bluetooth L",
  "Ch 8 · Bluetooth R",
  "Ch 9 · SMART Pads L",
  "Ch 10 · SMART Pads R",
  "Ch 11 · USB 1 L",
  "Ch 12 · USB 1 R",
  "Ch 13 · USB 2 L",
  "Ch 14 · USB 2 R",
  "Ch 15 · Aux L",
  "Ch 16 · Aux R",
];

const RODE_REGEX = /r[øo]de\s*caster|rodecaster|rcp\s*(?:ii|2)/i;

export function classifyInputDevice(raw: MediaDeviceInfo, fallbackIndex: number): MicDeviceOption {
  const label = raw.label?.trim() || `Microphone ${fallbackIndex + 1}`;
  const isRodeCaster = RODE_REGEX.test(label);
  let rodeKind: MicDeviceOption["rodeKind"] = null;
  if (isRodeCaster) {
    if (/multitrack|multi[\s-]?track/i.test(label)) rodeKind = "multitrack";
    else if (/chat/i.test(label)) rodeKind = "chat";
    else if (/secondary|usb\s*2/i.test(label)) rodeKind = "secondary";
    else if (/main|stereo|usb\s*1/i.test(label)) rodeKind = "main-stereo";
    else rodeKind = "generic";
  }
  return {
    deviceId: raw.deviceId || `mic-${fallbackIndex}`,
    groupId: raw.groupId || "",
    label,
    isRodeCaster,
    rodeKind,
  };
}

export function detectRodeCasterDevices(devices: MicDeviceOption[]): RodeCasterDetection {
  const allMatches = devices.filter((d) => d.isRodeCaster);
  return {
    detected: allMatches.length > 0,
    multitrackDevice: allMatches.find((d) => d.rodeKind === "multitrack") ?? null,
    mainStereoDevice:
      allMatches.find((d) => d.rodeKind === "main-stereo") ??
      allMatches.find((d) => d.rodeKind === "generic") ??
      null,
    chatDevice: allMatches.find((d) => d.rodeKind === "chat") ?? null,
    secondaryDevice: allMatches.find((d) => d.rodeKind === "secondary") ?? null,
    allMatches,
  };
}

export function formatHardwareChannelName(index: number, isRodeMultitrack: boolean, totalChannels: number): string {
  if (isRodeMultitrack && totalChannels >= 4 && index < RODECASTER_CHANNEL_LABELS.length) {
    return RODECASTER_CHANNEL_LABELS[index]!;
  }
  if (totalChannels === 2) {
    return index === 0 ? "Ch 1 · Left (L)" : "Ch 2 · Right (R)";
  }
  return `Ch ${index + 1}`;
}

export function linearToDb(amp: number): number {
  if (amp <= 0.0001) return -60;
  return Math.max(-60, Math.min(6, 20 * Math.log10(amp)));
}

export function formatDbReadout(amp: number): string {
  if (amp <= 0.0003) return "-∞ dB";
  const db = linearToDb(amp);
  return `${db > 0 ? "+" : ""}${db.toFixed(1)} dB`;
}

export function formatGainDb(gain: number): string {
  if (gain <= 0.001) return "-∞";
  const db = 20 * Math.log10(gain);
  if (Math.abs(db) < 0.05) return "0.0 dB";
  return `${db > 0 ? "+" : ""}${db.toFixed(1)} dB`;
}

const PCM_WORKLET_CODE = `
class NexusPcmRecorderProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.channelCount = Math.max(1, Math.min(4, opts.channelCount || 2));
    this.recording = false;
    this.paused = false;
    this.chunkSize = 2048;
    this.offset = 0;
    this.buffers = Array.from({ length: this.channelCount }, () => new Float32Array(this.chunkSize));

    this.port.onmessage = (event) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'start') {
        this.recording = true;
        this.paused = false;
        this.offset = 0;
      } else if (msg.type === 'pause') {
        this.paused = true;
      } else if (msg.type === 'resume') {
        this.paused = false;
      } else if (msg.type === 'stop') {
        this.flush();
        this.recording = false;
        this.paused = false;
        this.port.postMessage({ type: 'stopped' });
      }
    };
  }

  flush() {
    if (this.offset <= 0) return;
    const sliced = this.buffers.map((b) => b.slice(0, this.offset));
    this.port.postMessage(
      { type: 'chunk', channels: sliced },
      sliced.map((a) => a.buffer),
    );
    this.offset = 0;
  }

  process(inputs) {
    if (!this.recording || this.paused) return true;
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const frames = input[0] ? input[0].length : 0;
    if (frames === 0) return true;

    for (let i = 0; i < frames; i++) {
      for (let ch = 0; ch < this.channelCount; ch++) {
        const src = input[ch];
        this.buffers[ch][this.offset] = src ? src[i] : 0;
      }
      this.offset += 1;
      if (this.offset >= this.chunkSize) {
        this.flush();
      }
    }
    return true;
  }
}
registerProcessor('nexus-pcm-recorder', NexusPcmRecorderProcessor);
`;

const registeredWorkletContexts = new WeakSet<AudioContext>();

async function ensurePcmWorkletLoaded(ctx: AudioContext): Promise<boolean> {
  if (typeof AudioWorkletNode === "undefined" || !ctx.audioWorklet) return false;
  if (registeredWorkletContexts.has(ctx)) return true;
  try {
    const blob = new Blob([PCM_WORKLET_CODE], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    try {
      await ctx.audioWorklet.addModule(url);
      registeredWorkletContexts.add(ctx);
      return true;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return false;
  }
}

function concatFloat32(chunks: Float32Array[]): Float32Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/**
 * Sample-locked multi-channel PCM capture tap attached inside the active AudioContext.
 * Uses AudioWorkletNode when available and falls back cleanly to ScriptProcessorNode.
 */
export class MultiChannelPcmRecorder {
  private readonly ctx: AudioContext;
  private readonly channelCount: number;
  private readonly merger: ChannelMergerNode;
  private readonly silentSink: GainNode;
  private workletNode: AudioWorkletNode | null = null;
  private scriptNode: ScriptProcessorNode | null = null;
  private chunks: Float32Array[][];
  private isRecording = false;
  private isPaused = false;
  private stopResolver: (() => void) | null = null;

  private constructor(ctx: AudioContext, channelCount: number) {
    this.ctx = ctx;
    this.channelCount = Math.max(1, Math.min(4, channelCount));
    this.chunks = Array.from({ length: this.channelCount }, () => []);

    this.merger = ctx.createChannelMerger(this.channelCount);
    this.merger.channelCountMode = "explicit";
    this.merger.channelInterpretation = "discrete";

    this.silentSink = ctx.createGain();
    this.silentSink.gain.value = 0;
    this.silentSink.connect(ctx.destination);
  }

  static async create(ctx: AudioContext, channelSources: AudioNode[]): Promise<MultiChannelPcmRecorder> {
    const count = Math.max(1, Math.min(4, channelSources.length));
    const instance = new MultiChannelPcmRecorder(ctx, count);

    for (let ch = 0; ch < count; ch++) {
      const src = channelSources[ch];
      if (src) src.connect(instance.merger, 0, ch);
    }

    const workletOk = await ensurePcmWorkletLoaded(ctx);
    if (workletOk) {
      const node = new AudioWorkletNode(ctx, "nexus-pcm-recorder", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: count,
        channelCountMode: "explicit",
        channelInterpretation: "discrete",
        processorOptions: { channelCount: count },
      });
      node.port.onmessage = (event: MessageEvent) => {
        const msg = event.data as { type?: string; channels?: Float32Array[] } | null;
        if (!msg) return;
        if (msg.type === "chunk" && Array.isArray(msg.channels)) {
          for (let ch = 0; ch < count; ch++) {
            const arr = msg.channels[ch];
            if (arr && arr.length > 0) instance.chunks[ch]!.push(arr);
          }
        } else if (msg.type === "stopped") {
          instance.stopResolver?.();
          instance.stopResolver = null;
        }
      };
      instance.merger.connect(node);
      node.connect(instance.silentSink);
      instance.workletNode = node;
    } else {
      // Fallback: ScriptProcessorNode keeps identical sample-locked capture if CSP blocks Blob worklets.
      const sp = ctx.createScriptProcessor(2048, count, 1);
      sp.onaudioprocess = (ev) => {
        if (!instance.isRecording || instance.isPaused) return;
        for (let ch = 0; ch < count; ch++) {
          const data = ev.inputBuffer.getChannelData(Math.min(ch, ev.inputBuffer.numberOfChannels - 1));
          instance.chunks[ch]!.push(new Float32Array(data));
        }
      };
      instance.merger.connect(sp);
      sp.connect(instance.silentSink);
      instance.scriptNode = sp;
    }

    return instance;
  }

  start() {
    this.chunks = Array.from({ length: this.channelCount }, () => []);
    this.isRecording = true;
    this.isPaused = false;
    this.workletNode?.port.postMessage({ type: "start" });
  }

  pause() {
    if (!this.isRecording) return;
    this.isPaused = true;
    this.workletNode?.port.postMessage({ type: "pause" });
  }

  resume() {
    if (!this.isRecording) return;
    this.isPaused = false;
    this.workletNode?.port.postMessage({ type: "resume" });
  }

  async stop(): Promise<Float32Array[]> {
    this.isRecording = false;
    this.isPaused = false;

    if (this.workletNode) {
      await new Promise<void>((resolve) => {
        const timeout = window.setTimeout(() => {
          this.stopResolver = null;
          resolve();
        }, 220);
        this.stopResolver = () => {
          window.clearTimeout(timeout);
          resolve();
        };
        this.workletNode!.port.postMessage({ type: "stop" });
      });
    }

    return this.chunks.map(concatFloat32);
  }

  dispose() {
    this.isRecording = false;
    this.isPaused = false;
    try {
      this.merger.disconnect();
      this.workletNode?.disconnect();
      this.scriptNode?.disconnect();
      this.silentSink.disconnect();
    } catch {
      // Ignore already disconnected nodes
    }
    if (this.scriptNode) this.scriptNode.onaudioprocess = null;
    this.workletNode = null;
    this.scriptNode = null;
  }
}
