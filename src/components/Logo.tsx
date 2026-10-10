export function Logo({ size = 26, withWord = true }: { size?: number; withWord?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <rect width="64" height="64" rx="16" fill="var(--ink)" />
        <path
          d="M22 46V18h11.5a9 9 0 0 1 0 18H22"
          fill="none"
          stroke="var(--bg)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="44" cy="46" r="3.5" fill="var(--accent)" />
      </svg>
      {withWord && (
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: size * 0.95, letterSpacing: '-0.02em', lineHeight: 1 }}>
          Proof
        </span>
      )}
    </span>
  );
}
