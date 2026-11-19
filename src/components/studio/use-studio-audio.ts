"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { deleteAudioBlob, loadAudioBlob, saveAudioBlob } from "@/lib/studio/audio-db";
import {
  MAX_STUDIO_INPUTS,
  MultiChannelPcmRecorder,
  classifyInputDevice,
  defaultChannelForSlot,
  detectAudioInterfaces,
  formatHardwareChannelName,
  type AudioInterfaceDetection,
  type MicDeviceOption,
  type StudioCaptureMode,
} from "@/lib/studio/capture-engine";
import type { StudioTrackColor, StudioTrackRole, StudioTrackV1 } from "@/lib/studio/types";
import {
  computeClipPeakAmplitude,
  computePeaksFromBuffer,
  computePeaksFromFloat32,
  connectTrackDspChain,
  encodeWavFromBuffer,
  encodeWavFromFloat32Channels,
  mixTracksOffline,
  renderLayerStemsOffline,
  type ConnectedTrackChain,
} from "@/lib/studio/wav";

export type { AudioInterfaceDetection, MicDeviceOption, StudioCaptureMode };

export type StudioTransportState =
  | "idle"
  | "counting-in"
  | "recording"
  | "paused"
  | "playing";

export type MicChannelConfig = {
  id: string;
  label: string;
  armed: boolean;
  muted: boolean;
  gain: number;
  hpf: boolean;
  invertPhase: boolean;
  /** 0-based hardware channel index on the active interface (`2` = Ch 3 Input 1 on broadcast multitrack buses). */
  channelIndex: number;
  /** Used in `"multi-device"` mode so each mic can address its own USB audio device. */
  deviceId: string;
  colorTag: StudioTrackColor;
};

export type ChannelMeterTelemetry = {
  rms: number;
  peak: number;
  peakHold: number;
  clipped: boolean;
  bands: Float32Array;
};

export type LiveAudioTelemetry = {
  rms: number;
  peak: number;
  clipped: boolean;
  bands: Float32Array;
  /** Per-input live meters aligned by index with `inputs`. */
  inputMeters: ChannelMeterTelemetry[];
  /** Real-time RMS levels across every detected hardware channel (Ch 1 .. Ch 16) for the Audio I/O matrix. */
  rawChannelRms: Float32Array;
  detectedChannels: number;
  sampleRate: number;
  isLiveMic: boolean;
  recordingProgressMs: number;
};

const INPUT_COLOR_CYCLE: readonly StudioTrackColor[] = ["gold", "sky", "emerald", "coral", "slate"];

function colorForSlot(index: number): StudioTrackColor {
  return INPUT_COLOR_CYCLE[index % INPUT_COLOR_CYCLE.length]!;
}

function makeTrackId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `trk-${crypto.randomUUID()}`;
  }
  return `trk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function makeInputId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `in-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `in-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
}

function createChannelMeter(): ChannelMeterTelemetry {
  return {
    rms: 0,
    peak: 0,
    peakHold: 0,
    clipped: false,
    bands: new Float32Array(32),
  };
}

function resetMetersClip(meters: ChannelMeterTelemetry[], resetPeakHold: boolean) {
  for (let i = 0; i < meters.length; i++) {
    const m = meters[i]!;
    m.clipped = false;
    if (resetPeakHold) m.peakHold = 0;
  }
}

function createInitialInputs(): MicChannelConfig[] {
  return [
    {
      id: "in-1",
      label: "Mic 1",
      armed: true,
      muted: false,
      gain: 1.0,
      hpf: true,
      invertPhase: false,
      channelIndex: 0,
      deviceId: "default",
      colorTag: "gold",
    },
  ];
}

function triggerClickPulse(ctx: AudioContext, destination: AudioNode, atTime: number, accented: boolean) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(accented ? 1046.5 : 783.99, atTime);
  gain.gain.setValueAtTime(0.0001, atTime);
  gain.gain.exponentialRampToValueAtTime(accented ? 0.22 : 0.12, atTime + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, atTime + 0.052);
  osc.connect(gain);
  gain.connect(destination);
  osc.start(atTime);
  osc.stop(atTime + 0.06);
}

type ActivePlaybackNodes = {
  trackId: string;
  source: AudioBufferSourceNode;
  chain: ConnectedTrackChain;
};

type MicStripNodes = {
  hpf: BiquadFilterNode;
  trimGain: GainNode;
  muteGain: GainNode;
  analyser: AnalyserNode;
  monitorGain: GainNode;
};

function sampleAnalyserInto(
  analyser: AnalyserNode | null,
  target: ChannelMeterTelemetry,
  timeBuf: Uint8Array<ArrayBuffer>,
  freqBuf: Uint8Array<ArrayBuffer>,
) {
  if (!analyser) {
    target.rms *= 0.84;
    target.peak *= 0.9;
    target.peakHold *= 0.982;
    for (let i = 0; i < target.bands.length; i++) target.bands[i] = target.bands[i]! * 0.84;
    return;
  }

  analyser.getByteTimeDomainData(timeBuf);
  analyser.getByteFrequencyData(freqBuf);

  let sumSq = 0;
  let maxDev = 0;
  for (let i = 0; i < timeBuf.length; i++) {
    const sample = (timeBuf[i]! - 128) / 128;
    sumSq += sample * sample;
    const abs = Math.abs(sample);
    if (abs > maxDev) maxDev = abs;
  }
  const rms = Math.min(1, Math.sqrt(sumSq / timeBuf.length) * 2.1);
  target.rms = target.rms * 0.42 + rms * 0.58;
  target.peak = Math.max(maxDev, target.peak * 0.9);
  if (maxDev >= target.peakHold) {
    target.peakHold = maxDev;
  } else {
    target.peakHold = Math.max(target.peak, target.peakHold * 0.992);
  }
  if (maxDev >= 0.985) {
    target.clipped = true;
  }

  const bandCount = target.bands.length;
  const usefulBins = Math.max(bandCount, Math.floor(freqBuf.length * 0.72));
  for (let b = 0; b < bandCount; b++) {
    const binStart = Math.floor((b / bandCount) * usefulBins);
    const binEnd = Math.max(binStart + 1, Math.floor(((b + 1) / bandCount) * usefulBins));
    let acc = 0;
    for (let k = binStart; k < binEnd; k++) acc += freqBuf[k]!;
    const norm = acc / ((binEnd - binStart) * 255);
    target.bands[b] = target.bands[b]! * 0.35 + norm * 0.65;
  }
}

export function useStudioAudio({
  tracks,
  masterGain,
  bpm,
  countInBars,
  metronomeEnabled,
  loopEnabled,
  onTracksCaptured,
  onNotice,
}: {
  tracks: StudioTrackV1[];
  masterGain: number;
  bpm: number;
  countInBars: number;
  metronomeEnabled: boolean;
  loopEnabled: boolean;
  onTracksCaptured: (captured: StudioTrackV1[]) => void;
  onNotice: (message: string) => void;
}) {
  const [transport, setTransport] = useState<StudioTransportState>("idle");
  const [playheadMs, setPlayheadMs] = useState(0);
  const [devices, setDevices] = useState<MicDeviceOption[]>([]);
  const [captureMode, setCaptureMode] = useState<StudioCaptureMode>("solo");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("default");
  const [inputs, setInputs] = useState<MicChannelConfig[]>(createInitialInputs);
  const [recordSafetyMix, setRecordSafetyMix] = useState(false);

  const [micReady, setMicReady] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [detectedChannels, setDetectedChannels] = useState(2);
  const [sampleRate, setSampleRate] = useState(48000);
  const [monitorInput, setMonitorInput] = useState(false);
  const [studioRawMic, setStudioRawMic] = useState(true);
  const [overdubEnabled, setOverdubEnabled] = useState(true);
  const [countInBeat, setCountInBeat] = useState<number | null>(null);

  const audioInterfaces: AudioInterfaceDetection = useMemo(
    () => detectAudioInterfaces(devices),
    [devices],
  );

  const selectedDeviceMeta = useMemo(
    () => devices.find((d) => d.deviceId === selectedDeviceId) ?? null,
    [devices, selectedDeviceId],
  );
  const useBroadcastChannelMap = useMemo(
    () =>
      Boolean(
        (selectedDeviceMeta?.isBroadcastConsole ||
          (selectedDeviceId === "default" && audioInterfaces.hasBroadcastConsole)) &&
          detectedChannels >= 4,
      ),
    [audioInterfaces.hasBroadcastConsole, detectedChannels, selectedDeviceId, selectedDeviceMeta],
  );

  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeStreamsRef = useRef<MediaStream[]>([]);
  const activeSourcesRef = useRef<MediaStreamAudioSourceNode[]>([]);
  const splitterRef = useRef<ChannelSplitterNode | null>(null);
  const rawChannelAnalysersRef = useRef<AnalyserNode[]>([]);
  const inputStripsRef = useRef<Map<string, MicStripNodes>>(new Map());
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const masterGainNodeRef = useRef<GainNode | null>(null);
  const metronomeGainNodeRef = useRef<GainNode | null>(null);

  const pcmRecorderRef = useRef<MultiChannelPcmRecorder | null>(null);
  const safetyTapsRef = useRef<GainNode[]>([]);
  const activeCaptureMetaRef = useRef<{
    channels: Array<{
      kind: "input" | "safety-l" | "safety-r";
      label: string;
      layerIndex: number;
      inputSource: string;
      colorTag: StudioTrackColor;
      role: StudioTrackRole;
    }>;
    punchInMs: number;
  } | null>(null);

  const bufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
  const playbackNodesRef = useRef<ActivePlaybackNodes[]>([]);

  const playbackStartCtxTimeRef = useRef(0);
  const playbackOffsetMsRef = useRef(0);
  const recordStartPerfRef = useRef(0);
  const recordAccumMsRef = useRef(0);
  const countInTimerRef = useRef<number | undefined>(undefined);
  const metronomeTimerRef = useRef<number | undefined>(undefined);
  const playheadRafRef = useRef<number>(0);

  const tracksRef = useRef(tracks);
  const masterGainRef = useRef(masterGain);
  const metronomeEnabledRef = useRef(metronomeEnabled);
  const loopEnabledRef = useRef(loopEnabled);
  const bpmRef = useRef(bpm);
  const transportRef = useRef<StudioTransportState>(transport);
  const captureModeRef = useRef<StudioCaptureMode>(captureMode);
  const inputsRef = useRef<MicChannelConfig[]>(inputs);
  const devicesRef = useRef<MicDeviceOption[]>(devices);
  const monitorInputRef = useRef(monitorInput);
  const studioRawMicRef = useRef(studioRawMic);
  const selectedDeviceIdRef = useRef(selectedDeviceId);
  const detectedChannelsRef = useRef(detectedChannels);
  const recordSafetyMixRef = useRef(recordSafetyMix);
  const useBroadcastMapRef = useRef(useBroadcastChannelMap);

  const telemetryRef = useRef<LiveAudioTelemetry>({
    rms: 0,
    peak: 0,
    clipped: false,
    bands: new Float32Array(32),
    inputMeters: [createChannelMeter()],
    rawChannelRms: new Float32Array(16),
    detectedChannels: 2,
    sampleRate: 48000,
    isLiveMic: false,
    recordingProgressMs: 0,
  });

  const timeBuf256Ref = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(new ArrayBuffer(256)));
  const freqBuf128Ref = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(new ArrayBuffer(128)));
  const rawTimeBuf128Ref = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(new ArrayBuffer(128)));

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);
  useEffect(() => {
    metronomeEnabledRef.current = metronomeEnabled;
  }, [metronomeEnabled]);
  useEffect(() => {
    loopEnabledRef.current = loopEnabled;
  }, [loopEnabled]);
  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);
  useEffect(() => {
    transportRef.current = transport;
  }, [transport]);
  useEffect(() => {
    captureModeRef.current = captureMode;
  }, [captureMode]);
  useEffect(() => {
    inputsRef.current = inputs;
  }, [inputs]);
  useEffect(() => {
    devicesRef.current = devices;
  }, [devices]);
  useEffect(() => {
    monitorInputRef.current = monitorInput;
  }, [monitorInput]);
  useEffect(() => {
    studioRawMicRef.current = studioRawMic;
  }, [studioRawMic]);
  useEffect(() => {
    selectedDeviceIdRef.current = selectedDeviceId;
  }, [selectedDeviceId]);
  useEffect(() => {
    detectedChannelsRef.current = detectedChannels;
  }, [detectedChannels]);
  useEffect(() => {
    recordSafetyMixRef.current = recordSafetyMix;
  }, [recordSafetyMix]);
  useEffect(() => {
    useBroadcastMapRef.current = useBroadcastChannelMap;
  }, [useBroadcastChannelMap]);

  useEffect(() => {
    masterGainRef.current = masterGain;
    const ctx = audioCtxRef.current;
    const master = masterGainNodeRef.current;
    if (ctx && master) {
      master.gain.setTargetAtTime(masterGain, ctx.currentTime, 0.02);
    }
  }, [masterGain]);

  // Synchronize live playback solo/mute/gain/pan & voice DSP while tracks play
  useEffect(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || playbackNodesRef.current.length === 0) return;
    const anySolo = tracks.some((t) => t.solo);
    const now = ctx.currentTime;
    for (const node of playbackNodesRef.current) {
      const tr = tracks.find((t) => t.id === node.trackId);
      if (!tr) continue;
      const audible = anySolo ? tr.solo : !tr.muted;
      node.chain.gainNode.gain.setTargetAtTime(audible ? tr.gain : 0, now, 0.02);
      node.chain.panNode.pan.setTargetAtTime(tr.pan, now, 0.02);
      node.chain.hpfNode?.frequency.setTargetAtTime(tr.hpfEnabled ? 80 : 10, now, 0.02);
      node.chain.lowEqNode?.gain.setTargetAtTime(tr.eqLowDb ?? 0, now, 0.02);
      node.chain.midEqNode?.gain.setTargetAtTime(tr.eqMidDb ?? 0, now, 0.02);
      node.chain.highEqNode?.gain.setTargetAtTime(tr.eqHighDb ?? 0, now, 0.02);
      if (node.chain.compNode && node.chain.compMakeupNode) {
        node.chain.compNode.threshold.setTargetAtTime(tr.compressorEnabled ? -20 : 0, now, 0.02);
        node.chain.compNode.ratio.setTargetAtTime(tr.compressorEnabled ? 3.2 : 1, now, 0.02);
        node.chain.compMakeupNode.gain.setTargetAtTime(tr.compressorEnabled ? 1.26 : 1, now, 0.02);
      }
    }
  }, [tracks]);

  // Synchronize per-input live DSP strip parameters (HPF, Trim Gain, Polarity, Mute, Monitor) smoothly
  useEffect(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const cfg of inputs) {
      const strip = inputStripsRef.current.get(cfg.id);
      if (!strip) continue;
      strip.hpf.frequency.setTargetAtTime(cfg.hpf ? 80 : 10, now, 0.02);
      const signedGain = cfg.gain * (cfg.invertPhase ? -1 : 1);
      strip.trimGain.gain.setTargetAtTime(signedGain, now, 0.015);
      strip.muteGain.gain.setTargetAtTime(cfg.muted ? 0 : 1, now, 0.015);
      strip.monitorGain.gain.setTargetAtTime(monitorInput && !cfg.muted && cfg.armed ? 0.8 : 0, now, 0.02);
    }
  }, [inputs, monitorInput]);

  const createMicStrip = useCallback((ctx: AudioContext, cfg: MicChannelConfig): MicStripNodes => {
    const hpf = ctx.createBiquadFilter();
    hpf.type = "highpass";
    hpf.frequency.value = cfg.hpf ? 80 : 10;
    hpf.Q.value = 0.707;

    const trimGain = ctx.createGain();
    trimGain.gain.value = cfg.gain * (cfg.invertPhase ? -1 : 1);

    const muteGain = ctx.createGain();
    muteGain.gain.value = cfg.muted ? 0 : 1;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.65;

    const monitorGain = ctx.createGain();
    monitorGain.gain.value = monitorInputRef.current && !cfg.muted && cfg.armed ? 0.8 : 0;

    hpf.connect(trimGain);
    trimGain.connect(muteGain);
    muteGain.connect(analyser);
    muteGain.connect(monitorGain);
    monitorGain.connect(ctx.destination);

    return { hpf, trimGain, muteGain, analyser, monitorGain };
  }, []);

  const disposeStrip = useCallback((strip: MicStripNodes) => {
    const safeDisconnect = (node: AudioNode) => {
      try {
        node.disconnect();
      } catch {
        // Ignore
      }
    };
    safeDisconnect(strip.hpf);
    safeDisconnect(strip.trimGain);
    safeDisconnect(strip.muteGain);
    safeDisconnect(strip.analyser);
    safeDisconnect(strip.monitorGain);
  }, []);

  // Re-patch discrete hardware splitter outputs live whenever input channel assignments or count change
  const channelSignature = useMemo(
    () => inputs.map((i) => `${i.id}:${i.channelIndex}`).join("|"),
    [inputs],
  );

  useEffect(() => {
    const ctx = audioCtxRef.current;
    const splitter = splitterRef.current;
    const mode = captureModeRef.current;
    if (!ctx || !splitter || mode === "multi-device") return;

    const maxCh = Math.max(1, splitter.numberOfOutputs);
    const currentInputs = inputsRef.current;
    const activeIds = new Set(currentInputs.map((i) => i.id));

    // Dispose removed strips
    for (const [id, strip] of inputStripsRef.current.entries()) {
      if (!activeIds.has(id)) {
        disposeStrip(strip);
        inputStripsRef.current.delete(id);
      }
    }

    // Ensure every active input has a live strip
    for (const cfg of currentInputs) {
      if (!inputStripsRef.current.has(cfg.id)) {
        inputStripsRef.current.set(cfg.id, createMicStrip(ctx, cfg));
      }
    }

    try {
      splitter.disconnect();
    } catch {
      // Ignore
    }

    rawChannelAnalysersRef.current.forEach((an, idx) => {
      if (idx < maxCh) {
        try {
          splitter.connect(an, idx, 0);
        } catch {
          // Ignore
        }
      }
    });

    for (const cfg of currentInputs) {
      const strip = inputStripsRef.current.get(cfg.id);
      if (!strip) continue;
      const ch = Math.max(0, Math.min(maxCh - 1, cfg.channelIndex));
      try {
        splitter.connect(strip.hpf, ch, 0);
      } catch {
        // Ignore out of bounds
      }
    }
  }, [channelSignature, createMicStrip, disposeStrip]);

  const ensureAudioContext = useCallback(async (): Promise<AudioContext> => {
    if (!audioCtxRef.current) {
      const ctx = new AudioContext({ latencyHint: "interactive" });
      const master = ctx.createGain();
      master.gain.value = masterGainRef.current;
      master.connect(ctx.destination);

      const metronomeGain = ctx.createGain();
      metronomeGain.gain.value = metronomeEnabledRef.current ? 1 : 0;
      metronomeGain.connect(ctx.destination);

      const playbackAnalyser = ctx.createAnalyser();
      playbackAnalyser.fftSize = 256;
      playbackAnalyser.smoothingTimeConstant = 0.7;
      master.connect(playbackAnalyser);

      audioCtxRef.current = ctx;
      masterGainNodeRef.current = master;
      metronomeGainNodeRef.current = metronomeGain;
      playbackAnalyserRef.current = playbackAnalyser;
      setSampleRate(ctx.sampleRate || 48000);
      telemetryRef.current.sampleRate = ctx.sampleRate || 48000;
    }
    if (audioCtxRef.current.state === "suspended") {
      await audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const applyDiscoveredDevices = useCallback((discovered: MicDeviceOption[]) => {
    setDevices(discovered);
  }, []);

  const refreshDevices = useCallback(async (): Promise<MicDeviceOption[]> => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return [];
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const found = all
        .filter((d) => d.kind === "audioinput")
        .map((d, idx) => classifyInputDevice(d, idx));
      applyDiscoveredDevices(found);
      return found;
    } catch {
      return [];
    }
  }, [applyDiscoveredDevices]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
    let active = true;
    const scan = async () => {
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        if (!active) return;
        const found = all
          .filter((d) => d.kind === "audioinput")
          .map((d, idx) => classifyInputDevice(d, idx));
        applyDiscoveredDevices(found);
      } catch {
        // Ignore device enumeration permission failures
      }
    };
    void scan();
    const onChange = () => void scan();
    navigator.mediaDevices.addEventListener("devicechange", onChange);
    return () => {
      active = false;
      navigator.mediaDevices.removeEventListener("devicechange", onChange);
    };
  }, [applyDiscoveredDevices]);

  const stopMetronome = useCallback(() => {
    window.clearInterval(metronomeTimerRef.current);
    metronomeTimerRef.current = undefined;
    const ctx = audioCtxRef.current;
    const mg = metronomeGainNodeRef.current;
    if (ctx && mg) {
      mg.gain.cancelScheduledValues(ctx.currentTime);
      mg.gain.setValueAtTime(0, ctx.currentTime);
    }
  }, []);

  const startMetronomeLoop = useCallback(
    (ctx: AudioContext, startBeatIdx = 0, playImmediateDownbeat = false) => {
      window.clearInterval(metronomeTimerRef.current);
      metronomeTimerRef.current = undefined;
      if (!metronomeEnabledRef.current) return;
      const mg = metronomeGainNodeRef.current;
      if (mg) {
        mg.gain.cancelScheduledValues(ctx.currentTime);
        mg.gain.setValueAtTime(1, ctx.currentTime);
      }
      const beatMs = 60_000 / Math.max(40, bpmRef.current);
      let beatIdx = startBeatIdx;
      if (playImmediateDownbeat) {
        triggerClickPulse(ctx, mg ?? ctx.destination, ctx.currentTime + 0.005, beatIdx % 4 === 0);
      }
      metronomeTimerRef.current = window.setInterval(() => {
        const act = audioCtxRef.current;
        if (!act || !metronomeEnabledRef.current) {
          stopMetronome();
          return;
        }
        beatIdx += 1;
        const dest = metronomeGainNodeRef.current;
        if (!dest) return;
        triggerClickPulse(act, dest, act.currentTime + 0.01, beatIdx % 4 === 0);
      }, beatMs);
    },
    [stopMetronome],
  );

  useEffect(() => {
    if (!metronomeEnabled) {
      stopMetronome();
      return;
    }
    if (transport === "playing" || transport === "recording") {
      const ctx = audioCtxRef.current;
      if (ctx) startMetronomeLoop(ctx, 0, false);
    }
  }, [bpm, metronomeEnabled, startMetronomeLoop, stopMetronome, transport]);

  const stopPlaybackSources = useCallback(() => {
    cancelAnimationFrame(playheadRafRef.current);
    playheadRafRef.current = 0;
    stopMetronome();
    for (const node of playbackNodesRef.current) {
      try {
        node.source.stop();
        node.source.disconnect();
        node.chain.dispose();
      } catch {
        // Ignore already stopped sources
      }
    }
    playbackNodesRef.current = [];
  }, [stopMetronome]);

  const clearSafetyTaps = useCallback(() => {
    for (const tap of safetyTapsRef.current) {
      try {
        tap.disconnect();
      } catch {
        // Ignore
      }
    }
    safetyTapsRef.current = [];
  }, []);

  const teardownInputs = useCallback(() => {
    pcmRecorderRef.current?.dispose();
    pcmRecorderRef.current = null;
    clearSafetyTaps();

    for (const stream of activeStreamsRef.current) {
      for (const t of stream.getTracks()) t.stop();
    }
    activeStreamsRef.current = [];

    const safeDisconnect = (node: AudioNode | null) => {
      try {
        node?.disconnect();
      } catch {
        // Ignore
      }
    };
    for (const src of activeSourcesRef.current) safeDisconnect(src);
    activeSourcesRef.current = [];
    safeDisconnect(splitterRef.current);
    splitterRef.current = null;
    for (const an of rawChannelAnalysersRef.current) safeDisconnect(an);
    rawChannelAnalysersRef.current = [];

    for (const strip of inputStripsRef.current.values()) disposeStrip(strip);
    inputStripsRef.current.clear();

    setMicReady(false);
    telemetryRef.current.isLiveMic = false;
  }, [clearSafetyTaps, disposeStrip]);

  useEffect(() => {
    return () => {
      window.clearTimeout(countInTimerRef.current);
      stopPlaybackSources();
      teardownInputs();
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        void audioCtxRef.current.close().catch(() => null);
      }
    };
  }, [stopPlaybackSources, teardownInputs]);

  const armInputs = useCallback(
    async (overrides?: {
      mode?: StudioCaptureMode;
      deviceId?: string;
      inputs?: MicChannelConfig[];
      rawMode?: boolean;
    }): Promise<boolean> => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setMicError("Your browser does not support Web Audio microphone capture.");
        return false;
      }

      const mode = overrides?.mode ?? captureModeRef.current;
      const devId = overrides?.deviceId ?? selectedDeviceIdRef.current;
      const targetInputs = overrides?.inputs ?? inputsRef.current;
      // Browser echoCancellation / noiseSuppression silently downmix stereo & multitrack streams to mono,
      // so all multi-input modes always request raw unprocessed hardware audio.
      const rawMode = mode !== "solo" ? true : (overrides?.rawMode ?? studioRawMicRef.current);

      try {
        setMicError(null);
        const ctx = await ensureAudioContext();
        teardownInputs();

        if (mode === "multi-device") {
          const streamByDevice = new Map<string, { stream: MediaStream; source: MediaStreamAudioSourceNode }>();

          for (const cfg of targetInputs) {
            const key = cfg.deviceId || "default";
            let entry = streamByDevice.get(key);
            if (!entry) {
              const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                  deviceId: key !== "default" ? { exact: key } : undefined,
                  echoCancellation: false,
                  noiseSuppression: false,
                  autoGainControl: false,
                  channelCount: { ideal: 2 },
                },
              });
              const source = ctx.createMediaStreamSource(stream);
              activeStreamsRef.current.push(stream);
              activeSourcesRef.current.push(source);
              entry = { stream, source };
              streamByDevice.set(key, entry);
            }
            const strip = createMicStrip(ctx, cfg);
            inputStripsRef.current.set(cfg.id, strip);
            entry.source.connect(strip.hpf);
          }

          setDetectedChannels(Math.max(2, targetInputs.length));
          telemetryRef.current.detectedChannels = Math.max(2, targetInputs.length);
        } else {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: devId && devId !== "default" ? { exact: devId } : undefined,
              echoCancellation: !rawMode,
              noiseSuppression: !rawMode,
              autoGainControl: false,
              channelCount: mode === "solo" ? { ideal: 2 } : { ideal: 16 },
            },
          });
          activeStreamsRef.current.push(stream);

          const audioTrack = stream.getAudioTracks()[0];
          const settings = audioTrack?.getSettings?.();
          const caps = audioTrack?.getCapabilities?.() as { channelCount?: { max?: number } } | undefined;
          const src = ctx.createMediaStreamSource(stream);
          activeSourcesRef.current.push(src);

          const chCount = Math.max(
            1,
            Math.min(
              16,
              settings?.channelCount ?? caps?.channelCount?.max ?? src.channelCount ?? (mode === "solo" ? 1 : 2),
            ),
          );

          setDetectedChannels(chCount);
          telemetryRef.current.detectedChannels = chCount;

          const latestDevices = devicesRef.current;
          const matchedDev = latestDevices.find((d) => d.deviceId === devId);
          const broadcastOffset = Boolean(
            (matchedDev?.isBroadcastConsole ||
              (devId === "default" && detectAudioInterfaces(latestDevices).hasBroadcastConsole)) &&
              chCount >= 4,
          );

          if (mode === "solo" && chCount <= 2) {
            const primary = targetInputs[0];
            if (primary) {
              const strip = createMicStrip(ctx, primary);
              inputStripsRef.current.set(primary.id, strip);
              src.connect(strip.hpf);
            }
          } else {
            // Discrete channel splitting preserves every hardware bus cleanly (2..16 channels)
            const splitCount = Math.max(2, chCount);
            src.channelCount = splitCount;
            src.channelCountMode = "explicit";
            src.channelInterpretation = "discrete";

            const splitter = ctx.createChannelSplitter(splitCount);
            splitter.channelCount = splitCount;
            splitter.channelCountMode = "explicit";
            splitter.channelInterpretation = "discrete";
            src.connect(splitter);
            splitterRef.current = splitter;

            // Live RMS probes on every hardware channel for the Audio I/O matrix
            const probes: AnalyserNode[] = [];
            for (let i = 0; i < splitCount; i++) {
              const an = ctx.createAnalyser();
              an.fftSize = 128;
              an.smoothingTimeConstant = 0.55;
              splitter.connect(an, i, 0);
              probes.push(an);
            }
            rawChannelAnalysersRef.current = probes;

            // Normalize channel assignments if out of range or adapting between 2ch stereo and 4+ch multitrack
            let changed = false;
            const adapted = targetInputs.map((cfg, idx) => {
              let nextCh = cfg.channelIndex;
              if (mode === "stereo-split" || chCount < 4) {
                if (nextCh >= splitCount) {
                  nextCh = idx % splitCount;
                  changed = true;
                }
              } else if (broadcastOffset && idx === 0 && nextCh === 0 && targetInputs.length === 1) {
                // On a 4+ch broadcast console in solo mode, keep Ch 1 (Main L) or user's chosen channel
                nextCh = Math.min(splitCount - 1, nextCh);
              } else if (nextCh >= splitCount) {
                nextCh = defaultChannelForSlot(idx, {
                  useBroadcastOffset: broadcastOffset,
                  totalChannels: splitCount,
                });
                changed = true;
              }
              return nextCh === cfg.channelIndex ? cfg : { ...cfg, channelIndex: nextCh };
            });

            if (changed) {
              setInputs(adapted);
              inputsRef.current = adapted;
            }

            for (const cfg of adapted) {
              const strip = createMicStrip(ctx, cfg);
              inputStripsRef.current.set(cfg.id, strip);
              const ch = Math.max(0, Math.min(splitCount - 1, cfg.channelIndex));
              splitter.connect(strip.hpf, ch, 0);
            }
          }
        }

        telemetryRef.current.isLiveMic = true;
        telemetryRef.current.clipped = false;
        resetMetersClip(telemetryRef.current.inputMeters, false);
        setMicReady(true);
        setSampleRate(ctx.sampleRate || 48000);
        telemetryRef.current.sampleRate = ctx.sampleRate || 48000;
        void refreshDevices();
        return true;
      } catch (err) {
        const msg =
          err instanceof Error && err.name === "NotAllowedError"
            ? "Microphone permission was denied. Allow audio input access in your browser."
            : err instanceof Error && err.name === "OverconstrainedError"
              ? "Selected audio device is unavailable. Choose another input in Audio I/O."
              : "Could not open audio interface. Check your USB connection and browser audio permissions.";
        setMicError(msg);
        setMicReady(false);
        return false;
      }
    },
    [createMicStrip, ensureAudioContext, refreshDevices, teardownInputs],
  );

  const autoConfigureMultiMic = useCallback(
    async (preferredMode?: "multitrack" | "stereo-split" | "multi-device", desiredCount?: number) => {
      const latest = await refreshDevices();
      const detected = detectAudioInterfaces(latest);
      setStudioRawMic(true);
      if (detected.hasBroadcastConsole || detected.hasMultitrackInterface) {
        // External broadcast interfaces provide zero-latency hardware headphone monitoring
        setMonitorInput(false);
      }

      const count = Math.max(2, Math.min(MAX_STUDIO_INPUTS, desiredCount ?? Math.max(2, inputsRef.current.length)));
      const existing = inputsRef.current;

      if (preferredMode === "multi-device") {
        const devicePool = detected.externalInputs.length >= 2 ? detected.externalInputs : latest;
        const nextInputs: MicChannelConfig[] = Array.from({ length: count }, (_, idx) => {
          const prev = existing[idx];
          const devId = devicePool[idx]?.deviceId ?? prev?.deviceId ?? "default";
          return {
            id: prev?.id ?? makeInputId(),
            label: prev?.label ?? `Mic ${idx + 1}`,
            armed: prev?.armed ?? true,
            muted: prev?.muted ?? false,
            gain: prev?.gain ?? 1,
            hpf: prev?.hpf ?? true,
            invertPhase: prev?.invertPhase ?? false,
            channelIndex: 0,
            deviceId: devId,
            colorTag: prev?.colorTag ?? colorForSlot(idx),
          };
        });
        setCaptureMode("multi-device");
        setInputs(nextInputs);
        const ok = await armInputs({ mode: "multi-device", inputs: nextInputs, rawMode: true });
        if (ok) onNotice(`Armed ${count} separate USB inputs — sample-locked.`);
        return;
      }

      if (preferredMode === "stereo-split" || (!preferredMode && !detected.multitrackDevice && detected.mainStereoDevice)) {
        const dev = detected.mainStereoDevice?.deviceId ?? selectedDeviceIdRef.current;
        const stereoCount = 2;
        const nextInputs: MicChannelConfig[] = Array.from({ length: stereoCount }, (_, idx) => {
          const prev = existing[idx];
          return {
            id: prev?.id ?? makeInputId(),
            label: prev?.label ?? `Mic ${idx + 1}`,
            armed: prev?.armed ?? true,
            muted: prev?.muted ?? false,
            gain: prev?.gain ?? 1,
            hpf: prev?.hpf ?? true,
            invertPhase: prev?.invertPhase ?? false,
            channelIndex: idx,
            deviceId: dev,
            colorTag: prev?.colorTag ?? colorForSlot(idx),
          };
        });
        setCaptureMode("stereo-split");
        setSelectedDeviceId(dev);
        setInputs(nextInputs);
        const ok = await armInputs({ mode: "stereo-split", deviceId: dev, inputs: nextInputs, rawMode: true });
        if (ok) {
          onNotice("Stereo L/R Split armed — pan Mic 1 Left and Mic 2 Right on your interface for isolated stems.");
        }
        return;
      }

      const dev = detected.multitrackDevice?.deviceId ?? detected.mainStereoDevice?.deviceId ?? selectedDeviceIdRef.current;
      const useOffset = Boolean(detected.hasBroadcastConsole || detected.multitrackDevice?.isBroadcastConsole);
      const nextInputs: MicChannelConfig[] = Array.from({ length: count }, (_, idx) => {
        const prev = existing[idx];
        return {
          id: prev?.id ?? makeInputId(),
          label: prev?.label ?? `Mic ${idx + 1}`,
          armed: prev?.armed ?? true,
          muted: prev?.muted ?? false,
          gain: prev?.gain ?? 1,
          hpf: prev?.hpf ?? true,
          invertPhase: prev?.invertPhase ?? false,
          channelIndex: defaultChannelForSlot(idx, { useBroadcastOffset: useOffset, totalChannels: 16 }),
          deviceId: dev,
          colorTag: prev?.colorTag ?? colorForSlot(idx),
        };
      });

      setCaptureMode("multitrack");
      setSelectedDeviceId(dev);
      setInputs(nextInputs);
      const ok = await armInputs({ mode: "multitrack", deviceId: dev, inputs: nextInputs, rawMode: true });
      if (ok) {
        onNotice(
          detectedChannelsRef.current >= 4
            ? `Multitrack interface armed (${detectedChannelsRef.current} ch) — ${count} isolated inputs ready.`
            : "Interface opened in 2-channel mode — Mic 1 mapped to Ch 1 (L) and Mic 2 to Ch 2 (R).",
        );
      }
    },
    [armInputs, onNotice, refreshDevices],
  );

  const addInput = useCallback(() => {
    const current = inputsRef.current;
    if (current.length >= MAX_STUDIO_INPUTS) {
      onNotice(`Up to ${MAX_STUDIO_INPUTS} simultaneous microphone inputs are supported.`);
      return;
    }

    const nextIdx = current.length;
    const latestDevices = devicesRef.current;
    const detected = detectAudioInterfaces(latestDevices);

    // Upgrading cleanly from Solo (1 mic) -> Multi-Mic (2 mics)
    if (captureModeRef.current === "solo" && current.length === 1) {
      const useMultitrack = Boolean(detected.multitrackDevice);
      const targetMode: StudioCaptureMode = useMultitrack ? "multitrack" : "multitrack";
      const targetDev =
        detected.multitrackDevice?.deviceId ??
        detected.mainStereoDevice?.deviceId ??
        selectedDeviceIdRef.current;
      const useOffset = Boolean(detected.hasBroadcastConsole && (useMultitrack || detectedChannelsRef.current >= 4));

      const updatedFirst: MicChannelConfig = {
        ...current[0]!,
        channelIndex: defaultChannelForSlot(0, {
          useBroadcastOffset: useOffset,
          totalChannels: Math.max(4, detectedChannelsRef.current),
        }),
        deviceId: targetDev,
      };
      const addedSecond: MicChannelConfig = {
        id: makeInputId(),
        label: "Mic 2",
        armed: true,
        muted: false,
        gain: 1,
        hpf: true,
        invertPhase: false,
        channelIndex: defaultChannelForSlot(1, {
          useBroadcastOffset: useOffset,
          totalChannels: Math.max(4, detectedChannelsRef.current),
        }),
        deviceId: targetDev,
        colorTag: colorForSlot(1),
      };

      const nextList = [updatedFirst, addedSecond];
      setStudioRawMic(true);
      if (detected.hasBroadcastConsole || detected.hasMultitrackInterface) setMonitorInput(false);
      setCaptureMode(targetMode);
      setSelectedDeviceId(targetDev);
      setInputs(nextList);
      if (micReady) {
        void armInputs({ mode: targetMode, deviceId: targetDev, inputs: nextList, rawMode: true });
      }
      return;
    }

    // Adding Mic 3, Mic 4, ... up to Mic 8
    const usedChannels = new Set(current.map((i) => i.channelIndex));
    const maxCh = Math.max(detectedChannelsRef.current, nextIdx + 3, 16);
    const preferredStart = useBroadcastMapRef.current ? 2 : 0;
    let chosenChannel = Math.min(maxCh - 1, preferredStart + nextIdx);
    if (usedChannels.has(chosenChannel)) {
      for (let c = preferredStart; c < maxCh; c++) {
        if (!usedChannels.has(c)) {
          chosenChannel = c;
          break;
        }
      }
    }

    const usedDevices = new Set(current.map((i) => i.deviceId));
    const unusedDevice = latestDevices.find((d) => !usedDevices.has(d.deviceId))?.deviceId ?? "default";

    const nextMode: StudioCaptureMode =
      captureModeRef.current === "stereo-split" ? "multitrack" : captureModeRef.current;

    const added: MicChannelConfig = {
      id: makeInputId(),
      label: `Mic ${nextIdx + 1}`,
      armed: true,
      muted: false,
      gain: 1,
      hpf: true,
      invertPhase: false,
      channelIndex: chosenChannel,
      deviceId: nextMode === "multi-device" ? unusedDevice : selectedDeviceIdRef.current,
      colorTag: colorForSlot(nextIdx),
    };

    const nextList = [...current, added];
    if (nextMode !== captureModeRef.current) setCaptureMode(nextMode);
    setInputs(nextList);
    if (micReady && (nextMode === "multi-device" || nextMode !== captureModeRef.current)) {
      void armInputs({ mode: nextMode, inputs: nextList, rawMode: true });
    }
  }, [armInputs, micReady, onNotice]);

  const removeInput = useCallback(
    (id: string) => {
      const current = inputsRef.current;
      if (current.length <= 1) return;
      const nextList = current.filter((i) => i.id !== id);
      setInputs(nextList);
      if (nextList.length === 1) {
        setCaptureMode("solo");
        if (micReady) {
          void armInputs({ mode: "solo", inputs: nextList });
        }
      } else if (micReady && captureModeRef.current === "multi-device") {
        void armInputs({ mode: "multi-device", inputs: nextList });
      }
    },
    [armInputs, micReady],
  );

  const updateInput = useCallback(
    (id: string, patch: Partial<MicChannelConfig>) => {
      const nextList = inputsRef.current.map((item) => (item.id === id ? { ...item, ...patch } : item));
      setInputs(nextList);
      if (patch.deviceId && captureModeRef.current === "multi-device" && micReady) {
        void armInputs({ mode: "multi-device", inputs: nextList });
      }
    },
    [armInputs, micReady],
  );

  const changeCaptureMode = useCallback(
    (next: StudioCaptureMode) => {
      setCaptureMode(next);
      let nextList = inputsRef.current;

      if (next === "solo") {
        nextList = [nextList[0] ?? createInitialInputs()[0]!];
        setInputs(nextList);
      } else {
        setStudioRawMic(true);
        if (nextList.length < 2) {
          const detected = detectAudioInterfaces(devicesRef.current);
          const useOffset = next === "multitrack" && detected.hasBroadcastConsole;
          nextList = [
            {
              ...nextList[0]!,
              channelIndex: defaultChannelForSlot(0, { useBroadcastOffset: useOffset, totalChannels: 16 }),
            },
            {
              id: makeInputId(),
              label: "Mic 2",
              armed: true,
              muted: false,
              gain: 1,
              hpf: true,
              invertPhase: false,
              channelIndex: defaultChannelForSlot(1, { useBroadcastOffset: useOffset, totalChannels: 16 }),
              deviceId: detected.secondaryDevice?.deviceId ?? selectedDeviceIdRef.current,
              colorTag: colorForSlot(1),
            },
          ];
          setInputs(nextList);
        } else if (next === "stereo-split") {
          nextList = nextList.slice(0, 2).map((item, idx) => ({ ...item, channelIndex: idx }));
          setInputs(nextList);
        }
      }

      if (micReady) {
        void armInputs({ mode: next, inputs: nextList });
      }
    },
    [armInputs, micReady],
  );

  const hydrateTrackBuffer = useCallback(
    async (track: StudioTrackV1): Promise<AudioBuffer | null> => {
      const cacheKey = track.audioRef.idbKey || track.id;
      const cached = bufferCacheRef.current.get(cacheKey);
      if (cached) return cached;
      try {
        const ctx = await ensureAudioContext();
        let blob = await loadAudioBlob(track.audioRef.idbKey);
        if (!blob && track.audioRef.url) {
          const res = await fetch(track.audioRef.url);
          if (res.ok) {
            blob = await res.blob();
            if (track.audioRef.idbKey) {
              void saveAudioBlob(track.audioRef.idbKey, blob).catch(() => {});
            }
          }
        }
        if (!blob) return null;
        const ab = await blob.arrayBuffer();
        const decoded = await ctx.decodeAudioData(ab.slice(0));
        bufferCacheRef.current.set(cacheKey, decoded);
        return decoded;
      } catch {
        return null;
      }
    },
    [ensureAudioContext],
  );

  const startTracksFromRef = useRef<(startMs: number, loopToMaxMs?: number) => Promise<void>>(
    async () => {},
  );

  const startTracksFrom = useCallback(
    async (startMs: number, loopToMaxMs?: number) => {
      const ctx = await ensureAudioContext();
      stopPlaybackSources();

      const currentTracks = tracksRef.current;
      await Promise.all(currentTracks.map((t) => hydrateTrackBuffer(t)));
      const anySolo = currentTracks.some((t) => t.solo);
      const startTime = ctx.currentTime + 0.025;
      playbackStartCtxTimeRef.current = startTime;
      playbackOffsetMsRef.current = startMs;

      const nodes: ActivePlaybackNodes[] = [];
      let maxEndMs = loopToMaxMs ?? startMs;

      for (const tr of currentTracks) {
        const cacheKey = tr.audioRef.idbKey || tr.id;
        const buf = bufferCacheRef.current.get(cacheKey);
        if (!buf) continue;
        const clipStartMs = tr.offsetMs;
        const trimStartMs = Math.max(0, tr.trimStartMs ?? 0);
        const rawDurMs = tr.durationMs > 0 ? tr.durationMs : Math.round(buf.duration * 1000);
        const clipEndMs = clipStartMs + rawDurMs;
        if (clipEndMs > maxEndMs) maxEndMs = clipEndMs;
        if (clipEndMs <= startMs) continue;

        const clipElapsedMs = Math.max(0, startMs - clipStartMs);
        const srcOffsetSec = Math.max(0, (trimStartMs + clipElapsedMs) / 1000);
        const availableSec = Math.max(0, buf.duration - srcOffsetSec);
        const remainingClipSec = Math.max(0, (clipEndMs - Math.max(startMs, clipStartMs)) / 1000);
        const playDurSec = Math.min(availableSec, remainingClipSec);
        if (playDurSec <= 0.01) continue;

        const src = ctx.createBufferSource();
        src.buffer = buf;
        const audible = anySolo ? tr.solo : !tr.muted;
        const delaySec = Math.max(0, (clipStartMs - startMs) / 1000);

        const chain = connectTrackDspChain(ctx, src, tr, masterGainNodeRef.current ?? ctx.destination, {
          audible,
          clipStartAtCtxSec: startTime + delaySec,
          clipElapsedSec: clipElapsedMs / 1000,
          playDurSec,
          totalClipDurSec: rawDurMs / 1000,
          liveControllable: true,
        });

        src.start(startTime + delaySec, srcOffsetSec, playDurSec);
        nodes.push({ trackId: tr.id, source: src, chain });
      }
      playbackNodesRef.current = nodes;

      if (metronomeEnabledRef.current) {
        const beatMs = 60_000 / Math.max(40, bpmRef.current);
        startMetronomeLoop(ctx, Math.floor(startMs / beatMs), false);
      }

      const tickPlayhead = () => {
        const act = audioCtxRef.current;
        if (!act) return;
        const elapsedMs = Math.max(0, (act.currentTime - playbackStartCtxTimeRef.current) * 1000);
        const pos = playbackOffsetMsRef.current + elapsedMs;
        setPlayheadMs(pos);
        if (loopToMaxMs === undefined && pos >= maxEndMs + 40 && playbackNodesRef.current.length > 0) {
          if (loopEnabledRef.current) {
            void startTracksFromRef.current(0);
            return;
          }
          stopPlaybackSources();
          setTransport("idle");
          setPlayheadMs(0);
          return;
        }
        playheadRafRef.current = requestAnimationFrame(tickPlayhead);
      };
      playheadRafRef.current = requestAnimationFrame(tickPlayhead);
    },
    [ensureAudioContext, hydrateTrackBuffer, startMetronomeLoop, stopPlaybackSources],
  );

  useEffect(() => {
    startTracksFromRef.current = startTracksFrom;
  }, [startTracksFrom]);

  const play = useCallback(
    async (fromMs = playheadMs) => {
      if (transport === "recording" || transport === "counting-in") return;
      if (tracksRef.current.length === 0) {
        onNotice("Record or import a track first to play back.");
        return;
      }
      setTransport("playing");
      await startTracksFrom(fromMs);
    },
    [onNotice, playheadMs, startTracksFrom, transport],
  );

  const pausePlayback = useCallback(() => {
    if (transport === "playing") {
      stopPlaybackSources();
      setTransport("idle");
    }
  }, [stopPlaybackSources, transport]);

  const seek = useCallback(
    (ms: number) => {
      const clamped = Math.max(0, ms);
      setPlayheadMs(clamped);
      if (transport === "playing") {
        void startTracksFrom(clamped);
      }
    },
    [startTracksFrom, transport],
  );

  const beginSampleLockedCapture = useCallback(
    async (punchInMs: number, role: StudioTrackRole, baseLayerIndex: number) => {
      const ctx = await ensureAudioContext();
      const mode = captureModeRef.current;
      const currentInputs = inputsRef.current;
      const chTotal = detectedChannelsRef.current;
      const broadcastMap = useBroadcastMapRef.current;

      const sourceNodes: AudioNode[] = [];
      const channelMeta: NonNullable<typeof activeCaptureMetaRef.current>["channels"] = [];
      clearSafetyTaps();

      let nextLayer = Math.max(0, baseLayerIndex);
      for (let idx = 0; idx < currentInputs.length; idx++) {
        const cfg = currentInputs[idx]!;
        if (mode !== "solo" && !cfg.armed) continue;
        const strip = inputStripsRef.current.get(cfg.id);
        if (!strip) continue;

        sourceNodes.push(strip.muteGain);
        const inputSource =
          mode === "solo"
            ? "Solo Input"
            : mode === "multi-device"
              ? `USB Input ${idx + 1}`
              : formatHardwareChannelName(cfg.channelIndex, broadcastMap, chTotal);

        channelMeta.push({
          kind: "input",
          label: cfg.label.trim() || `Mic ${idx + 1}`,
          layerIndex: nextLayer,
          inputSource,
          colorTag: cfg.colorTag,
          role: mode === "solo" ? role : "voice",
        });
        nextLayer += 1;
      }

      // Optional Ch 1-2 Main Mix stereo safety stem on 4+ch multitrack buses
      if (
        mode === "multitrack" &&
        recordSafetyMixRef.current &&
        splitterRef.current &&
        chTotal >= 4 &&
        sourceNodes.length <= MAX_STUDIO_INPUTS
      ) {
        const tapL = ctx.createGain();
        const tapR = ctx.createGain();
        splitterRef.current.connect(tapL, 0, 0);
        splitterRef.current.connect(tapR, 1, 0);
        safetyTapsRef.current.push(tapL, tapR);
        sourceNodes.push(tapL, tapR);
        channelMeta.push(
          {
            kind: "safety-l",
            label: "Main Mix Safety",
            layerIndex: nextLayer,
            inputSource: "Ch 1–2 Main Mix",
            colorTag: "slate",
            role: "instrumental",
          },
          {
            kind: "safety-r",
            label: "Main Mix Safety",
            layerIndex: nextLayer,
            inputSource: "Ch 1–2 Main Mix",
            colorTag: "slate",
            role: "instrumental",
          },
        );
      }

      if (sourceNodes.length === 0) {
        onNotice("Arm at least one microphone input before recording.");
        setTransport("idle");
        return;
      }

      pcmRecorderRef.current?.dispose();
      const recorder = await MultiChannelPcmRecorder.create(ctx, sourceNodes);
      pcmRecorderRef.current = recorder;
      activeCaptureMetaRef.current = { channels: channelMeta, punchInMs };

      recordAccumMsRef.current = 0;
      recordStartPerfRef.current = performance.now();

      if (overdubEnabled && tracksRef.current.length > 0) {
        void startTracksFrom(punchInMs, Number.MAX_SAFE_INTEGER);
      } else if (metronomeEnabledRef.current) {
        startMetronomeLoop(ctx, 0, true);
      }

      recorder.start();
      setTransport("recording");
    },
    [clearSafetyTaps, ensureAudioContext, onNotice, overdubEnabled, startMetronomeLoop, startTracksFrom],
  );

  const startRecording = useCallback(
    async (
      role: StudioTrackRole = tracksRef.current.length > 0 ? "overdub" : "voice",
      baseLayerIndex = 0,
    ) => {
      if (transport === "recording" || transport === "counting-in") return;
      stopPlaybackSources();

      if (!micReady) {
        const ok = await armInputs();
        if (!ok) return;
      }

      const punchInMs = playheadMs;
      if (countInBars > 0) {
        const ctx = await ensureAudioContext();
        const totalBeats = countInBars * 4;
        const beatMs = 60_000 / Math.max(40, bpmRef.current);
        let currentBeat = 1;
        setTransport("counting-in");
        setCountInBeat(totalBeats);
        if (metronomeEnabledRef.current) {
          const mg = metronomeGainNodeRef.current;
          if (mg) mg.gain.setValueAtTime(1, ctx.currentTime);
          triggerClickPulse(ctx, mg ?? ctx.destination, ctx.currentTime + 0.01, true);
        }

        const stepCountIn = () => {
          currentBeat += 1;
          if (currentBeat > totalBeats) {
            setCountInBeat(null);
            void beginSampleLockedCapture(punchInMs, role, baseLayerIndex);
            return;
          }
          setCountInBeat(totalBeats - currentBeat + 1);
          if (metronomeEnabledRef.current) {
            const mg = metronomeGainNodeRef.current;
            if (mg) mg.gain.setValueAtTime(1, ctx.currentTime);
            triggerClickPulse(ctx, mg ?? ctx.destination, ctx.currentTime + 0.01, (currentBeat - 1) % 4 === 0);
          }
          countInTimerRef.current = window.setTimeout(stepCountIn, beatMs);
        };
        countInTimerRef.current = window.setTimeout(stepCountIn, beatMs);
        return;
      }

      await beginSampleLockedCapture(punchInMs, role, baseLayerIndex);
    },
    [
      armInputs,
      beginSampleLockedCapture,
      countInBars,
      ensureAudioContext,
      micReady,
      playheadMs,
      stopPlaybackSources,
      transport,
    ],
  );

  const pauseRecording = useCallback(() => {
    const rec = pcmRecorderRef.current;
    if (!rec || transport !== "recording") return;
    rec.pause();
    recordAccumMsRef.current += performance.now() - recordStartPerfRef.current;
    recordStartPerfRef.current = 0;
    stopPlaybackSources();
    setTransport("paused");
  }, [stopPlaybackSources, transport]);

  const resumeRecording = useCallback(() => {
    const rec = pcmRecorderRef.current;
    if (!rec || transport !== "paused") return;
    rec.resume();
    recordStartPerfRef.current = performance.now();
    const punchIn = activeCaptureMetaRef.current?.punchInMs ?? 0;
    if (overdubEnabled && tracksRef.current.length > 0) {
      void startTracksFrom(punchIn + recordAccumMsRef.current, Number.MAX_SAFE_INTEGER);
    } else if (metronomeEnabledRef.current && audioCtxRef.current) {
      startMetronomeLoop(audioCtxRef.current, 0, true);
    }
    setTransport("recording");
  }, [overdubEnabled, startMetronomeLoop, startTracksFrom, transport]);

  const discardRecording = useCallback(() => {
    window.clearTimeout(countInTimerRef.current);
    countInTimerRef.current = undefined;
    setCountInBeat(null);
    stopPlaybackSources();
    clearSafetyTaps();
    if (pcmRecorderRef.current) {
      void pcmRecorderRef.current.stop().finally(() => {
        pcmRecorderRef.current?.dispose();
        pcmRecorderRef.current = null;
      });
    }
    activeCaptureMetaRef.current = null;
    recordStartPerfRef.current = 0;
    recordAccumMsRef.current = 0;
    telemetryRef.current.recordingProgressMs = 0;
    setTransport("idle");
    onNotice("Discarded in-progress take.");
  }, [clearSafetyTaps, onNotice, stopPlaybackSources]);

  const stopRecording = useCallback(() => {
    window.clearTimeout(countInTimerRef.current);
    countInTimerRef.current = undefined;
    setCountInBeat(null);
    stopPlaybackSources();

    if (transport === "counting-in") {
      setTransport("idle");
      return;
    }

    const rec = pcmRecorderRef.current;
    const meta = activeCaptureMetaRef.current;
    if (!rec || !meta) {
      setTransport("idle");
      return;
    }

    void (async () => {
      try {
        const ctx = await ensureAudioContext();
        const sr = ctx.sampleRate || 48000;
        const pcmChannels = await rec.stop();
        rec.dispose();
        clearSafetyTaps();
        pcmRecorderRef.current = null;
        activeCaptureMetaRef.current = null;

        const frames = pcmChannels[0]?.length ?? 0;
        if (frames < Math.round(sr * 0.15)) {
          onNotice("Recording was too short to keep.");
          return;
        }

        const durationMs = Math.max(250, Math.round((frames / sr) * 1000));
        const createdTracks: StudioTrackV1[] = [];
        const createdAt = new Date().toISOString();

        for (let i = 0; i < meta.channels.length; i++) {
          const desc = meta.channels[i]!;
          if (desc.kind === "safety-r") continue;

          const isSafetyStereo =
            desc.kind === "safety-l" && meta.channels[i + 1]?.kind === "safety-r";
          const dataLeft = pcmChannels[i]!;
          const dataRight = isSafetyStereo ? pcmChannels[i + 1]! : null;
          const wavChannels = dataRight ? [dataLeft, dataRight] : [dataLeft];
          const wavBlob = encodeWavFromFloat32Channels(wavChannels, sr);

          const trackId = makeTrackId();
          const idbKey = `${trackId}-audio`;
          await saveAudioBlob(idbKey, wavBlob);

          const audioBuf = ctx.createBuffer(wavChannels.length, frames, sr);
          for (let c = 0; c < wavChannels.length; c++) {
            audioBuf.copyToChannel(new Float32Array(wavChannels[c]!), c);
          }
          bufferCacheRef.current.set(idbKey, audioBuf);

          const peaks = computePeaksFromFloat32(dataLeft, 200);
          createdTracks.push({
            id: trackId,
            name: desc.label,
            role: desc.role,
            layerIndex: desc.layerIndex,
            offsetMs: meta.punchInMs,
            trimStartMs: 0,
            durationMs,
            sourceDurationMs: durationMs,
            inputSource: desc.inputSource,
            colorTag: desc.colorTag,
            gain: 1,
            pan: 0,
            muted: false,
            solo: false,
            peaks,
            audioRef: {
              storage: "idb",
              idbKey,
              url: null,
              mimeType: "audio/wav",
              byteLength: wavBlob.size,
              sampleRate: sr,
            },
            createdAt,
          });
        }

        if (createdTracks.length > 0) {
          onTracksCaptured(createdTracks);
        }
      } finally {
        recordStartPerfRef.current = 0;
        recordAccumMsRef.current = 0;
        telemetryRef.current.recordingProgressMs = 0;
        setTransport("idle");
      }
    })();
  }, [clearSafetyTaps, ensureAudioContext, onNotice, onTracksCaptured, stopPlaybackSources, transport]);

  const importAudioFile = useCallback(
    async (file: File, layerIndex = 0, offsetMs = 0): Promise<StudioTrackV1 | null> => {
      try {
        const ctx = await ensureAudioContext();
        const ab = await file.arrayBuffer();
        const decoded = await ctx.decodeAudioData(ab.slice(0));
        const trackId = makeTrackId();
        const idbKey = `${trackId}-audio`;
        await saveAudioBlob(idbKey, file);
        bufferCacheRef.current.set(idbKey, decoded);

        const durationMs = Math.max(250, Math.round(decoded.duration * 1000));
        const baseName = file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Imported stem";
        return {
          id: trackId,
          name: baseName,
          role: "instrumental",
          layerIndex: Math.max(0, layerIndex),
          offsetMs: Math.max(0, offsetMs),
          trimStartMs: 0,
          durationMs,
          sourceDurationMs: durationMs,
          inputSource: "Imported file",
          colorTag: "emerald",
          gain: 0.92,
          pan: 0,
          muted: false,
          solo: false,
          peaks: computePeaksFromBuffer(decoded, 200),
          audioRef: {
            storage: "idb",
            idbKey,
            url: null,
            mimeType: file.type || "audio/wav",
            byteLength: file.size,
            sampleRate: decoded.sampleRate,
          },
          createdAt: new Date().toISOString(),
        };
      } catch {
        onNotice("Could not decode that audio file. Try WAV, MP3, M4A, or WebM.");
        return null;
      }
    },
    [ensureAudioContext, onNotice],
  );

  const computeNormalizedGain = useCallback(
    async (track: StudioTrackV1): Promise<number | null> => {
      const buf = await hydrateTrackBuffer(track);
      if (!buf) return null;
      const peak = computeClipPeakAmplitude(buf, track.trimStartMs ?? 0, track.durationMs);
      if (peak <= 0.002) return null;
      const targetAmp = 0.891; // -1.0 dBFS broadcast target
      return Math.round(Math.max(0.25, Math.min(2.0, targetAmp / peak)) * 100) / 100;
    },
    [hydrateTrackBuffer],
  );

  const exportMixWav = useCallback(async (): Promise<{ blob: Blob; filename: string } | null> => {
    const items: Array<{ track: StudioTrackV1; buffer: AudioBuffer }> = [];
    for (const tr of tracksRef.current) {
      const buf = await hydrateTrackBuffer(tr);
      if (buf) items.push({ track: tr, buffer: buf });
    }
    if (items.length === 0) {
      onNotice("Add or record an audible track before exporting WAV.");
      return null;
    }
    const mixed = await mixTracksOffline(items, masterGainRef.current, items[0]!.buffer.sampleRate);
    return {
      blob: encodeWavFromBuffer(mixed),
      filename: `nexus-studio-master-${Date.now()}.wav`,
    };
  }, [hydrateTrackBuffer, onNotice]);

  const exportStemsWav = useCallback(
    async (
      layerNames: Record<number, string>,
    ): Promise<Array<{ label: string; blob: Blob; filename: string }>> => {
      const items: Array<{ track: StudioTrackV1; buffer: AudioBuffer }> = [];
      for (const tr of tracksRef.current) {
        const buf = await hydrateTrackBuffer(tr);
        if (buf) items.push({ track: tr, buffer: buf });
      }
      if (items.length === 0) {
        onNotice("Add or record at least one track before exporting stems.");
        return [];
      }
      const rendered = await renderLayerStemsOffline(items, layerNames, items[0]!.buffer.sampleRate);
      return rendered.map((stem) => {
        const slug =
          stem.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
          `track-${stem.layerIndex + 1}`;
        return {
          label: stem.label,
          blob: stem.blob,
          filename: `nexus-stem-${slug}.wav`,
        };
      });
    },
    [hydrateTrackBuffer, onNotice],
  );

  const removeCachedTrackAudio = useCallback(async (track: StudioTrackV1, remainingTracks: StudioTrackV1[] = []) => {
    const key = track.audioRef.idbKey;
    const stillReferenced = key && remainingTracks.some((t) => t.audioRef.idbKey === key);
    if (!stillReferenced) {
      bufferCacheRef.current.delete(key || track.id);
      if (key) {
        await deleteAudioBlob(key);
        if (track.audioRef.storage === "url" && track.audioRef.url?.startsWith("/api/studio/audio")) {
          void fetch(`/api/studio/audio?key=${encodeURIComponent(key)}`, { method: "DELETE" }).catch(() => {});
        }
      }
    }
  }, []);

  const clearClipIndicators = useCallback(() => {
    telemetryRef.current.clipped = false;
    resetMetersClip(telemetryRef.current.inputMeters, true);
  }, []);

  /** Lock-free 60fps telemetry sampler for 1..8 input ribbons and 16-channel hardware matrix. */
  const sampleTelemetry = useCallback((): LiveAudioTelemetry => {
    const out = telemetryRef.current;

    if (transport === "recording" && recordStartPerfRef.current > 0) {
      out.recordingProgressMs =
        recordAccumMsRef.current + (performance.now() - recordStartPerfRef.current);
    } else if (transport === "paused") {
      out.recordingProgressMs = recordAccumMsRef.current;
    }

    const timeBuf = timeBuf256Ref.current;
    const freqBuf = freqBuf128Ref.current;
    const currentInputs = inputsRef.current;
    while (out.inputMeters.length < currentInputs.length) out.inputMeters.push(createChannelMeter());
    if (out.inputMeters.length > currentInputs.length) out.inputMeters.length = currentInputs.length;

    if (micReady) {
      for (let i = 0; i < currentInputs.length; i++) {
        const strip = inputStripsRef.current.get(currentInputs[i]!.id);
        sampleAnalyserInto(strip?.analyser ?? null, out.inputMeters[i]!, timeBuf, freqBuf);
      }

      const probes = rawChannelAnalysersRef.current;
      const rawBuf = rawTimeBuf128Ref.current;
      for (let c = 0; c < out.rawChannelRms.length; c++) {
        const probe = probes[c];
        if (!probe) {
          out.rawChannelRms[c] = out.rawChannelRms[c]! * 0.8;
          continue;
        }
        probe.getByteTimeDomainData(rawBuf);
        let sumSq = 0;
        for (let i = 0; i < rawBuf.length; i++) {
          const s = (rawBuf[i]! - 128) / 128;
          sumSq += s * s;
        }
        const rms = Math.min(1, Math.sqrt(sumSq / rawBuf.length) * 2.2);
        out.rawChannelRms[c] = out.rawChannelRms[c]! * 0.35 + rms * 0.65;
      }
    } else {
      for (let i = 0; i < out.inputMeters.length; i++) {
        sampleAnalyserInto(null, out.inputMeters[i]!, timeBuf, freqBuf);
      }
      for (let c = 0; c < out.rawChannelRms.length; c++) out.rawChannelRms[c] = out.rawChannelRms[c]! * 0.8;
    }

    if (transport === "playing" && playbackAnalyserRef.current) {
      const temp = createChannelMeter();
      sampleAnalyserInto(playbackAnalyserRef.current, temp, timeBuf, freqBuf);
      out.rms = out.rms * 0.4 + temp.rms * 0.6;
      out.peak = Math.max(temp.peak, out.peak * 0.92);
      out.clipped = temp.clipped;
      for (let i = 0; i < out.bands.length; i++) out.bands[i] = temp.bands[i]!;
    } else if (micReady) {
      let maxRms = 0;
      let maxPeak = 0;
      let anyClip = false;
      out.bands.fill(0);
      for (let i = 0; i < currentInputs.length; i++) {
        const m = out.inputMeters[i]!;
        if (m.rms > maxRms) maxRms = m.rms;
        if (m.peak > maxPeak) maxPeak = m.peak;
        if (m.clipped) anyClip = true;
        for (let b = 0; b < out.bands.length; b++) {
          if ((m.bands[b] ?? 0) > out.bands[b]!) out.bands[b] = m.bands[b]!;
        }
      }
      out.rms = maxRms;
      out.peak = maxPeak;
      out.clipped = anyClip;
    } else {
      out.rms *= 0.84;
      out.peak *= 0.9;
      out.clipped = false;
      for (let i = 0; i < out.bands.length; i++) out.bands[i] = out.bands[i]! * 0.84;
    }

    return out;
  }, [micReady, transport]);

  return {
    transport,
    playheadMs,
    devices,
    audioInterfaces,
    useBroadcastChannelMap,
    captureMode,
    setCaptureMode: changeCaptureMode,
    selectedDeviceId,
    setSelectedDeviceId: (id: string) => {
      setSelectedDeviceId(id);
      if (micReady) void armInputs({ deviceId: id });
    },
    inputs,
    addInput,
    removeInput,
    updateInput,
    recordSafetyMix,
    setRecordSafetyMix,
    detectedChannels,
    sampleRate,
    micReady,
    micError,
    monitorInput,
    setMonitorInput,
    studioRawMic,
    setStudioRawMic: (next: boolean) => {
      setStudioRawMic(next);
      if (micReady) void armInputs({ rawMode: next });
    },
    overdubEnabled,
    setOverdubEnabled,
    countInBeat,
    armInputs,
    autoConfigureMultiMic,
    refreshDevices,
    clearClipIndicators,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    discardRecording,
    play,
    pausePlayback,
    seek,
    importAudioFile,
    computeNormalizedGain,
    exportMixWav,
    exportStemsWav,
    removeCachedTrackAudio,
    sampleTelemetry,
    telemetryRef: telemetryRef as RefObject<LiveAudioTelemetry>,
  };
}
