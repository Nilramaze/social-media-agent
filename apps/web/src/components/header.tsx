export function Header() {
  return (
    <header className="fixed top-0 left-64 right-0 h-16 bg-surface/85 backdrop-blur-xl border-b border-border-subtle z-40 px-8 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="font-serif italic text-title-md text-primary">Social Media Agent</span>
        <span className="text-border-subtle">/</span>
        <span className="font-sans text-mono-data text-ink-muted">Autonome Content-Pipeline</span>
      </div>
    </header>
  );
}
