"use client";

import { useEffect, useRef, useState } from "react";
import {
  add,
  bezier,
  fitCanvas,
  observeCanvasActivity,
  polar,
  radialGlow,
  seededHelpers,
  type Vec,
} from "@/lib/network/geometry";
import { Badge } from "@/components/ui/badge";
import { WaitlistForm } from "./WaitlistForm";

export function LandingCTA() {
  const [selectedPlan, setSelectedPlan] = useState<"free" | "pro">("pro");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const { rnd, between, gauss } = seededHelpers(20261122);
    const rays = Array.from({ length: 76 }, (_, i) => ({
      angle: (i / 76) * Math.PI * 2 + gauss() * 0.04,
      reach: between(0.45, 1.15),
      bend: gauss() * 0.36,
      width: i % 4 === 0 ? 1.1 : 0.48,
      alpha: between(0.08, 0.32),
      speed: between(0.06, 0.18),
      phase: rnd() * Math.PI * 2,
    }));

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 1;
    let height = 1;
    let frame = 0;
    let last = 0;
    let elapsed = 0;
    let active = true;

    const draw = (time: number) => {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";

      const core: Vec = { x: width * 0.5, y: height * 0.42 };
      const S = Math.max(width * 0.5, height * 0.72);
      const breathe = 1 + 0.06 * Math.sin(time * 0.65);

      radialGlow(ctx, core, S * 0.65 * breathe, [
        [0, "rgba(255, 196, 98, 0.18)"],
        [0.38, "rgba(204, 118, 34, 0.06)"],
        [1, "rgba(0, 0, 0, 0)"],
      ]);

      for (const r of rays) {
        const sway = Math.sin(time * 0.25 + r.phase) * 0.06;
        const p0 = add(core, polar(S * r.reach, r.angle + sway));
        const c1 = add(core, polar(S * r.reach * 0.58, r.angle + r.bend + sway));
        const c2 = add(core, polar(S * 0.16, r.angle - r.bend * 0.5));

        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, core.x, core.y);
        ctx.lineWidth = r.width;
        ctx.strokeStyle = `rgba(240, 181, 74, ${r.alpha})`;
        ctx.stroke();

        if (!reduceMotion) {
          const u = (time * r.speed + r.phase) % 1;
          const pt = bezier(p0, c1, c2, core, u);
          ctx.fillStyle = "rgb(255, 238, 198)";
          ctx.globalAlpha = r.alpha * 2.1;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 1.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;
      radialGlow(ctx, core, S * 0.08 * breathe, [
        [0, "rgba(255, 252, 240, 0.95)"],
        [0.24, "rgba(255, 224, 160, 0.65)"],
        [0.58, "rgba(240, 181, 74, 0.18)"],
        [1, "rgba(0, 0, 0, 0)"],
      ]);
    };

    const resize = () => {
      const box = fitCanvas(canvas, ctx);
      width = box.width;
      height = box.height;
      if (reduceMotion) draw(3);
    };

    const loop = (now: number) => {
      if (!active || reduceMotion) {
        frame = 0;
        last = 0;
        return;
      }
      if (!last) last = now;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      elapsed += dt;
      draw(elapsed);
      frame = requestAnimationFrame(loop);
    };

    const stopVisibility = observeCanvasActivity(canvas, (isActive) => {
      active = isActive;
      if (isActive && !reduceMotion && frame === 0) {
        last = 0;
        frame = requestAnimationFrame(loop);
      } else if (!isActive && frame !== 0) {
        cancelAnimationFrame(frame);
        frame = 0;
        last = 0;
      }
    });

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    if (!reduceMotion && active && frame === 0) frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      stopVisibility();
      observer.disconnect();
    };
  }, []);

  return (
    <section id="waitlist" className="nx-cta-stage" aria-labelledby="cta-title">
      <div className="nx-canvas-layer" aria-hidden>
        <canvas ref={canvasRef} className="block h-full w-full" />
        <div className="nx-canvas-vignette" />
      </div>

      <div className="land-container relative z-10">
        <div className="mx-auto max-w-3xl text-center">
          <p className="site-kicker">The Room Is Open · Early Access</p>
          <h2 id="cta-title" className="landing-line mx-auto max-w-[18ch]">
            One environment for everything you build and live.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-[16px] leading-relaxed text-[color:var(--land-muted)]">
            Start free with full access to Network, Command, and two active Node sockets—or unlock unlimited sockets
            with Nexus Pro. Join the beta waitlist below.
          </p>

          <div className="mx-auto mt-8 max-w-md">
            <WaitlistForm />
          </div>
        </div>

        {/* Interactive Freemium Architecture Comparison Cards */}
        <div className="mx-auto mt-12 grid max-w-4xl grid-cols-1 gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setSelectedPlan("free")}
            className={`nx-pillar ${selectedPlan === "free" ? "nx-pillar--active" : ""}`}
          >
            <div className="nx-pillar-top">
              <span className="nx-pillar-num">Nexus Core · Free</span>
              <Badge variant="outline" className="border-white/15 px-2.5 font-mono text-[11px] font-normal text-[color:var(--land-ink)]">
                $0 Forever
              </Badge>
            </div>
            <h3 className="nx-pillar-heading">Full Network, Command &amp; 2 Active Node Sockets</h3>
            <p className="nx-pillar-body">
              Includes the conversational Network front page, bias-aware Research reader, full Command telemetry
              cockpit with deterministic cross-API automations, and 2 active Node sockets on the shared event bus.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setSelectedPlan("pro")}
            className={`nx-pillar ${selectedPlan === "pro" ? "nx-pillar--active" : ""}`}
          >
            <div className="nx-pillar-top">
              <span className="nx-pillar-num">Nexus Pro · Unlimited</span>
              <Badge className="border border-[rgba(240,181,74,0.45)] bg-[rgba(240,181,74,0.14)] px-2.5 font-mono text-[11px] font-normal text-[color:var(--land-gold-soft)]">
                All 5+ Orbital Sockets
              </Badge>
            </div>
            <h3 className="nx-pillar-heading">Unlimited Concurrent Nodes &amp; Third-Party SDK</h3>
            <p className="nx-pillar-body">
              Wire Studio, Study, Ledger, Canvas, and custom third-party extensions into the core simultaneously so
              every workspace collaborates in real time over the deterministic event bus.
            </p>
          </button>
        </div>
      </div>
    </section>
  );
}
