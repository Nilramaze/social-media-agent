import { CalendarView } from "./calendar-view";

export default function CalendarPage() {
  return (
    <div className="w-full max-w-6xl mx-auto px-8 py-10 space-y-2">
      <div className="space-y-2 mb-6">
        <span className="px-2 py-0.5 rounded-full bg-surface-card text-ink-muted text-mono-data uppercase tracking-widest border border-border-subtle">
          Planung
        </span>
        <h1 className="font-serif italic text-headline-lg text-primary tracking-tight">Kalender</h1>
        <p className="text-body-md text-ink-muted">
          Fertige Inhalte werden automatisch eingeplant. Termine per Drag &amp; Drop verschieben, Freigabe passiert weiterhin in der Review-Queue.
        </p>
      </div>
      <CalendarView />
    </div>
  );
}
