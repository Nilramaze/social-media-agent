import { PipelineView } from "./pipeline-view";

export default function PipelinePage() {
  return (
    <div className="w-full max-w-5xl mx-auto px-8 py-10 space-y-2">
      <div className="space-y-2 mb-6">
        <span className="px-2 py-0.5 rounded-full bg-surface-card text-ink-muted text-mono-data uppercase tracking-widest border border-border-subtle">
          Live
        </span>
        <h1 className="font-serif italic text-headline-lg text-primary tracking-tight">Pipeline-Uebersicht</h1>
        <p className="text-body-md text-ink-muted">Aktualisiert sich automatisch alle 2 Sekunden.</p>
      </div>
      <PipelineView />
    </div>
  );
}
