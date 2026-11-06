import * as React from 'react';
import { encode } from 'uqr';

/**
 * The otpauth:// URL as a QR code, drawn client-side (no network, no image service: the secret
 * never leaves the page). Rendered as SVG rectangles, so no HTML injection is involved.
 */
export function OtpQr({ value, size = 184 }: { value: string; size?: number }) {
  const path = React.useMemo(() => {
    const { data } = encode(value, { ecc: 'M', border: 2 });
    let d = '';
    data.forEach((row, y) =>
      row.forEach((on, x) => {
        if (on) d += `M${x} ${y}h1v1h-1z`;
      }),
    );
    return { d, n: data.length };
  }, [value]);
  return (
    <svg
      role="img"
      aria-label="QR code for your authenticator app"
      viewBox={`0 0 ${path.n} ${path.n}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className="rounded-md border bg-white"
    >
      <rect width={path.n} height={path.n} fill="#fff" />
      <path d={path.d} fill="#000" />
    </svg>
  );
}
