const HOURS = [42, 55, 68, 86, 78, 64, 50, 38];
const MAIL = [
  ["Studio", "Hold the room", "09:40"],
  ["GitHub", "Review requested", "08:12"],
  ["Northbound", "A receipt", "07:05"],
] as const;
const MARKS = new Set([4, 12, 18, 26]);
const EVENTS = [
  { at: "12%", time: "09:00", title: "Deep work" },
  { at: "34%", time: "11:30", title: "Review" },
  { at: "58%", time: "14:00", title: "Run" },
  { at: "80%", time: "18:00", title: "Clear" },
];

export function CommandScene() {
  return (
    <section className="scene" aria-labelledby="command-kicker">
      <h2 id="command-kicker" className="site-kicker">
        Command
      </h2>
      <p className="sr-only">Weather, mail, a calendar, and the day on one timeline.</p>
      <div className="vis-cockpit" aria-hidden="true">
        <div className="vis-weather">
          <p className="vis-kicker">Weather</p>
          <p className="vis-temp">18°</p>
          <p className="vis-meta">Clear · Toronto</p>
          <div className="vis-hours">
            {HOURS.map((height, index) => (
              <span key={14 + index} className={index === 3 ? "is-now" : undefined}>
                <i>
                  <em style={{ height: `${height}%` }} />
                </i>
                <b>{14 + index}</b>
              </span>
            ))}
          </div>
        </div>

        <div className="vis-mail">
          <p className="vis-kicker">Mail</p>
          <ul>
            {MAIL.map(([from, subject, time]) => (
              <li key={from}>
                <span>{from}</span>
                <span>{subject}</span>
                <time>{time}</time>
              </li>
            ))}
          </ul>
        </div>

        <div className="vis-cal">
          <p className="vis-kicker">Calendar</p>
          <p className="vis-month">November</p>
          <div className="vis-dow">
            {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
              <span key={`${day}${index}`}>{day}</span>
            ))}
          </div>
          <div className="vis-days">
            {Array.from({ length: 30 }, (_, index) => {
              const day = index + 1;
              return (
                <span key={day} className={day === 14 ? "is-today" : undefined}>
                  {day}
                  {MARKS.has(day) ? <i /> : null}
                </span>
              );
            })}
          </div>
        </div>

        <div className="vis-line">
          <p className="vis-kicker">Timeline</p>
          <div className="vis-track">
            <span className="vis-now" />
            {EVENTS.map((event) => (
              <span key={event.time} className="vis-event" style={{ left: event.at }}>
                <b>{event.time}</b>
                <i />
                <span>{event.title}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
