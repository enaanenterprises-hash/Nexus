import { memo, type RefObject } from "react";
import Image from "next/image";
import mark from "@/assets/brand/nexus-mark.png";

/**
 * Merged top-left menu button for the Network view: splits nexus-mark.png into
 * its three exact shard layers so pressing it smoothly spins and spreads the blades apart.
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
});
