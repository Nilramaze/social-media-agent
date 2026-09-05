export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className}>
      <rect width="40" height="40" rx="8" fill="#18181b" />
      <circle cx="20" cy="20" r="7" stroke="#fafafa" strokeWidth="2" />
      <circle cx="20" cy="12" r="2" fill="#2e7d32" />
      <circle cx="27" cy="24" r="2" fill="#4a6cf7" />
      <circle cx="13" cy="24" r="2" fill="#b58237" />
      <line x1="20" y1="14" x2="20" y2="18" stroke="#fafafa" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="15" y1="23" x2="18" y2="21" stroke="#fafafa" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="25" y1="23" x2="22" y2="21" stroke="#fafafa" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
