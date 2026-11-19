/**
 * Sample-locked multi-channel Web Audio PCM capture engine + multi-input USB audio interface helpers.
 *
 * Captures 1 to 10 mono channels (up to 8 isolated microphones + optional 2-ch Main Mix safety bus)
 * on the exact same AudioContext render quantum so multi-mic setups never suffer inter-track drift
 * or room-bleed echo.
 */

export type StudioCaptureMode = "solo" | "multitrack" | "stereo-split" | "multi-device";

export const MAX_STUDIO_INPUTS = 8;
export const MAX_PCM_CAPTURE_CHANNELS = 10; // Up to 8 isolated mics + 2-ch stereo safety bus

export type MicDeviceOption = {
  deviceId: string;
  groupId: string;
  label: string;
  /** True when the OS audio endpoint exposes a dedicated multitrack USB bus. */
  isMultitrackEndpoint: boolean;
  /** True when the endpoint belongs to a multi-channel broadcast console / USB audio interface. */
  isBroadcastConsole: boolean;
  endpointRole: "multitrack" | "main-stereo" | "secondary" | "generic";
};

export interface AudioInterfaceDetection {
  hasMultitrackInterface: boolean;
  hasBroadcastConsole: boolean;
  multitrackDevice: MicDeviceOption | null;
  mainStereoDevice: MicDeviceOption | null;
  secondaryDevice: MicDeviceOption | null;
  externalInputs: MicDeviceOption[];
}

/**
 * Neutral channel map for standard broadcast multitrack USB interfaces where
 * Ch 1-2 carry the stereo main bus and Ch 3-6 carry discrete preamp inputs 1-4.
 */
export const BROADCAST_MULTITRACK_LABELS: readonly string[] = [
  "Ch 1 · Main L",
  "Ch 2 · Main R",
  "Ch 3 · Input 1",
  "Ch 4 · Input 2",
  "Ch 5 · Input 3",
  "Ch 6 · Input 4",
  "Ch 7 · Aux L",
  "Ch 8 · Aux R",
  "Ch 9 · Bus A L",
  "Ch 10 · Bus A R",
  "Ch 11 · USB 1 L",
  "Ch 12 · USB 1 R",
  "Ch 13 · USB 2 L",
  "Ch 14 · USB 2 R",
  "Ch 15 · Line L",
  "Ch 16 · Line R",
];

// Hardware heuristics stay strictly internal (never surfaced as third-party branding in UI copy).
const BROADCAST_CONSOLE_RE = /r[øo]de\s*caster|rodecaster|rcp\s*(?:ii|2)|podtrak|dlz\s*creator|mixcast/i;
const MULTITRACK_ENDPOINT_RE = /multitrack|multi[\s-]?track|\b(?:4|6|8|12|14|16)\s*ch\b/i;
const EXTERNAL_INTERFACE_RE =
  /usb|interface|scarlett|focusrite|apollo|universal audio|motu|audient|ssl|presonus|behringer|zoom|tascam|shure|wave|elgato|r[øo]de|rode|mixcast|podtrak/i;

export function classifyInputDevice(raw: MediaDeviceInfo, fallbackIndex: number): MicDeviceOption {
  const label = raw.label?.trim() || `Microphone ${fallbackIndex + 1}`;
  const isBroadcastConsole = BROADCAST_CONSOLE_RE.test(label);
  const isMultitrackEndpoint = MULTITRACK_ENDPOINT_RE.test(label);

  let endpointRole: MicDeviceOption["endpointRole"] = "generic";
  if (isMultitrackEndpoint) endpointRole = "multitrack";
  else if (/secondary|chat|usb\s*2/i.test(label)) endpointRole = "secondary";
  else if (/main|stereo|usb\s*1/i.test(label) || isBroadcastConsole) endpointRole = "main-stereo";

  return {
    deviceId: raw.deviceId || `mic-${fallbackIndex}`,
    groupId: raw.groupId || "",
    label,
    isMultitrackEndpoint,
    isBroadcastConsole,
    endpointRole,
  };
}

export function detectAudioInterfaces(devices: MicDeviceOption[]): AudioInterfaceDetection {
  const multitrackDevice = devices.find((d) => d.isMultitrackEndpoint) ?? null;
  const broadcastMatches = devices.filter((d) => d.isBroadcastConsole);
  const externalInputs = devices.filter(
    (d) => d.isBroadcastConsole || d.isMultitrackEndpoint || EXTERNAL_INTERFACE_RE.test(d.label),
  );
  const mainStereoDevice =
    broadcastMatches.find((d) => d.endpointRole === "main-stereo") ??
    externalInputs.find((d) => d.endpointRole === "main-stereo") ??
    broadcastMatches[0] ??
    externalInputs[0] ??
    null;
  const secondaryDevice =
    broadcastMatches.find((d) => d.endpointRole === "secondary") ??
    externalInputs.find((d) => d.deviceId !== mainStereoDevice?.deviceId) ??
    null;

  return {
    hasMultitrackInterface: Boolean(multitrackDevice),
    hasBroadcastConsole: broadcastMatches.length > 0,
    multitrackDevice,
    mainStereoDevice,
    secondaryDevice,
    externalInputs,
  };
}

/**
 * Returns the default 0-based hardware channel index for mic slot `slotIndex` (0 = Mic 1, 1 = Mic 2, ...).
 * Broadcast multitrack consoles reserve Ch 1-2 (indices 0-1) for Main Mix L/R and place Mic 1-4 on Ch 3-6 (indices 2-5).
 */
export function defaultChannelForSlot(
  slotIndex: number,
  options: { useBroadcastOffset: boolean; totalChannels: number },
): number {
  const maxCh = Math.max(1, options.totalChannels);
  if (options.useBroadcastOffset && maxCh >= 4) {
    return Math.min(maxCh - 1, 2 + slotIndex);
  }
  return Math.min(maxCh - 1, slotIndex);
}

export function formatHardwareChannelName(
  index: number,
  useBroadcastMap: boolean,
  totalChannels: number,
): string {
  if (useBroadcastMap && totalChannels >= 4 && index < BROADCAST_MULTITRACK_LABELS.length) {
    return BROADCAST_MULTITRACK_LABELS[index]!;
  }
  if (totalChannels === 2) {
    return index === 0 ? "Ch 1 · Left" : "Ch 2 · Right";
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
    this.channelCount = Math.max(1, Math.min(10, opts.channelCount || 2));
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
registerProcessor('nexus-pcm-recorder-v2', NexusPcmRecorderProcessor);
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
 * Supports 1..10 simultaneous discrete mono channels via AudioWorkletNode (with ScriptProcessorNode fallback).
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
    this.channelCount = Math.max(1, Math.min(MAX_PCM_CAPTURE_CHANNELS, channelCount));
    this.chunks = Array.from({ length: this.channelCount }, () => []);

    this.merger = ctx.createChannelMerger(this.channelCount);
    this.merger.channelCountMode = "explicit";
    this.merger.channelInterpretation = "discrete";

    this.silentSink = ctx.createGain();
    this.silentSink.gain.value = 0;
    this.silentSink.connect(ctx.destination);
  }

  static async create(ctx: AudioContext, channelSources: AudioNode[]): Promise<MultiChannelPcmRecorder> {
    const count = Math.max(1, Math.min(MAX_PCM_CAPTURE_CHANNELS, channelSources.length));
    const instance = new MultiChannelPcmRecorder(ctx, count);

    for (let ch = 0; ch < count; ch++) {
      const src = channelSources[ch];
      if (src) src.connect(instance.merger, 0, ch);
    }

    const workletOk = await ensurePcmWorkletLoaded(ctx);
    if (workletOk) {
      const node = new AudioWorkletNode(ctx, "nexus-pcm-recorder-v2", {
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
