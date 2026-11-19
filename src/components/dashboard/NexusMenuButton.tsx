import { memo, type RefObject } from "react";

/**
 * Flat 2D geometric three-blade Nexus menu trigger.
 * Pressing it smoothly rotates and spreads the three identical 120° vector blades apart.
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
        <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible" fill="none">
          <g className="nexus-svg-rotor" fill="var(--nexus-mark-fill, #d49a1a)">
            <g className="nexus-svg-blade nexus-svg-blade--top">
              <path d="M58.5 7.5 L85.5 23 L85.5 52 L58.5 52 Z" />
            </g>
            <g className="nexus-svg-blade nexus-svg-blade--bottom">
              <path d="M58.5 7.5 L85.5 23 L85.5 52 L58.5 52 Z" transform="rotate(120 50 52)" />
            </g>
            <g className="nexus-svg-blade nexus-svg-blade--left">
              <path d="M58.5 7.5 L85.5 23 L85.5 52 L58.5 52 Z" transform="rotate(240 50 52)" />
            </g>
          </g>
        </svg>
        {hasActivePanel && !open ? <span className="nexus-mark-dot" /> : null}
      </span>
    </button>
  );
});
