"use client";

import type { CSSProperties, ReactNode } from "react";

export function WidgetFrame({ title, hint, onRemove, style, children }: { title: string; hint?: string; onRemove: () => void; style: CSSProperties; children: ReactNode }) {
  return (
    <section className="cmd-widget" style={style}>
      <header className="cmd-widget-bar">
        <h3>{title}</h3>
        {hint ? <span className="cmd-widget-hint">{hint}</span> : null}
        <button type="button" className="cmd-widget-remove" onClick={onRemove} aria-label={`Remove ${title}`}>
          ×
        </button>
      </header>
      <div className="cmd-widget-body">{children}</div>
    </section>
  );
}
