"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { deleteAudioBlob, loadAudioBlob, saveAudioBlob } from "@/lib/studio/audio-db";
import {
  MultiChannelPcmRecorder,
  classifyInputDevice,
  detectRodeCasterDevices,
  formatHardwareChannelName,
  type MicDeviceOption,
  type RodeCasterDetection,
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

export type { MicDeviceOption, RodeCasterDetection, StudioCaptureMode };

export type StudioTransportState =
  | "idle"
  | "counting-in"
  | "recording"
  | "paused"
  | "playing";

export type MicChannelConfig = {
  label: string;
  armed: boolean;
  muted: boolean;
  gain: number;
  hpf: boolean;
  invertPhase: boolean;
  /** 0-based hardware channel index on the active device (`2` = Ch 3 Combo 1, `3` = Ch 4 Combo 2). */
  channelIndex: number;
  /** Used in `"dual-device"` mode so Mic 1 & Mic 2 can address two separate USB audio inputs. */
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
  mic1: ChannelMeterTelemetry;
  mic2: ChannelMeterTelemetry;
  /** Real-time RMS levels across every detected hardware channel (Ch 1 .. Ch 16) for the patchbay. */
  rawChannelRms: Float32Array;
  detectedChannels: number;
  sampleRate: number;
  isLiveMic: boolean;
  recordingProgressMs: number;
};

function makeTrackId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `trk-${crypto.randomUUID()}`;
  }
  return `trk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
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

/** Synthesizes a clean subtle click pulse via Web Audio oscillator routed through a dedicated metronome gain node. */
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
  const [captureMode, setCaptureMode] = useState<StudioCaptureMode>("single");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("default");
  const [mic1, setMic1] = useState<MicChannelConfig>({
    label: "Mic 1 · Host",
    armed: true,
    muted: false,
    gain: 1.0,
    hpf: true,
    invertPhase: false,
    channelIndex: 2, // RØDECaster Pro II Ch 3 (Combo 1) when multitrack >= 4ch
    deviceId: "default",
    colorTag: "gold",
  });
  const [mic2, setMic2] = useState<MicChannelConfig>({
    label: "Mic 2 · Guest",
    armed: true,
    muted: false,
    gain: 1.0,
    hpf: true,
    invertPhase: false,
    channelIndex: 3, // RØDECaster Pro II Ch 4 (Combo 2) when multitrack >= 4ch
    deviceId: "default",
    colorTag: "sky",
  });
  const [recordSafetyMix, setRecordSafetyMix] = useState(false);

  const [micReady, setMicReady] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [detectedChannels, setDetectedChannels] = useState(2);
  const [sampleRate, setSampleRate] = useState(48000);
  const [monitorInput, setMonitorInput] = useState(false);
  const [studioRawMic, setStudioRawMic] = useState(true);
  const [overdubEnabled, setOverdubEnabled] = useState(true);
  const [countInBeat, setCountInBeat] = useState<number | null>(null);

  const rodeCaster: RodeCasterDetection = useMemo(() => detectRodeCasterDevices(devices), [devices]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const primaryStreamRef = useRef<MediaStream | null>(null);
  const secondaryStreamRef = useRef<MediaStream | null>(null);
  const primarySourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const secondarySourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const splitterRef = useRef<ChannelSplitterNode | null>(null);
  const rawChannelAnalysersRef = useRef<AnalyserNode[]>([]);
  const mic1StripRef = useRef<MicStripNodes | null>(null);
  const mic2StripRef = useRef<MicStripNodes | null>(null);
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const masterGainNodeRef = useRef<GainNode | null>(null);
  const metronomeGainNodeRef = useRef<GainNode | null>(null);

  const pcmRecorderRef = useRef<MultiChannelPcmRecorder | null>(null);
  const activeCaptureMetaRef = useRef<{
    channels: Array<{
      kind: "mic1" | "mic2" | "safety-l" | "safety-r";
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
  const mic1Ref = useRef<MicChannelConfig>(mic1);
  const mic2Ref = useRef<MicChannelConfig>(mic2);
  const monitorInputRef = useRef(monitorInput);
  const studioRawMicRef = useRef(studioRawMic);
  const selectedDeviceIdRef = useRef(selectedDeviceId);
  const detectedChannelsRef = useRef(detectedChannels);
  const recordSafetyMixRef = useRef(recordSafetyMix);
  const autoDetectedRodeOnceRef = useRef(false);

  const telemetryRef = useRef<LiveAudioTelemetry>({
    rms: 0,
    peak: 0,
    clipped: false,
    bands: new Float32Array(32),
    mic1: createChannelMeter(),
    mic2: createChannelMeter(),
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
    mic1Ref.current = mic1;
  }, [mic1]);
  useEffect(() => {
    mic2Ref.current = mic2;
  }, [mic2]);
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
    masterGainRef.current = masterGain;
    const ctx = audioCtxRef.current;
    const master = masterGainNodeRef.current;
    if (ctx && master) {
      master.gain.setTargetAtTime(masterGain, ctx.currentTime, 0.02);
    }
  }, [masterGain]);

  // Synchronize live solo/mute/gain/pan & voice DSP adjustments while tracks are playing
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

  // Synchronize Mic 1 & Mic 2 live DSP strip parameters (HPF, Trim Gain, Polarity, Mute, Monitor) smoothly
  useEffect(() => {
    const ctx = audioCtxRef.current;
    const applyStrip = (strip: MicStripNodes | null, cfg: MicChannelConfig) => {
      if (!ctx || !strip) return;
      strip.hpf.frequency.setTargetAtTime(cfg.hpf ? 80 : 10, ctx.currentTime, 0.02);
      const signedGain = cfg.gain * (cfg.invertPhase ? -1 : 1);
      strip.trimGain.gain.setTargetAtTime(signedGain, ctx.currentTime, 0.015);
      strip.muteGain.gain.setTargetAtTime(cfg.muted ? 0 : 1, ctx.currentTime, 0.015);
      strip.monitorGain.gain.setTargetAtTime(monitorInput && !cfg.muted && cfg.armed ? 0.8 : 0, ctx.currentTime, 0.02);
    };
    applyStrip(mic1StripRef.current, mic1);
    applyStrip(mic2StripRef.current, mic2);
  }, [mic1, mic2, monitorInput]);

  // Live re-patch hardware splitter outputs when user changes Mic 1 or Mic 2 channel index without restarting stream
  useEffect(() => {
    const splitter = splitterRef.current;
    const mode = captureModeRef.current;
    if (!splitter || (mode !== "rcp2-multitrack" && mode !== "stereo-split")) return;
    const maxCh = Math.max(1, splitter.numberOfOutputs);
    const ch1 = Math.max(0, Math.min(maxCh - 1, mic1.channelIndex));
    const ch2 = Math.max(0, Math.min(maxCh - 1, mic2.channelIndex));

    try {
      splitter.disconnect();
    } catch {
      // Ignore
    }
    // Reconnect raw channel probes for the live patchbay
    rawChannelAnalysersRef.current.forEach((an, idx) => {
      if (idx < maxCh) {
        try {
          splitter.connect(an, idx, 0);
        } catch {
          // Ignore out of range
        }
      }
    });
    if (mic1StripRef.current) {
      splitter.connect(mic1StripRef.current.hpf, ch1, 0);
    }
    if (mic2StripRef.current) {
      splitter.connect(mic2StripRef.current.hpf, ch2, 0);
    }
  }, [mic1.channelIndex, mic2.channelIndex]);

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

  const applyDiscoveredDevices = useCallback((inputs: MicDeviceOption[]) => {
    setDevices(inputs);

    // Auto-select RØDECaster Pro II cleanly on first discovery if user hasn't explicitly chosen another device
    const rc = detectRodeCasterDevices(inputs);
    if (rc.detected && !autoDetectedRodeOnceRef.current && selectedDeviceIdRef.current === "default") {
      autoDetectedRodeOnceRef.current = true;
      if (rc.multitrackDevice) {
        setSelectedDeviceId(rc.multitrackDevice.deviceId);
        setCaptureMode("rcp2-multitrack");
        setMic1((p) => ({ ...p, channelIndex: 2, deviceId: rc.multitrackDevice!.deviceId }));
        setMic2((p) => ({ ...p, channelIndex: 3, deviceId: rc.multitrackDevice!.deviceId }));
      } else if (rc.mainStereoDevice) {
        setSelectedDeviceId(rc.mainStereoDevice.deviceId);
        setCaptureMode("stereo-split");
        setMic1((p) => ({ ...p, channelIndex: 0, deviceId: rc.mainStereoDevice!.deviceId }));
        setMic2((p) => ({
          ...p,
          channelIndex: 1,
          deviceId: rc.chatDevice?.deviceId ?? rc.mainStereoDevice!.deviceId,
        }));
      }
    }
  }, []);

  const refreshDevices = useCallback(async (): Promise<MicDeviceOption[]> => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return [];
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const inputs = all
        .filter((d) => d.kind === "audioinput")
        .map((d, idx) => classifyInputDevice(d, idx));
      applyDiscoveredDevices(inputs);
      return inputs;
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
        const inputs = all
          .filter((d) => d.kind === "audioinput")
          .map((d, idx) => classifyInputDevice(d, idx));
        applyDiscoveredDevices(inputs);
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

  const teardownInputs = useCallback(() => {
    pcmRecorderRef.current?.dispose();
    pcmRecorderRef.current = null;

    const stopStream = (stream: MediaStream | null) => {
      if (!stream) return;
      for (const t of stream.getTracks()) t.stop();
    };
    stopStream(primaryStreamRef.current);
    stopStream(secondaryStreamRef.current);
    primaryStreamRef.current = null;
    secondaryStreamRef.current = null;

    const safeDisconnect = (node: AudioNode | null) => {
      try {
        node?.disconnect();
      } catch {
        // Ignore
      }
    };
    safeDisconnect(primarySourceRef.current);
    safeDisconnect(secondarySourceRef.current);
    safeDisconnect(splitterRef.current);
    for (const an of rawChannelAnalysersRef.current) safeDisconnect(an);
    rawChannelAnalysersRef.current = [];

    const tearStrip = (strip: MicStripNodes | null) => {
      if (!strip) return;
      safeDisconnect(strip.hpf);
      safeDisconnect(strip.trimGain);
      safeDisconnect(strip.muteGain);
      safeDisconnect(strip.analyser);
      safeDisconnect(strip.monitorGain);
    };
    tearStrip(mic1StripRef.current);
    tearStrip(mic2StripRef.current);

    primarySourceRef.current = null;
    secondarySourceRef.current = null;
    splitterRef.current = null;
    mic1StripRef.current = null;
    mic2StripRef.current = null;
    setMicReady(false);
    telemetryRef.current.isLiveMic = false;
  }, []);

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

  const armInputs = useCallback(
    async (overrides?: {
      mode?: StudioCaptureMode;
      deviceId?: string;
      mic1DeviceId?: string;
      mic2DeviceId?: string;
      rawMode?: boolean;
    }): Promise<boolean> => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setMicError("Your browser does not support Web Audio microphone capture.");
        return false;
      }

      const mode = overrides?.mode ?? captureModeRef.current;
      const devId = overrides?.deviceId ?? selectedDeviceIdRef.current;
      const m1Dev = overrides?.mic1DeviceId ?? mic1Ref.current.deviceId;
      const m2Dev = overrides?.mic2DeviceId ?? mic2Ref.current.deviceId;
      // Browser echoCancellation / noiseSuppression silently downmix stereo & multitrack interfaces to mono,
      // so all 2-mic modes always request raw unprocessed hardware audio.
      const rawMode = mode !== "single" ? true : (overrides?.rawMode ?? studioRawMicRef.current);

      try {
        setMicError(null);
        const ctx = await ensureAudioContext();
        teardownInputs();

        if (mode === "dual-device") {
          const stream1 = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: m1Dev && m1Dev !== "default" ? { exact: m1Dev } : undefined,
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
              channelCount: { ideal: 2 },
            },
          });
          primaryStreamRef.current = stream1;

          const sameDevice = m1Dev === m2Dev && m1Dev !== "default";
          const stream2 = sameDevice
            ? stream1
            : await navigator.mediaDevices.getUserMedia({
                audio: {
                  deviceId: m2Dev && m2Dev !== "default" ? { exact: m2Dev } : undefined,
                  echoCancellation: false,
                  noiseSuppression: false,
                  autoGainControl: false,
                  channelCount: { ideal: 2 },
                },
              });
          if (stream2 !== stream1) secondaryStreamRef.current = stream2;

          const src1 = ctx.createMediaStreamSource(stream1);
          const src2 = ctx.createMediaStreamSource(stream2);
          primarySourceRef.current = src1;
          secondarySourceRef.current = src2;

          const strip1 = createMicStrip(ctx, mic1Ref.current);
          const strip2 = createMicStrip(ctx, mic2Ref.current);
          mic1StripRef.current = strip1;
          mic2StripRef.current = strip2;

          src1.connect(strip1.hpf);
          src2.connect(strip2.hpf);

          setDetectedChannels(2);
          telemetryRef.current.detectedChannels = 2;
        } else {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: devId && devId !== "default" ? { exact: devId } : undefined,
              echoCancellation: !rawMode,
              noiseSuppression: !rawMode,
              autoGainControl: false,
              channelCount: mode === "single" ? { ideal: 2 } : { ideal: 16 },
            },
          });
          primaryStreamRef.current = stream;

          const audioTrack = stream.getAudioTracks()[0];
          const settings = audioTrack?.getSettings?.();
          const caps = audioTrack?.getCapabilities?.() as { channelCount?: { max?: number } } | undefined;
          const src = ctx.createMediaStreamSource(stream);
          primarySourceRef.current = src;

          const chCount = Math.max(
            1,
            Math.min(
              16,
              settings?.channelCount ?? caps?.channelCount?.max ?? src.channelCount ?? (mode === "single" ? 1 : 2),
            ),
          );

          setDetectedChannels(chCount);
          telemetryRef.current.detectedChannels = chCount;

          if (mode === "single") {
            const strip1 = createMicStrip(ctx, mic1Ref.current);
            mic1StripRef.current = strip1;
            src.connect(strip1.hpf);
          } else {
            // Discrete channel splitting preserves every RØDECaster Pro II hardware bus cleanly
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

            // Create live RMS probes on every hardware channel for the visual patchbay
            const probes: AnalyserNode[] = [];
            for (let i = 0; i < splitCount; i++) {
              const an = ctx.createAnalyser();
              an.fftSize = 128;
              an.smoothingTimeConstant = 0.55;
              splitter.connect(an, i, 0);
              probes.push(an);
            }
            rawChannelAnalysersRef.current = probes;

            // Clamp/adapt default RØDECaster channels if the OS exposed 2ch Stereo instead of 14/16ch Multitrack
            let ch1 = mic1Ref.current.channelIndex;
            let ch2 = mic2Ref.current.channelIndex;
            if (mode === "stereo-split" || chCount < 4) {
              ch1 = Math.min(ch1 >= chCount ? 0 : ch1, splitCount - 1);
              ch2 = Math.min(ch2 >= chCount ? Math.min(1, splitCount - 1) : ch2, splitCount - 1);
              if (ch1 === ch2 && splitCount >= 2) {
                ch1 = 0;
                ch2 = 1;
              }
              setMic1((prev) => (prev.channelIndex === ch1 ? prev : { ...prev, channelIndex: ch1 }));
              setMic2((prev) => (prev.channelIndex === ch2 ? prev : { ...prev, channelIndex: ch2 }));
            } else {
              ch1 = Math.max(0, Math.min(splitCount - 1, ch1));
              ch2 = Math.max(0, Math.min(splitCount - 1, ch2));
            }

            const strip1 = createMicStrip(ctx, { ...mic1Ref.current, channelIndex: ch1 });
            const strip2 = createMicStrip(ctx, { ...mic2Ref.current, channelIndex: ch2 });
            mic1StripRef.current = strip1;
            mic2StripRef.current = strip2;

            splitter.connect(strip1.hpf, ch1, 0);
            splitter.connect(strip2.hpf, ch2, 0);
          }
        }

        telemetryRef.current.isLiveMic = true;
        telemetryRef.current.mic1.clipped = false;
        telemetryRef.current.mic2.clipped = false;
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
              ? "Selected audio device is unavailable. Re-select your RØDECaster Pro II or microphone."
              : "Could not open audio interface. Check USB connection and browser audio permissions.";
        setMicError(msg);
        setMicReady(false);
        return false;
      }
    },
    [createMicStrip, ensureAudioContext, refreshDevices, teardownInputs],
  );

  const applyRodeCasterPreset = useCallback(
    async (preferredMode?: "rcp2-multitrack" | "stereo-split" | "dual-device") => {
      const latest = await refreshDevices();
      const rc = detectRodeCasterDevices(latest);
      setStudioRawMic(true);
      // RØDECaster Pro II users monitor zero-latency via the hardware headphone jacks — keep browser monitor off by default
      setMonitorInput(false);

      if (preferredMode === "dual-device" || (!preferredMode && !rc.multitrackDevice && rc.mainStereoDevice && rc.chatDevice)) {
        const d1 = rc.mainStereoDevice?.deviceId ?? selectedDeviceIdRef.current;
        const d2 = rc.chatDevice?.deviceId ?? rc.secondaryDevice?.deviceId ?? d1;
        setCaptureMode("dual-device");
        setMic1((p) => ({ ...p, armed: true, hpf: true, deviceId: d1, label: "Mic 1 · Host" }));
        setMic2((p) => ({ ...p, armed: true, hpf: true, deviceId: d2, label: "Mic 2 · Guest" }));
        const ok = await armInputs({ mode: "dual-device", mic1DeviceId: d1, mic2DeviceId: d2, rawMode: true });
        if (ok) onNotice("Armed dual USB inputs — sample-locked for 2-mic recording.");
        return;
      }

      if (preferredMode === "stereo-split" || (!preferredMode && !rc.multitrackDevice)) {
        const dev = rc.mainStereoDevice?.deviceId ?? selectedDeviceIdRef.current;
        setCaptureMode("stereo-split");
        setSelectedDeviceId(dev);
        setMic1((p) => ({ ...p, armed: true, hpf: true, channelIndex: 0, label: "Mic 1 · Host" }));
        setMic2((p) => ({ ...p, armed: true, hpf: true, channelIndex: 1, label: "Mic 2 · Guest" }));
        const ok = await armInputs({ mode: "stereo-split", deviceId: dev, rawMode: true });
        if (ok) {
          onNotice("Stereo L/R Split armed — pan Mic 1 Hard Left and Mic 2 Hard Right on your RØDECaster Pro II.");
        }
        return;
      }

      const dev = rc.multitrackDevice?.deviceId ?? rc.mainStereoDevice?.deviceId ?? selectedDeviceIdRef.current;
      setCaptureMode("rcp2-multitrack");
      setSelectedDeviceId(dev);
      setMic1((p) => ({ ...p, armed: true, hpf: true, channelIndex: 2, label: "Mic 1 · Host" }));
      setMic2((p) => ({ ...p, armed: true, hpf: true, channelIndex: 3, label: "Mic 2 · Guest" }));
      const ok = await armInputs({ mode: "rcp2-multitrack", deviceId: dev, rawMode: true });
      if (ok) {
        onNotice(
          detectedChannelsRef.current >= 4
            ? `RØDECaster Pro II Multitrack armed (${detectedChannelsRef.current} ch) — Combo 1 (Ch 3) & Combo 2 (Ch 4).`
            : "Interface opened in 2-channel mode — Mic 1 mapped to Ch 1 (L) and Mic 2 to Ch 2 (R).",
        );
      }
    },
    [armInputs, onNotice, refreshDevices],
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
      const m1 = mic1Ref.current;
      const m2 = mic2Ref.current;
      const s1 = mic1StripRef.current;
      const s2 = mic2StripRef.current;
      const chTotal = detectedChannelsRef.current;
      const isRodeMulti = mode === "rcp2-multitrack" && chTotal >= 4;

      const sourceNodes: AudioNode[] = [];
      const channelMeta: NonNullable<typeof activeCaptureMetaRef.current>["channels"] = [];

      if (mode === "single") {
        if (!s1) {
          onNotice("Arm your microphone before recording.");
          setTransport("idle");
          return;
        }
        sourceNodes.push(s1.muteGain);
        channelMeta.push({
          kind: "mic1",
          label: m1.label.trim() || `Voice ${tracksRef.current.length + 1}`,
          layerIndex: Math.max(0, baseLayerIndex),
          inputSource: "Solo Mic",
          colorTag: m1.colorTag,
          role,
        });
      } else {
        if (m1.armed && s1) {
          sourceNodes.push(s1.muteGain);
          channelMeta.push({
            kind: "mic1",
            label: m1.label.trim() || "Mic 1 · Host",
            layerIndex: Math.max(0, baseLayerIndex),
            inputSource:
              mode === "dual-device"
                ? "Dual USB · Input 1"
                : formatHardwareChannelName(m1.channelIndex, isRodeMulti, chTotal),
            colorTag: m1.colorTag,
            role: "voice",
          });
        }
        if (m2.armed && s2) {
          sourceNodes.push(s2.muteGain);
          channelMeta.push({
            kind: "mic2",
            label: m2.label.trim() || "Mic 2 · Guest",
            layerIndex: Math.max(0, baseLayerIndex) + (m1.armed ? 1 : 0),
            inputSource:
              mode === "dual-device"
                ? "Dual USB · Input 2"
                : formatHardwareChannelName(m2.channelIndex, isRodeMulti, chTotal),
            colorTag: m2.colorTag,
            role: "voice",
          });
        }
        // Optional RØDECaster Pro II Main Stereo Mix safety backup (Ch 1 & Ch 2)
        if (recordSafetyMixRef.current && isRodeMulti && splitterRef.current && chTotal >= 4) {
          const tapL = ctx.createGain();
          const tapR = ctx.createGain();
          splitterRef.current.connect(tapL, 0, 0);
          splitterRef.current.connect(tapR, 1, 0);
          sourceNodes.push(tapL, tapR);
          const safetyLayer = Math.max(0, baseLayerIndex) + (m1.armed ? 1 : 0) + (m2.armed ? 1 : 0);
          channelMeta.push(
            {
              kind: "safety-l",
              label: "Main Mix Safety",
              layerIndex: safetyLayer,
              inputSource: "RCP II · Ch 1-2 Main Mix",
              colorTag: "slate",
              role: "instrumental",
            },
            {
              kind: "safety-r",
              label: "Main Mix Safety",
              layerIndex: safetyLayer,
              inputSource: "RCP II · Ch 1-2 Main Mix",
              colorTag: "slate",
              role: "instrumental",
            },
          );
        }
      }

      if (sourceNodes.length === 0) {
        onNotice("Arm at least one microphone channel (Mic 1 or Mic 2) before recording.");
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
    [ensureAudioContext, onNotice, overdubEnabled, startMetronomeLoop, startTracksFrom],
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
  }, [onNotice, stopPlaybackSources]);

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

          // Construct decoded AudioBuffer directly from captured Float32 PCM (zero decode overhead!)
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
  }, [ensureAudioContext, onNotice, onTracksCaptured, stopPlaybackSources, transport]);

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
        const slug = stem.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `track-${stem.layerIndex + 1}`;
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
    telemetryRef.current.mic1.clipped = false;
    telemetryRef.current.mic1.peakHold = 0;
    telemetryRef.current.mic2.clipped = false;
    telemetryRef.current.mic2.peakHold = 0;
  }, []);

  /** Lock-free 60fps telemetry sampler for dual-mic scopes, dBFS peak-hold meters, and live hardware channel matrix. */
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

    if (micReady) {
      sampleAnalyserInto(mic1StripRef.current?.analyser ?? null, out.mic1, timeBuf, freqBuf);
      sampleAnalyserInto(
        captureModeRef.current === "single" ? null : (mic2StripRef.current?.analyser ?? null),
        out.mic2,
        timeBuf,
        freqBuf,
      );

      // Probe every raw hardware channel for the live RØDECaster Pro II channel activity matrix
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
      sampleAnalyserInto(null, out.mic1, timeBuf, freqBuf);
      sampleAnalyserInto(null, out.mic2, timeBuf, freqBuf);
      for (let c = 0; c < out.rawChannelRms.length; c++) out.rawChannelRms[c] = out.rawChannelRms[c]! * 0.8;
    }

    // Aggregate master / playback bus meter
    if (transport === "playing" && playbackAnalyserRef.current) {
      const temp = createChannelMeter();
      sampleAnalyserInto(playbackAnalyserRef.current, temp, timeBuf, freqBuf);
      out.rms = out.rms * 0.4 + temp.rms * 0.6;
      out.peak = Math.max(temp.peak, out.peak * 0.92);
      out.clipped = temp.clipped;
      for (let i = 0; i < out.bands.length; i++) out.bands[i] = temp.bands[i]!;
    } else if (micReady) {
      out.rms = Math.max(out.mic1.rms, out.mic2.rms);
      out.peak = Math.max(out.mic1.peak, out.mic2.peak);
      out.clipped = out.mic1.clipped || out.mic2.clipped;
      for (let i = 0; i < out.bands.length; i++) {
        out.bands[i] = Math.max(out.mic1.bands[i] ?? 0, out.mic2.bands[i] ?? 0);
      }
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
    rodeCaster,
    captureMode,
    setCaptureMode: (next: StudioCaptureMode) => {
      setCaptureMode(next);
      if (next !== "single") setStudioRawMic(true);
      if (micReady) void armInputs({ mode: next });
    },
    selectedDeviceId,
    setSelectedDeviceId: (id: string) => {
      setSelectedDeviceId(id);
      if (micReady) void armInputs({ deviceId: id });
    },
    mic1,
    updateMic1: (patch: Partial<MicChannelConfig>) => {
      const next = { ...mic1Ref.current, ...patch };
      setMic1(next);
      if (patch.deviceId && captureModeRef.current === "dual-device" && micReady) {
        void armInputs({ mic1DeviceId: patch.deviceId });
      }
    },
    mic2,
    updateMic2: (patch: Partial<MicChannelConfig>) => {
      const next = { ...mic2Ref.current, ...patch };
      setMic2(next);
      if (patch.deviceId && captureModeRef.current === "dual-device" && micReady) {
        void armInputs({ mic2DeviceId: patch.deviceId });
      }
    },
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
    applyRodeCasterPreset,
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
