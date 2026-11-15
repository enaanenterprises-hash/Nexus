"use client";

import { useEffect, useState } from "react";

export function CommandLivePreview() {
  const [eqHeights, setEqHeights] = useState([45, 80, 60, 95, 30, 70, 85, 40]);

  // Animate the Spotify equalizer bars in real time
  useEffect(() => {
    const interval = setInterval(() => {
      setEqHeights(Array.from({ length: 8 }, () => Math.floor(Math.random() * 75) + 25));
    }, 450);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="vis-preview-wrap" aria-label="Command Center Live Cockpit">
      <div className="vis-window">
        {/* Window Chrome Header */}
        <div className="vis-window-bar">
          <div className="vis-dots">
            <span className="vis-dot vis-dot--red" />
            <span className="vis-dot vis-dot--yellow" />
            <span className="vis-dot vis-dot--green" />
          </div>
          <div className="vis-window-title">
            <span className="vis-pulse-gold" />
            <span>Nexus Command · Central Telemetry &amp; API Ingestion</span>
          </div>
          <div className="vis-window-tag">7 Services Connected · Syncing 15s</div>
        </div>

        {/* Command Center Grid Viewport */}
        <div className="vis-cockpit-grid">
          {/* Card 1: Weather & Sky Telemetry */}
          <div className="vis-card">
            <div className="vis-card-header">
              <span className="vis-card-kicker">Weather &amp; Celestial</span>
              <span className="vis-pill-tag">Open-Meteo · Keyless</span>
            </div>
            <div className="vis-weather-body">
              <div className="vis-temp-row">
                <span className="vis-huge-temp">18°</span>
                <div className="vis-temp-meta">
                  <strong>Clear Skies</strong>
                  <span>Toronto, Canada</span>
                  <span className="vis-faint-text">Wind: 9 km/h · Humidity: 54%</span>
                </div>
              </div>
              <div className="vis-hourly-bars">
                {[40, 52, 68, 92, 85, 70, 55, 42].map((val, idx) => (
                  <div key={idx} className={`vis-hour-col ${idx === 3 ? "vis-hour-col--now" : ""}`}>
                    <div className="vis-bar-track">
                      <div className="vis-bar-fill" style={{ height: `${val}%` }} />
                    </div>
                    <span>{12 + idx}:00</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Card 2: Mail & Smart Receipt Parser */}
          <div className="vis-card">
            <div className="vis-card-header">
              <span className="vis-card-kicker">Mail &amp; Receipts</span>
              <span className="vis-pill-tag">Gmail Integration</span>
            </div>
            <div className="vis-mail-stream">
              <div className="vis-mail-row vis-mail-row--highlight">
                <div className="vis-mail-sender">
                  <span className="vis-avatar">AWS</span>
                  <div>
                    <strong>AWS Cloud Services</strong>
                    <span className="vis-mail-subject">Invoice #INV-290192 &middot; November Cloud</span>
                  </div>
                </div>
                <div className="vis-receipt-badge">
                  <span className="vis-amount">$42.10 USD</span>
                  <span className="vis-subbadge">Auto-routed to Ledger</span>
                </div>
              </div>

              <div className="vis-mail-row">
                <div className="vis-mail-sender">
                  <span className="vis-avatar">GH</span>
                  <div>
                    <strong>GitHub Review</strong>
                    <span className="vis-mail-subject">Review requested: &quot;Core Event Bus (#14)&quot;</span>
                  </div>
                </div>
                <span className="vis-pill-status">Action Required</span>
              </div>

              <div className="vis-mail-row">
                <div className="vis-mail-sender">
                  <span className="vis-avatar">UPS</span>
                  <div>
                    <strong>UPS Tracking</strong>
                    <span className="vis-mail-subject">Audio Interface parcel delivered</span>
                  </div>
                </div>
                <span className="vis-pill-status vis-pill-status--green">Delivered 14:10</span>
              </div>
            </div>
          </div>

          {/* Card 3: 24h Chronological Timeline */}
          <div className="vis-card vis-card--wide">
            <div className="vis-card-header">
              <span className="vis-card-kicker">Chronological Timeline</span>
              <span className="vis-pill-tag">Google Calendar &middot; Tasks</span>
            </div>
            <div className="vis-timeline-track">
              {/* Pulsing NOW Indicator */}
              <div className="vis-now-marker" style={{ left: "44%" }}>
                <span className="vis-now-pill">NOW 14:32</span>
                <span className="vis-now-line" />
              </div>

              <div className="vis-timeline-events">
                <div className="vis-event-block vis-event-block--past" style={{ left: "8%", width: "22%" }}>
                  <span className="vis-event-time">09:30 - 10:30</span>
                  <strong className="vis-event-name">Team Sprint Standup</strong>
                  <span className="vis-event-sub">Google Meet</span>
                </div>

                <div className="vis-event-block vis-event-block--active" style={{ left: "36%", width: "28%" }}>
                  <span className="vis-event-time">14:00 - 15:30</span>
                  <strong className="vis-event-name">Deep Work: Event Bus Engine</strong>
                  <span className="vis-event-sub">Spotify Focus Active &middot; Slack Muted</span>
                </div>

                <div className="vis-event-block" style={{ left: "70%", width: "20%" }}>
                  <span className="vis-event-time">17:30 - 18:15</span>
                  <strong className="vis-event-name">Evening Run</strong>
                  <span className="vis-event-sub">Strava 5.2 km target</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: Live Telemetry Feeds */}
          <div className="vis-card vis-card--wide">
            <div className="vis-card-header">
              <span className="vis-card-kicker">Live Service Streams</span>
              <span className="vis-pill-tag">Automated Feeds</span>
            </div>
            <div className="vis-streams-row">
              {/* Spotify Player */}
              <div className="vis-stream-box">
                <div className="vis-spotify-left">
                  <div className="vis-album-art">🎵</div>
                  <div>
                    <strong className="vis-song-title">Solaris (Ambient Focus)</strong>
                    <span className="vis-song-artist">Brian Eno · Spotify</span>
                  </div>
                </div>
                {/* Real-time jumping equalizer */}
                <div className="vis-equalizer">
                  {eqHeights.map((h, i) => (
                    <span key={i} style={{ height: `${h}%` }} />
                  ))}
                </div>
              </div>

              {/* Strava Telemetry */}
              <div className="vis-stream-box">
                <div className="vis-strava-content">
                  <span className="vis-strava-icon">🏃</span>
                  <div>
                    <strong>5.24 km Trail Run</strong>
                    <span className="vis-faint-text">Pace: 4:38 /km &middot; Heart: 158 bpm</span>
                  </div>
                </div>
                <span className="vis-stat-number">24m 18s</span>
              </div>

              {/* Vercel Deployment */}
              <div className="vis-stream-box">
                <div className="vis-vercel-content">
                  <span className="vis-vercel-icon">▲</span>
                  <div>
                    <strong>Production Deployment</strong>
                    <span className="vis-faint-text">Edge Network · 31 Routes Prerendered</span>
                  </div>
                </div>
                <span className="vis-badge-ready">Ready</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
