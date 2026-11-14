const SOCKETS = [
  { name: "Command", x: 50, y: 18, live: true },
  { name: "Research", x: 80.4, y: 40.1, live: true },
  { name: "", x: 68.8, y: 75.9, live: false },
  { name: "", x: 31.2, y: 75.9, live: false },
  { name: "", x: 19.6, y: 40.1, live: false },
] as const;

export function SocketScene() {
  return (
    <section className="scene" aria-labelledby="nodes-kicker">
      <h2 id="nodes-kicker" className="site-kicker">
        Nodes
      </h2>
      <p className="sr-only">Pieces travel from the sockets into the core.</p>
      <div className="vis-orbit">
        <svg className="vis-svg" viewBox="0 0 100 100" role="presentation">
          <defs>
            <radialGradient id="socketGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgb(240, 181, 74)" stopOpacity="0.5" />
              <stop offset="55%" stopColor="rgb(240, 181, 74)" stopOpacity="0.08" />
              <stop offset="100%" stopColor="rgb(240, 181, 74)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="32" fill="none" stroke="rgba(240, 181, 74, 0.16)" />
          {SOCKETS.map((socket) => (
            <line
              key={`${socket.x}-${socket.y}`}
              x1={socket.x}
              y1={socket.y}
              x2="50"
              y2="50"
              stroke={socket.live ? "rgba(255, 217, 154, 0.75)" : "rgba(240, 181, 74, 0.28)"}
              strokeWidth={socket.live ? 0.45 : 0.3}
              strokeDasharray={socket.live ? undefined : "1.2 1.1"}
            />
          ))}
          <circle cx="50" cy="50" r="16" fill="url(#socketGlow)" />
          <circle cx="50" cy="50" r="7.2" fill="none" stroke="rgba(240, 181, 74, 0.4)" />
          <circle cx="50" cy="50" r="2.4" fill="#f0b54a" />
          {SOCKETS.map((socket) => (
            <g key={`ring-${socket.x}`}>
              <circle
                cx={socket.x}
                cy={socket.y}
                r="6.4"
                fill="#070605"
                stroke={socket.live ? "rgba(240, 181, 74, 0.85)" : "rgba(255, 255, 255, 0.22)"}
                strokeWidth="0.45"
                strokeDasharray={socket.live ? undefined : "1.1 0.9"}
              />
              {socket.live ? <circle cx={socket.x} cy={socket.y} r="1.15" fill="#f0b54a" /> : null}
            </g>
          ))}
          {SOCKETS.map((socket, index) => {
            const path = `M ${socket.x} ${socket.y} L 50 50`;
            const stillX = socket.x + (50 - socket.x) * 0.62;
            const stillY = socket.y + (50 - socket.y) * 0.62;
            return (
              <g key={`piece-${socket.x}`}>
                <g className="vis-run">
                  <animateMotion dur="7.5s" begin={`${-index * 1.5}s`} repeatCount="indefinite" path={path} />
                  <Piece />
                </g>
                <g className="vis-still" transform={`translate(${stillX} ${stillY})`}>
                  <Piece />
                </g>
              </g>
            );
          })}
        </svg>
        {SOCKETS.map((socket) =>
          socket.name ? (
            <span key={socket.name} className="vis-orbit-label" style={{ left: `${socket.x}%`, top: `${socket.y + 9}%` }}>
              {socket.name}
            </span>
          ) : null,
        )}
      </div>
    </section>
  );
}

function Piece() {
  return <rect x="-1.7" y="-1.7" width="3.4" height="3.4" rx="0.5" fill="#ffd99a" />;
}
