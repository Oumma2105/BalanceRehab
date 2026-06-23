export function BalanceLogo({ size = 40, className = "" }) {
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="BalanceRehab"
    >
      {/* Hemispherical pivot */}
      <path d="M 11 27 A 9 7 0 0 1 29 27 Z" fill="#577590" />
      {/* Balance board platform, tilted ~17° upward to right */}
      <rect
        x="9" y="21" width="22" height="5" rx="2.5"
        fill="#43AA8B"
        transform="rotate(-17 20 23.5)"
      />
      {/* Single elegant motion arc above */}
      <path
        d="M 5 24 Q 20 7 35 16"
        fill="none"
        stroke="#43AA8B"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
