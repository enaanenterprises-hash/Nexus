"use client";

import { memo, useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useTheme } from "@/lib/theme";
import CrystalizedBall, { type CrystalizedBallMorphBox } from "./CrystalizedBall";

interface OrbStageGeometry {
  orbCenter: [number, number];
  morphBox: CrystalizedBallMorphBox;
  stageHeight: number;
}

const DEFAULT_GEOMETRY: OrbStageGeometry = {
  orbCenter: [46, 40],
  morphBox: { x: 9, y: 70, width: 74, height: 356, radius: 22 },
  stageHeight: 560,
};

/**
 * Interactive WebGL <CrystalizedBall /> orb menu trigger.
 * When pressed, the active dashboard surface blurs and darkens while the orb's
 * particles stream downward to form the rounded frame of `#nexus-network-menu`.
 */
export const NexusMenuButton = memo(function NexusMenuButton({
  open,
  hasActivePanel = false,
  controlsId,
  buttonRef,
  onClick,
}: {
  open: boolean;
  hasActivePanel?: boolean;
  controlsId: string;
  buttonRef?: RefObject<HTMLButtonElement | null>;
  onClick: () => void;
}) {
  const { theme } = useTheme();
  const localBtnRef = useRef<HTMLButtonElement | null>(null);
  const stageRef = useRef<HTMLSpanElement | null>(null);
  const [geometry, setGeometry] = useState<OrbStageGeometry>(DEFAULT_GEOMETRY);

  const setBtnRefs = useCallback(
    (node: HTMLButtonElement | null) => {
      localBtnRef.current = node;
      if (buttonRef) {
        buttonRef.current = node;
      }
    },
    [buttonRef],
  );

  const measureGeometry = useCallback(() => {
    const btnEl = localBtnRef.current;
    const stageEl = stageRef.current;
    if (!btnEl || !stageEl) return;

    const btnRect = btnEl.getBoundingClientRect();
    const stageRect = stageEl.getBoundingClientRect();
    const orbCenter: [number, number] = [
      btnRect.left - stageRect.left + btnRect.width * 0.5,
      btnRect.top - stageRect.top + btnRect.height * 0.5,
    ];

    const menuEl = document.getElementById(controlsId);
    if (!menuEl) {
      setGeometry((prev) => ({ ...prev, orbCenter }));
      return;
    }

    const parentEl = (menuEl.offsetParent as HTMLElement | null) ?? document.body;
    const parentRect = parentEl.getBoundingClientRect();
    const boxX = parentRect.left + menuEl.offsetLeft - stageRect.left;
    const boxY = parentRect.top + menuEl.offsetTop - stageRect.top;
    const boxWidth = menuEl.offsetWidth || 74;
    const boxHeight = menuEl.offsetHeight || 356;
    const neededHeight = Math.max(540, Math.ceil(boxY + boxHeight + 36));

    setGeometry((prev) => {
      const sameCenter =
        Math.abs(prev.orbCenter[0] - orbCenter[0]) < 0.5 &&
        Math.abs(prev.orbCenter[1] - orbCenter[1]) < 0.5;
      const sameBox =
        Math.abs(prev.morphBox.x - boxX) < 0.5 &&
        Math.abs(prev.morphBox.y - boxY) < 0.5 &&
        Math.abs(prev.morphBox.width - boxWidth) < 0.5 &&
        Math.abs(prev.morphBox.height - boxHeight) < 0.5 &&
        prev.stageHeight === neededHeight;
      if (sameCenter && sameBox) return prev;
      return {
        orbCenter,
        morphBox: {
          x: boxX,
          y: boxY,
          width: boxWidth,
          height: boxHeight,
          radius: 22,
        },
        stageHeight: neededHeight,
      };
    });
  }, [controlsId]);

  useEffect(() => {
    measureGeometry();
    const menuEl = document.getElementById(controlsId);
    const btnEl = localBtnRef.current;
    const ro = new ResizeObserver(() => measureGeometry());
    if (btnEl) ro.observe(btnEl);
    if (menuEl) ro.observe(menuEl);
    window.addEventListener("resize", measureGeometry);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measureGeometry);
    };
  }, [controlsId, measureGeometry, open]);

  return (
    <button
      ref={setBtnRefs}
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls={controlsId}
      aria-label={open ? "Close navigation menu" : "Open navigation menu"}
      title={open ? "Close menu" : "Menu"}
      className={`nexus-mark-button ${open ? "nexus-mark-button--open" : ""}`}
    >
      <span
        ref={stageRef}
        className="nexus-orb-canvas-stage"
        style={{ height: `${geometry.stageHeight}px` }}
        aria-hidden
      >
        <CrystalizedBall
          preset="ember"
          color="#F0B54A"
          theme={theme}
          orbCenter={geometry.orbCenter}
          orbRadius={17.5}
          morphOpen={open}
          morphBox={geometry.morphBox}
          crackle={0.9}
          fill={0.42}
          interactive
          hoverStrength={0.75}
          strands={5}
          flares={0.8}
          glow={1}
          sparks={0.8}
          particleCount={12000}
          motion="drift"
          particleShape="round"
          depth={0.7}
          sway={0.35}
          twinkle={0.7}
          haze={0.9}
          dustSpeed={1.5}
        />
      </span>
      <span className="nexus-mark-stage dash-brand-mark" aria-hidden>
        {hasActivePanel && !open ? <span className="nexus-mark-dot" /> : null}
      </span>
    </button>
  );
});
