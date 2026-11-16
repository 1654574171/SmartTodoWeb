interface Props {
  size?: number;
  className?: string;
}

export default function BrandLogo({ size = 18, className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="smarttodo-brand" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0071e3" style={{ stopColor: 'var(--accent)' }} />
          <stop offset="100%" stopColor="#5e5ce6" style={{ stopColor: 'color-mix(in srgb, var(--accent) 55%, #5e5ce6)' }} />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="32" height="32" rx="9" fill="url(#smarttodo-brand)" />
      <rect x="6" y="15" width="2" height="5" rx="1" fill="#fff" />
      <rect x="10" y="10" width="12" height="2" rx="1" fill="#fff" />
      <rect x="10" y="16" width="15" height="2" rx="1" fill="#fff" />
      <rect x="10" y="22" width="9" height="2" rx="1" fill="#fff" />
    </svg>
  );
}
