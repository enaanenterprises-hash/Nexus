"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Monitor, Mic, MicOff, Square, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function CinemaCaptureModal({
  open,
  onOpenChange,
  theme,
  onCaptured,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: "dark" | "light";
  onCaptured: (blob: Blob, name: string, alsoSendAudioToStudio: boolean) => Promise<void>;
}) {
  const [sourceKind, setSourceKind] = useState<"camera" | "screen">("camera");
  const [withMic, setWithMic] = useState(true);
  const [alsoStudio, setAlsoStudio] = useState(true);
  const [recording, setRecording] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | undefined>(undefined);

  function stopStream() {
    window.clearInterval(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop();
      } catch {
        // Ignore
      }
    }
    recorderRef.current = null;
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  function handleDialogOpenChange(next: boolean) {
    if (recording && !next) return;
    if (!next) {
      stopStream();
      setRecording(false);
      setCountdown(null);
      setElapsedSec(0);
      setError(null);
    }
    onOpenChange(next);
  }

  useEffect(() => {
    if (!open) stopStream();
  }, [open]);

  useEffect(() => () => stopStream(), []);

  async function prepareStream(): Promise<MediaStream | null> {
    setError(null);
    stopStream();
    try {
      let stream: MediaStream;
      if (sourceKind === "screen") {
        const display = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 30 },
          audio: true,
        });
        if (withMic && display.getAudioTracks().length === 0) {
          try {
            const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
            for (const t of mic.getAudioTracks()) display.addTrack(t);
          } catch {
            // Proceed cleanly with screen video only if mic permission unavailable
          }
        }
        stream = display;
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: 30 },
          audio: withMic,
        });
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      return stream;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Camera or screen permission denied.");
      return null;
    }
  }

  async function startCapture() {
    const stream = streamRef.current ?? (await prepareStream());
    if (!stream) return;

    setCountdown(3);
    for (let n = 3; n >= 1; n--) {
      setCountdown(n);
      await new Promise((r) => setTimeout(r, 850));
    }
    setCountdown(null);

    const mime =
      ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"].find(
        (m) => MediaRecorder.isTypeSupported(m),
      ) || "video/webm";

    chunksRef.current = [];
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
    recorderRef.current = rec;
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime });
      const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const label = `${sourceKind === "screen" ? "Screen" : "Camera"} ${stamp}`;
      stopStream();
      setRecording(false);
      if (blob.size > 0) {
        void onCaptured(blob, label, alsoStudio && withMic).then(() => handleDialogOpenChange(false));
      }
    };

    rec.start(250);
    setRecording(true);
    setElapsedSec(0);
    const startMs = Date.now();
    timerRef.current = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startMs) / 1000));
    }, 250);
  }

  function finishCapture() {
    window.clearInterval(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        data-theme={theme}
        className="setup-card max-w-[640px] rounded-[22px] border border-border p-6"
      >
        <DialogHeader className="text-left">
          <DialogTitle className="text-[1.15rem] font-medium tracking-[-0.015em]">
            Capture Camera or Screen
          </DialogTitle>
          <DialogDescription className="text-[12.5px] text-muted-foreground">
            Record directly onto your Cinema timeline, with optional automatic voice stem sync into Recording Studio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-full border border-border/80 bg-muted/35 p-0.5">
              <button
                type="button"
                disabled={recording}
                onClick={() => setSourceKind("camera")}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                  sourceKind === "camera"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Camera className="size-3.5" strokeWidth={1.6} />
                <span>Camera</span>
              </button>
              <button
                type="button"
                disabled={recording}
                onClick={() => setSourceKind("screen")}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                  sourceKind === "screen"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Monitor className="size-3.5" strokeWidth={1.6} />
                <span>Screen</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={withMic ? "secondary" : "outline"}
                disabled={recording}
                onClick={() => setWithMic((v) => !v)}
                className="h-8 gap-1.5 rounded-full text-[12px]"
              >
                {withMic ? <Mic className="size-3.5" /> : <MicOff className="size-3.5" />}
                <span>{withMic ? "Mic on" : "Mic muted"}</span>
              </Button>

              <Button
                type="button"
                size="sm"
                variant={alsoStudio ? "secondary" : "outline"}
                disabled={recording || !withMic}
                onClick={() => setAlsoStudio((v) => !v)}
                className="h-8 gap-1.5 rounded-full text-[12px]"
              >
                <Waves className="size-3.5 text-[color:var(--cinema-studio-link)]" />
                <span>Sync audio to Studio</span>
              </Button>
            </div>
          </div>

          <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-border/80 bg-[#08080a]">
            <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
            {countdown !== null ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/55 font-mono text-6xl font-light text-white tabular-nums backdrop-blur-sm">
                {countdown}
              </div>
            ) : null}
            {recording ? (
              <div className="cinema-glass-bar absolute top-3 left-3 flex items-center gap-2 rounded-full px-3 py-1 font-mono text-[12px] text-foreground tabular-nums">
                <span className="size-2 rounded-full bg-[color:var(--cinema-playhead)]" />
                <span>
                  {String(Math.floor(elapsedSec / 60)).padStart(2, "0")}:
                  {String(elapsedSec % 60).padStart(2, "0")}
                </span>
              </div>
            ) : null}
          </div>

          {error ? (
            <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={recording}
              onClick={() => void prepareStream()}
              className="rounded-full text-[12.5px]"
            >
              Preview feed
            </Button>

            {recording ? (
              <Button
                type="button"
                variant="destructive"
                onClick={finishCapture}
                className="h-10 gap-2 rounded-full px-5 text-[13px] font-medium"
              >
                <Square className="size-3.5 fill-current" />
                <span>Stop &amp; Add to Timeline</span>
              </Button>
            ) : (
              <Button
                type="button"
                disabled={countdown !== null}
                onClick={() => void startCapture()}
                className="h-10 gap-2 rounded-full bg-foreground px-5 text-[13px] font-medium text-background hover:opacity-90"
              >
                <span className="size-2.5 rounded-full bg-[color:var(--cinema-playhead)]" />
                <span>Start Recording</span>
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
