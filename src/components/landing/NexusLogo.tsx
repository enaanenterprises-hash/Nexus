import type { RefObject } from "react";
import Image from "next/image";
import mark from "@/assets/brand/nexus-mark.png";
import wordmark from "@/assets/brand/nexus-wordmark.png";

// Served untouched so the metallic gradients are never re-encoded; the sources are 4x+ their display size.

/** Gold three-shard mark used across the app chrome. */
export function NexusMark({ className = "" }: { className?: string }) {
  return <Image src={mark} alt="Nexus" unoptimized draggable={false} className={`select-none ${className}`} />;
}

/**
 * Interactive Nexus logo button for the Network view: splits nexus-mark.png into
 * its three exact shard layers so pressing it spins and fans the blades apart.
 */
export function NexusMenuButton({
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
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls={controlsId}
      aria-label={open ? "Close navigation menu" : "Open navigation menu"}
      title={open ? "Close menu" : "Menu"}
      className={`nexus-mark-button ${open ? "nexus-mark-button--open" : ""}`}
    >
      <span className="nexus-mark-stage dash-brand-mark" aria-hidden>
        <span className="nexus-mark-rotor">
          <span className="nexus-mark-blade nexus-mark-blade--top">
            <Image src={mark} alt="" unoptimized draggable={false} className="nexus-mark-img" />
          </span>
          <span className="nexus-mark-blade nexus-mark-blade--left">
            <Image src={mark} alt="" unoptimized draggable={false} className="nexus-mark-img" />
          </span>
          <span className="nexus-mark-blade nexus-mark-blade--bottom">
            <Image src={mark} alt="" unoptimized draggable={false} className="nexus-mark-img" />
          </span>
        </span>
        {hasActivePanel && !open ? <span className="nexus-mark-dot" /> : null}
      </span>
    </button>
  );
}

/** Chrome NEXUS wordmark for the public site. */
export function NexusWordmark({ className = "", preload = true }: { className?: string; preload?: boolean }) {
  return <Image src={wordmark} alt="Nexus" unoptimized preload={preload} draggable={false} className={`select-none ${className}`} />;
}
