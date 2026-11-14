const WIDE_SOURCE = "M 120 300 C 280 300, 380 270, 500 250 C 660 224, 760 190, 860 200";
const WIDE_NOTE = "M 560 90 C 540 150, 520 200, 500 250 C 420 360, 240 360, 120 300";
const NARROW_SOURCE = "M 98 328 C 124 318, 152 262, 180 236 C 208 262, 236 318, 262 328";
const NARROW_NOTE = "M 180 98 C 180 146, 180 188, 180 228 C 148 286, 112 318, 98 328";

export function NetworkScene() {
  return (
    <section className="scene" aria-labelledby="network-kicker">
      <h2 id="network-kicker" className="site-kicker">
        Network
      </h2>
      <p className="sr-only">A source travels from Research through the core to Command. A note travels back.</p>
      <div className="scene-stage">
        <svg className="vis-svg vis-wide" viewBox="0 0 1000 420" role="presentation">
          <CoreGlow id="coreGlowWide" />
          <Filaments path={WIDE_SOURCE} ghosts={["M 120 318 C 286 324, 386 292, 500 268 C 654 238, 756 206, 860 216", "M 120 282 C 274 276, 374 248, 500 232 C 666 210, 764 174, 860 184"]} />
          <Filaments path={WIDE_NOTE} ghosts={["M 548 102 C 528 158, 512 208, 492 258 C 412 372, 232 372, 112 312"]} />
          <Core x={500} y={250} glow="coreGlowWide" />
          <Node x={120} y={300} name="Research" />
          <Node x={560} y={90} name="Note" />
          <Node x={860} y={200} name="Command" />
          <Packet path={WIDE_SOURCE} label="source" dur="9s" still={[270, 291]} />
          <Packet path={WIDE_NOTE} label="note" dur="11s" begin="-3.5s" still={[533, 166]} />
        </svg>
        <svg className="vis-svg vis-narrow" viewBox="0 0 360 500" role="presentation">
          <CoreGlow id="coreGlowNarrow" />
          <Filaments path={NARROW_SOURCE} ghosts={["M 98 344 C 126 334, 154 278, 180 252 C 206 278, 234 334, 262 344"]} />
          <Filaments path={NARROW_NOTE} ghosts={["M 196 98 C 196 146, 196 188, 196 228 C 164 286, 126 318, 112 328"]} />
          <Core x={180} y={236} glow="coreGlowNarrow" r={58} />
          <Node x={72} y={340} name="Research" r={22} />
          <Node x={180} y={70} name="Note" r={22} />
          <Node x={288} y={340} name="Command" r={22} />
          <Packet path={NARROW_SOURCE} label="source" dur="9s" still={[138, 286]} compact />
          <Packet path={NARROW_NOTE} label="note" dur="11s" begin="-3.5s" still={[180, 168]} compact />
        </svg>
      </div>
    </section>
  );
}

function CoreGlow({ id }: { id: string }) {
  return (
    <defs>
      <radialGradient id={id} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="rgb(240, 181, 74)" stopOpacity="0.55" />
        <stop offset="45%" stopColor="rgb(240, 181, 74)" stopOpacity="0.12" />
        <stop offset="100%" stopColor="rgb(240, 181, 74)" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

function Filaments({ path, ghosts = [] }: { path: string; ghosts?: string[] }) {
  return (
    <g fill="none" strokeLinecap="round">
      {ghosts.map((d) => (
        <path key={d} d={d} stroke="rgba(240, 181, 74, 0.18)" strokeWidth="1.2" />
      ))}
      <path d={path} stroke="rgba(255, 217, 154, 0.85)" strokeWidth="1.35" />
    </g>
  );
}

function Core({ x, y, glow, r = 78 }: { x: number; y: number; glow: string; r?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={`url(#${glow})`} />
      <circle cx={x} cy={y} r={r * 0.46} fill="none" stroke="rgba(240, 181, 74, 0.32)" />
      <circle cx={x} cy={y} r={r * 0.15} fill="#f0b54a" />
      <circle cx={x} cy={y} r={r * 0.06} fill="#fff6e4" />
    </g>
  );
}

function Node({ x, y, name, r = 26 }: { x: number; y: number; name: string; r?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="#070605" stroke="rgba(240, 181, 74, 0.72)" strokeWidth="1.25" />
      <circle cx={x} cy={y} r="3.2" fill="#f0b54a" />
      <text x={x} y={y + r + 22} textAnchor="middle" fill="#f5f5f7" fontSize="15">
        {name}
      </text>
    </g>
  );
}

function Packet({
  path,
  label,
  dur,
  begin = "0s",
  still,
  compact = false,
}: {
  path: string;
  label: string;
  dur: string;
  begin?: string;
  still: [number, number];
  compact?: boolean;
}) {
  return (
    <>
      <g className="vis-run">
        <animateMotion dur={dur} begin={begin} repeatCount="indefinite" path={path} />
        <PacketBody label={label} compact={compact} />
      </g>
      <g className="vis-still" transform={`translate(${still[0]} ${still[1]})`}>
        <PacketBody label={label} compact={compact} />
      </g>
    </>
  );
}

function PacketBody({ label, compact }: { label: string; compact: boolean }) {
  const width = compact ? 58 : 72;
  const height = compact ? 24 : 28;
  return (
    <>
      <rect x={-width / 2} y={-height / 2} width={width} height={height} rx={height / 2} fill="#120e09" stroke="#f0b54a" strokeWidth="1" />
      <text textAnchor="middle" y={compact ? 3.5 : 4} fill="#ffd99a" fontSize={compact ? 11 : 12}>
        {label}
      </text>
    </>
  );
}
