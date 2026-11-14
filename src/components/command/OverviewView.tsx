"use client";

import { useState, type CSSProperties } from "react";
import { COMMAND_WIDGETS, overviewAccepts, placeWidgets, widgetDef } from "@/lib/command/widgets";
import type { CommandController } from "./use-command";
import { GmailWidget } from "./widgets/GmailWidget";
import { CalendarWidget, CryptoWidget, F1Widget, GitHubWidget, SkyWidget, StravaWidget, TasksWidget, UptimeWidget, VercelWidget, WeatherWidget } from "./widgets/ServiceWidgets";

export function OverviewView({ command, onConnections }: { command: CommandController; onConnections: () => void }) {
  const ids = command.state?.overview ?? [];
  const placed = placeWidgets(ids);
  const [open, setOpen] = useState(false);
  const pageFull = COMMAND_WIDGETS.every((widget) => !overviewAccepts(ids, widget.id));

  function add(id: string) {
    if (!overviewAccepts(ids, id)) return;
    setOpen(false);
    void command.setOverview(placeWidgets([...ids, id]).map((widget) => widget.id));
  }

  function remove(id: string) {
    void command.setOverview(ids.filter((widget) => widget !== id));
  }

  return (
    <div className="cmd-overview-page">
      <div className="cmd-overview-tools">
        <button type="button" className="dash-button dash-button--gold h-8 px-3 text-[13px]" disabled={pageFull || command.pending === "overview"} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          Add widget
        </button>
        {open ? (
          <div className="cmd-picker" role="menu" aria-label="Widgets">
            {COMMAND_WIDGETS.map((widget) => {
              const accepted = overviewAccepts(ids, widget.id);
              return (
                <button key={widget.id} type="button" role="menuitem" disabled={!accepted} onClick={() => add(widget.id)}>
                  <span className="cmd-picker-name">{widget.name}</span>
                  <span className="cmd-picker-blurb">{accepted ? widget.blurb : ids.includes(widget.id) ? "Already on this page" : "This page is full"}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      {placed.length === 0 ? (
        <div className="cmd-overview-empty">
          <p className="text-[18px] font-medium text-[color:var(--land-ink)]">Your overview is empty.</p>
          <p className="max-w-sm text-[14px]">Add a widget for a service. They share this one page, and only as many as fit.</p>
        </div>
      ) : (
        <div className="cmd-board">
          {placed.map((widget) => (
            <WidgetSlot key={widget.id} id={widget.id} style={{ gridColumn: `${widget.x + 1} / span ${widget.w}`, gridRow: `${widget.y + 1} / span ${widget.h}` }} command={command} onRemove={() => remove(widget.id)} onConnections={onConnections} />
          ))}
        </div>
      )}
    </div>
  );
}

function WidgetSlot({ id, style, command, onRemove, onConnections }: { id: string; style: CSSProperties; command: CommandController; onRemove: () => void; onConnections: () => void }) {
  const props = { command, onRemove, onConnections, style };
  switch (id) {
    case "gmail":
      return <GmailWidget command={command} onRemove={onRemove} style={style} />;
    case "calendar":
      return <CalendarWidget {...props} />;
    case "weather":
      return <WeatherWidget onRemove={onRemove} style={style} />;
    case "tasks":
      return <TasksWidget {...props} />;
    case "crypto":
      return <CryptoWidget {...props} />;
    case "sky":
      return <SkyWidget {...props} />;
    case "f1":
      return <F1Widget {...props} />;
    case "uptime":
      return <UptimeWidget {...props} />;
    case "github":
      return <GitHubWidget {...props} />;
    case "strava":
      return <StravaWidget {...props} />;
    case "vercel":
      return <VercelWidget {...props} />;
    default:
      return widgetDef(id) ? null : null;
  }
}
