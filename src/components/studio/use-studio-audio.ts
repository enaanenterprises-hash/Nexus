"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { deleteAudioBlob, loadAudioBlob, saveAudioBlob } from "@/lib/studio/audio-db";
import {
  computePeaksFromBuffer,
  encodeWavFromBuffer,
  mixTracksOffline,
} from "@/lib/studio/wav";
import type { StudioTrackRole, StudioTrackV1 } from "@/lib/studio/types";

export type StudioTransportState =
  | "idle"
  | "counting-in"
  | "recording"
  | "paused"
  | "playing";

export type MicDeviceOption = {
  deviceId: string;
  label: string;
};

export type LiveAudioTelemetry = {
  rms: number;
  peak: number;
  clipped: boolean;
  bands: Float32Array;
  isLiveMic: boolean;
  recordingProgressMs: number;
};

function chooseRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  for (const candidate of [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ]) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return "";
}

function makeTrackId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `trk-${crypto.randomUUID()}`;
  }
  return `trk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Synthesizes a clean subtle click pulse via Web Audio oscillator routed through a dedicated metronome gain node. */
function triggerClickPulse(ctx: AudioContext, destination: AudioNode, atTime: number, accented: boolean) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(accented ? 1046.5 : 783.99, atTime);
  gain.gain.setValueAtTime(0.0001, atTime);
  gain.gain.exponentialRampToValueAtTime(accented ? 0.24 : 0.14, atTime + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, atTime + 0.055);
  osc.connect(gain);
  gain.connect(destination);
  osc.start(atTime);
  osc.stop(atTime + 0.065);
}

type ActivePlaybackNodes = {
  trackId: string;
  source: AudioBufferSourceNode;
  gainNode: GainNode;
  panNode: StereoPannerNode;
};

export function useStudioAudio({
  tracks,
  masterGain,
  bpm,
  countInBars,
  metronomeEnabled,
  onTrackCaptured,
  onNotice,
}: {
  tracks: StudioTrackV1[];
  masterGain: number;
  bpm: number;
  countInBars: number;
  metronomeEnabled: boolean;
  onTrackCaptured: (track: StudioTrackV1) => void;
  onNotice: (message: string) => void;
}) {
  const [transport, setTransport] = useState<StudioTransportState>("idle");
  const [playheadMs, setPlayheadMs] = useState(0);
  const [devices, setDevices] = useState<MicDeviceOption[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("default");
  const [micReady, setMicReady] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [monitorInput, setMonitorInput] = useState(false);
  const [studioRawMic, setStudioRawMic] = useState(false);
  const [inputGain, setInputGain] = useState(1.0);
  const [overdubEnabled, setOverdubEnabled] = useState(true);
  const [countInBeat, setCountInBeat] = useState<number | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const inputGainNodeRef = useRef<GainNode | null>(null);
  const monitorGainNodeRef = useRef<GainNode | null>(null);
  const masterGainNodeRef = useRef<GainNode | null>(null);
  const metronomeGainNodeRef = useRef<GainNode | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const bufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
  const playbackNodesRef = useRef<ActivePlaybackNodes[]>([]);

  const playbackStartCtxTimeRef = useRef(0);
  const playbackOffsetMsRef = useRef(0);
  const recordStartPerfRef = useRef(0);
  const recordAccumMsRef = useRef(0);
  const recordPunchOffsetMsRef = useRef(0);
  const recordRoleRef = useRef<StudioTrackRole>("voice");
  const recordLayerRef = useRef<number>(0);
  const countInTimerRef = useRef<number | undefined>(undefined);
  const metronomeTimerRef = useRef<number | undefined>(undefined);
  const playheadRafRef = useRef<number>(0);
  const metronomeEnabledRef = useRef(metronomeEnabled);
  const bpmRef = useRef(bpm);
  const transportRef = useRef<StudioTransportState>(transport);

  const telemetryRef = useRef<LiveAudioTelemetry>({
    rms: 0,
    peak: 0,
    clipped: false,
    bands: new Float32Array(48),
    isLiveMic: false,
    recordingProgressMs: 0,
  });
  const freqBufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const timeBufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const tracksRef = useRef(tracks);
  const masterGainRef = useRef(masterGain);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  useEffect(() => {
    metronomeEnabledRef.current = metronomeEnabled;
  }, [metronomeEnabled]);

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  useEffect(() => {
    transportRef.current = transport;
  }, [transport]);

  useEffect(() => {
    masterGainRef.current = masterGain;
    const ctx = audioCtxRef.current;
    const master = masterGainNodeRef.current;
    if (ctx && master) {
      master.gain.setTargetAtTime(masterGain, ctx.currentTime, 0.02);
    }
  }, [masterGain]);

  // Synchronize live solo/mute/gain/pan adjustments while tracks are playing
  useEffect(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || playbackNodesRef.current.length === 0) return;
    const anySolo = tracks.some((t) => t.solo);
    for (const node of playbackNodesRef.current) {
      const tr = tracks.find((t) => t.id === node.trackId);
      if (!tr) continue;
      const audible = anySolo ? tr.solo : !tr.muted;
      node.gainNode.gain.setTargetAtTime(audible ? tr.gain : 0, ctx.currentTime, 0.02);
      node.panNode.pan.setTargetAtTime(tr.pan, ctx.currentTime, 0.02);
    }
  }, [tracks]);

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
      playbackAnalyser.smoothingTimeConstant = 0.72;
      master.connect(playbackAnalyser);

      audioCtxRef.current = ctx;
      masterGainNodeRef.current = master;
      metronomeGainNodeRef.current = metronomeGain;
      if (!analyserRef.current) analyserRef.current = playbackAnalyser;
    }
    if (audioCtxRef.current.state === "suspended") {
      await audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const refreshDevices = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const inputs = all
        .filter((d) => d.kind === "audioinput")
        .map((d, idx) => ({
          deviceId: d.deviceId || `mic-${idx}`,
          label: d.label?.trim() || `Microphone ${idx + 1}`,
        }));
      setDevices(inputs);
    } catch {
      // Ignore permission errors before first prompt
    }
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return;
    let active = true;
    navigator.mediaDevices
      .enumerateDevices()
      .then((all) => {
        if (!active) return;
        setDevices(
          all
            .filter((d) => d.kind === "audioinput")
            .map((d, idx) => ({
              deviceId: d.deviceId || `mic-${idx}`,
              label: d.label?.trim() || `Microphone ${idx + 1}`,
            })),
        );
      })
      .catch(() => null);
    const onChange = () => void refreshDevices();
    navigator.mediaDevices.addEventListener("devicechange", onChange);
    return () => {
      active = false;
      navigator.mediaDevices.removeEventListener("devicechange", onChange);
    };
  }, [refreshDevices]);

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

  // Immediately stop/restart metronome when Click or BPM changes mid-playback or mid-recording.
  useEffect(() => {
    if (!metronomeEnabled) {
      stopMetronome();
      return;
    }
    if (transport === "playing" || transport === "recording") {
      const ctx = audioCtxRef.current;
      if (ctx) {
        startMetronomeLoop(ctx, 0, false);
      }
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
        node.gainNode.disconnect();
        node.panNode.disconnect();
      } catch {
        // Ignore already stopped sources
      }
    }
    playbackNodesRef.current = [];
  }, [stopMetronome]);

  const teardownMic = useCallback(() => {
    if (micStreamRef.current) {
      for (const t of micStreamRef.current.getTracks()) t.stop();
      micStreamRef.current = null;
    }
    try {
      inputGainNodeRef.current?.disconnect();
      monitorGainNodeRef.current?.disconnect();
    } catch {
      // Ignore
    }
    inputGainNodeRef.current = null;
    monitorGainNodeRef.current = null;
    setMicReady(false);
    telemetryRef.current.isLiveMic = false;
  }, []);

  useEffect(() => {
    return () => {
      window.clearTimeout(countInTimerRef.current);
      stopPlaybackSources();
      teardownMic();
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== "inactive") {
        try {
          rec.stop();
        } catch {
          // Ignore
        }
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        void audioCtxRef.current.close().catch(() => null);
      }
    };
  }, [stopPlaybackSources, teardownMic]);

  const armMicrophone = useCallback(
    async (deviceId = selectedDeviceId, rawMode = studioRawMic): Promise<MediaStream | null> => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setMicError("Your browser does not support microphone capture.");
        return null;
      }
      try {
        setMicError(null);
        const ctx = await ensureAudioContext();
        teardownMic();

        const constraints: MediaStreamConstraints = {
          audio: {
            deviceId: deviceId && deviceId !== "default" ? { exact: deviceId } : undefined,
            echoCancellation: !rawMode,
            noiseSuppression: !rawMode,
            autoGainControl: false,
          },
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        micStreamRef.current = stream;

        const src = ctx.createMediaStreamSource(stream);
        const gainNode = ctx.createGain();
        gainNode.gain.value = inputGain;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.72;
        const monitorGain = ctx.createGain();
        monitorGain.gain.value = monitorInput ? 0.85 : 0;

        src.connect(gainNode);
        gainNode.connect(analyser);
        analyser.connect(monitorGain);
        monitorGain.connect(ctx.destination);

        inputGainNodeRef.current = gainNode;
        monitorGainNodeRef.current = monitorGain;
        analyserRef.current = analyser;
        telemetryRef.current.isLiveMic = true;
        setMicReady(true);
        void refreshDevices();
        return stream;
      } catch (err) {
        const msg =
          err instanceof Error && err.name === "NotAllowedError"
            ? "Microphone permission was denied. Allow mic access to record."
            : "Could not access microphone input.";
        setMicError(msg);
        setMicReady(false);
        return null;
      }
    },
    [ensureAudioContext, inputGain, monitorInput, refreshDevices, selectedDeviceId, studioRawMic, teardownMic],
  );

  useEffect(() => {
    const ctx = audioCtxRef.current;
    if (ctx && inputGainNodeRef.current) {
      inputGainNodeRef.current.gain.setTargetAtTime(inputGain, ctx.currentTime, 0.02);
    }
  }, [inputGain]);

  useEffect(() => {
    const ctx = audioCtxRef.current;
    if (ctx && monitorGainNodeRef.current) {
      monitorGainNodeRef.current.gain.setTargetAtTime(monitorInput ? 0.85 : 0, ctx.currentTime, 0.02);
    }
  }, [monitorInput]);

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
        const gainNode = ctx.createGain();
        const audible = anySolo ? tr.solo : !tr.muted;
        gainNode.gain.value = audible ? tr.gain : 0;
        const panNode = ctx.createStereoPanner();
        panNode.pan.value = tr.pan;

        src.connect(gainNode);
        gainNode.connect(panNode);
        panNode.connect(masterGainNodeRef.current ?? ctx.destination);

        const delaySec = Math.max(0, (clipStartMs - startMs) / 1000);
        src.start(startTime + delaySec, srcOffsetSec, playDurSec);
        nodes.push({ trackId: tr.id, source: src, gainNode, panNode });
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

  const play = useCallback(
    async (fromMs = playheadMs) => {
      if (transport === "recording" || transport === "counting-in") return;
      if (tracksRef.current.length === 0) {
        onNotice("Record or import a layer first to play back.");
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

  const beginLiveMediaRecorder = useCallback(
    async (stream: MediaStream, punchInMs: number, role: StudioTrackRole, layerIndex = 0) => {
      const ctx = await ensureAudioContext();
      const mime = chooseRecorderMime();
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);

      recordedChunksRef.current = [];
      recordAccumMsRef.current = 0;
      recordStartPerfRef.current = performance.now();
      recordPunchOffsetMsRef.current = punchInMs;
      recordRoleRef.current = role;
      recordLayerRef.current = Math.max(0, layerIndex);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordedChunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        const elapsed =
          recordAccumMsRef.current +
          (recordStartPerfRef.current > 0 ? performance.now() - recordStartPerfRef.current : 0);
        recordStartPerfRef.current = 0;
        const mimeType = recorder.mimeType || mime || "audio/webm";
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        recordedChunksRef.current = [];

        if (blob.size < 256) {
          setTransport("idle");
          onNotice("Recording was too short to keep.");
          return;
        }

        const trackId = makeTrackId();
        const idbKey = `${trackId}-audio`;
        void (async () => {
          try {
            await saveAudioBlob(idbKey, blob);
            const ab = await blob.arrayBuffer();
            let decoded: AudioBuffer | null = null;
            let durationMs = Math.max(250, Math.round(elapsed));
            let sampleRate = ctx.sampleRate || 48000;
            let peaks: number[] = [];
            try {
              decoded = await ctx.decodeAudioData(ab.slice(0));
              bufferCacheRef.current.set(idbKey, decoded);
              durationMs = Math.max(durationMs, Math.round(decoded.duration * 1000));
              sampleRate = decoded.sampleRate;
              peaks = computePeaksFromBuffer(decoded, 160);
            } catch {
              peaks = Array.from({ length: 64 }, () => 0.25);
            }

            const num = tracksRef.current.length + 1;
            const roleLabel =
              recordRoleRef.current === "overdub"
                ? `Overdub ${num}`
                : recordRoleRef.current === "instrumental"
                  ? `Layer ${num}`
                  : recordRoleRef.current === "scratch"
                    ? `Scratch ${num}`
                    : `Voice ${num}`;

            const newTrack: StudioTrackV1 = {
              id: trackId,
              name: roleLabel,
              role: recordRoleRef.current,
              layerIndex: recordLayerRef.current,
              offsetMs: recordPunchOffsetMsRef.current,
              trimStartMs: 0,
              durationMs,
              sourceDurationMs: durationMs,
              gain: 1,
              pan: 0,
              muted: false,
              solo: false,
              peaks,
              audioRef: {
                storage: "idb",
                idbKey,
                url: null,
                mimeType,
                byteLength: blob.size,
                sampleRate,
              },
              createdAt: new Date().toISOString(),
            };
            onTrackCaptured(newTrack);
          } finally {
            setTransport("idle");
            setCountInBeat(null);
            telemetryRef.current.recordingProgressMs = 0;
          }
        })();
      };

      if (overdubEnabled && tracksRef.current.length > 0) {
        void startTracksFrom(punchInMs, Number.MAX_SAFE_INTEGER);
      } else if (metronomeEnabledRef.current) {
        startMetronomeLoop(ctx, 0, true);
      }

      recorder.start(100);
      setTransport("recording");
    },
    [ensureAudioContext, onNotice, onTrackCaptured, overdubEnabled, startMetronomeLoop, startTracksFrom],
  );

  const startRecording = useCallback(
    async (
      role: StudioTrackRole = tracksRef.current.length > 0 ? "overdub" : "voice",
      layerIndex = 0,
    ) => {
      if (transport === "recording" || transport === "counting-in") return;
      stopPlaybackSources();
      const stream = micStreamRef.current ?? (await armMicrophone());
      if (!stream) return;

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
            void beginLiveMediaRecorder(stream, punchInMs, role, layerIndex);
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

      await beginLiveMediaRecorder(stream, punchInMs, role, layerIndex);
    },
    [armMicrophone, beginLiveMediaRecorder, countInBars, ensureAudioContext, playheadMs, stopPlaybackSources, transport],
  );

  const pauseRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (!rec || transport !== "recording") return;
    if (rec.state === "recording") {
      rec.pause();
      recordAccumMsRef.current += performance.now() - recordStartPerfRef.current;
      recordStartPerfRef.current = 0;
      stopPlaybackSources();
      setTransport("paused");
    }
  }, [stopPlaybackSources, transport]);

  const resumeRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (!rec || transport !== "paused") return;
    if (rec.state === "paused") {
      rec.resume();
      recordStartPerfRef.current = performance.now();
      if (overdubEnabled && tracksRef.current.length > 0) {
        void startTracksFrom(
          recordPunchOffsetMsRef.current + recordAccumMsRef.current,
          Number.MAX_SAFE_INTEGER,
        );
      } else if (metronomeEnabledRef.current && audioCtxRef.current) {
        startMetronomeLoop(audioCtxRef.current, 0, true);
      }
      setTransport("recording");
    }
  }, [overdubEnabled, startMetronomeLoop, startTracksFrom, transport]);

  const stopRecording = useCallback(() => {
    window.clearTimeout(countInTimerRef.current);
    countInTimerRef.current = undefined;
    setCountInBeat(null);
    stopPlaybackSources();

    if (transport === "counting-in") {
      setTransport("idle");
      return;
    }

    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
    } else {
      setTransport("idle");
    }
  }, [stopPlaybackSources, transport]);

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
          gain: 0.9,
          pan: 0,
          muted: false,
          solo: false,
          peaks: computePeaksFromBuffer(decoded, 160),
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
      filename: `nexus-studio-mix-${Date.now()}.wav`,
    };
  }, [hydrateTrackBuffer, onNotice]);

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

  /** Lock-free 60fps telemetry sampler invoked inside `<ReactiveRecordBar />`'s canvas rAF loop. */
  const sampleTelemetry = useCallback((): LiveAudioTelemetry => {
    const out = telemetryRef.current;
    const analyser = analyserRef.current;

    if (transport === "recording" && recordStartPerfRef.current > 0) {
      out.recordingProgressMs =
        recordAccumMsRef.current + (performance.now() - recordStartPerfRef.current);
    } else if (transport === "paused") {
      out.recordingProgressMs = recordAccumMsRef.current;
    }

    if (!analyser || (!micReady && transport !== "playing")) {
      out.rms *= 0.84;
      out.peak *= 0.9;
      out.clipped = false;
      for (let i = 0; i < out.bands.length; i++) {
        out.bands[i] = out.bands[i]! * 0.84;
      }
      return out;
    }

    if (!freqBufferRef.current || freqBufferRef.current.length !== analyser.frequencyBinCount) {
      freqBufferRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      timeBufferRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    }

    const freq = freqBufferRef.current!;
    const time = timeBufferRef.current!;
    analyser.getByteFrequencyData(freq);
    analyser.getByteTimeDomainData(time);

    let sumSq = 0;
    let maxDev = 0;
    for (let i = 0; i < time.length; i++) {
      const sample = (time[i]! - 128) / 128;
      sumSq += sample * sample;
      const abs = Math.abs(sample);
      if (abs > maxDev) maxDev = abs;
    }
    const rms = Math.min(1, Math.sqrt(sumSq / time.length) * 2.25);
    out.rms = out.rms * 0.45 + rms * 0.55;
    out.peak = Math.max(maxDev, out.peak * 0.94);
    out.clipped = maxDev >= 0.97;

    const bandCount = out.bands.length;
    const usefulBins = Math.floor(freq.length * 0.72);
    for (let b = 0; b < bandCount; b++) {
      const binStart = Math.floor((b / bandCount) * usefulBins);
      const binEnd = Math.max(binStart + 1, Math.floor(((b + 1) / bandCount) * usefulBins));
      let acc = 0;
      for (let k = binStart; k < binEnd; k++) acc += freq[k]!;
      const norm = acc / ((binEnd - binStart) * 255);
      out.bands[b] = out.bands[b]! * 0.35 + norm * 0.65;
    }
    return out;
  }, [micReady, transport]);

  return {
    transport,
    playheadMs,
    devices,
    selectedDeviceId,
    setSelectedDeviceId: (id: string) => {
      setSelectedDeviceId(id);
      if (micReady) void armMicrophone(id, studioRawMic);
    },
    micReady,
    micError,
    monitorInput,
    setMonitorInput,
    studioRawMic,
    setStudioRawMic: (next: boolean) => {
      setStudioRawMic(next);
      if (micReady) void armMicrophone(selectedDeviceId, next);
    },
    inputGain,
    setInputGain,
    overdubEnabled,
    setOverdubEnabled,
    countInBeat,
    armMicrophone,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    play,
    pausePlayback,
    seek,
    importAudioFile,
    exportMixWav,
    removeCachedTrackAudio,
    sampleTelemetry,
    telemetryRef: telemetryRef as RefObject<LiveAudioTelemetry>,
  };
}
