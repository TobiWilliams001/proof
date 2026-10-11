/** The brand is the name itself: just "Proof", no mark. */
export function Logo({ size = 26 }: { size?: number; withWord?: boolean }) {
  return (
    <span style={{ fontWeight: 700, fontSize: size * 0.82, letterSpacing: '-0.04em', lineHeight: 1, color: 'var(--ink)' }}>
      Proof
    </span>
  );
}
