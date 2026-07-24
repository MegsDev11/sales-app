"use client";

import type { ReactNode } from "react";
import type { NetworkNodeKind } from "@/lib/wireless/layout-types";

type IconProps = {
  size?: number;
  className?: string;
};

/** Shared viewBox helpers for palette (HTML) and canvas (SVG) use. */
function SvgShell({
  size = 28,
  className,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function NetworkPointIcon({ size, className }: IconProps) {
  return (
    <SvgShell size={size} className={className}>
      <rect x="6" y="10" width="36" height="28" rx="4" fill="#EFF6FF" stroke="#2563EB" strokeWidth="2.5" />
      <text
        x="24"
        y="29"
        textAnchor="middle"
        fill="#1D4ED8"
        fontSize="14"
        fontWeight="800"
        fontFamily="system-ui,sans-serif"
      >
        NP
      </text>
    </SvgShell>
  );
}

export function ServerRackIcon({ size, className }: IconProps) {
  return (
    <SvgShell size={size} className={className}>
      <rect x="8" y="8" width="32" height="32" rx="3" fill="#1e293b" />
      <rect x="11" y="12" width="26" height="6" rx="1" fill="#334155" />
      <rect x="11" y="21" width="26" height="6" rx="1" fill="#334155" />
      <rect x="11" y="30" width="26" height="6" rx="1" fill="#334155" />
      {[14, 18, 22, 26, 30].map((x) => (
        <circle key={x} cx={x} cy="15" r="1.2" fill="#22c55e" />
      ))}
      {[14, 18, 22, 26, 30].map((x) => (
        <circle key={`b${x}`} cx={x} cy="24" r="1.2" fill="#38bdf8" />
      ))}
      {[14, 18, 22, 26, 30].map((x) => (
        <circle key={`c${x}`} cx={x} cy="33" r="1.2" fill="#a3e635" />
      ))}
    </SvgShell>
  );
}

export function SwitchIcon({ size, className }: IconProps) {
  return (
    <SvgShell size={size} className={className}>
      <rect x="6" y="14" width="36" height="20" rx="3" fill="#0f172a" />
      <rect x="9" y="18" width="30" height="12" rx="1.5" fill="#1e293b" />
      {Array.from({ length: 8 }).map((_, i) => (
        <rect
          key={i}
          x={11 + i * 3.4}
          y="20"
          width="2.4"
          height="8"
          rx="0.4"
          fill={i % 3 === 0 ? "#22c55e" : "#38bdf8"}
        />
      ))}
    </SvgShell>
  );
}

export function PtzCameraIcon({ size, className }: IconProps) {
  return (
    <SvgShell size={size} className={className}>
      <ellipse cx="24" cy="28" rx="14" ry="10" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5" />
      <circle cx="24" cy="24" r="11" fill="#f8fafc" stroke="#64748b" strokeWidth="1.5" />
      <circle cx="24" cy="24" r="7" fill="#0f172a" />
      <circle cx="24" cy="24" r="3.5" fill="#1e293b" stroke="#38bdf8" strokeWidth="1.2" />
      <circle cx="21.5" cy="21.5" r="1.2" fill="#e2e8f0" opacity="0.7" />
      <rect x="21" y="34" width="6" height="5" rx="1" fill="#334155" />
    </SvgShell>
  );
}

export function PrinterIcon({ size, className }: IconProps) {
  return (
    <SvgShell size={size} className={className}>
      <rect x="14" y="8" width="20" height="10" rx="1.5" fill="#1e293b" />
      <rect x="10" y="16" width="28" height="16" rx="2" fill="#0f172a" />
      <rect x="14" y="28" width="20" height="10" rx="1.5" fill="#334155" />
      <rect x="16" y="18" width="16" height="8" rx="1" fill="#e2e8f0" />
      <rect x="18" y="10" width="12" height="6" rx="0.5" fill="#f8fafc" />
      <circle cx="14" cy="22" r="1.2" fill="#22c55e" />
      <circle cx="18" cy="22" r="1.2" fill="#38bdf8" />
    </SvgShell>
  );
}

export function NecPhoneIcon({ size, className }: IconProps) {
  return (
    <SvgShell size={size} className={className}>
      <rect x="8" y="14" width="32" height="22" rx="3" fill="#0f172a" />
      <rect x="11" y="17" width="10" height="16" rx="2" fill="#1e293b" />
      <path
        d="M13 20c2-1.5 5-1.5 7 0v3c-2-1-5-1-7 0v-3z"
        fill="#64748b"
      />
      <rect x="24" y="17" width="13" height="7" rx="1" fill="#38bdf8" opacity="0.85" />
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => (
          <rect
            key={`${r}-${c}`}
            x={25 + c * 4}
            y={26 + r * 3.2}
            width="3"
            height="2.4"
            rx="0.4"
            fill="#475569"
          />
        ))
      )}
    </SvgShell>
  );
}

export function RuijieRouterIcon({ size, className }: IconProps) {
  return (
    <SvgShell size={size} className={className}>
      <rect x="8" y="18" width="32" height="16" rx="3" fill="#C83733" />
      <rect x="11" y="21" width="18" height="10" rx="1.5" fill="#9f2a27" />
      <circle cx="36" cy="26" r="2" fill="#fef2f2" />
      <path
        d="M18 18V12M24 18V10M30 18V12"
        stroke="#0f172a"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="18" cy="10" r="1.5" fill="#0f172a" />
      <circle cx="24" cy="8" r="1.5" fill="#0f172a" />
      <circle cx="30" cy="10" r="1.5" fill="#0f172a" />
    </SvgShell>
  );
}

export function LabelIcon({ size, className }: IconProps) {
  return (
    <SvgShell size={size} className={className}>
      <rect x="8" y="14" width="32" height="20" rx="3" fill="#f8fafc" stroke="#94a3b8" strokeWidth="2" />
      <path d="M14 24h20M14 20h12" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
    </SvgShell>
  );
}

export function DeviceKindIcon({
  kind,
  size = 28,
  className,
}: {
  kind: NetworkNodeKind;
  size?: number;
  className?: string;
}) {
  switch (kind) {
    case "network_point":
      return <NetworkPointIcon size={size} className={className} />;
    case "server_rack":
      return <ServerRackIcon size={size} className={className} />;
    case "switch":
      return <SwitchIcon size={size} className={className} />;
    case "ptz_camera":
      return <PtzCameraIcon size={size} className={className} />;
    case "printer":
      return <PrinterIcon size={size} className={className} />;
    case "nec_phone":
      return <NecPhoneIcon size={size} className={className} />;
    case "ruijie_router":
      return <RuijieRouterIcon size={size} className={className} />;
    case "label":
      return <LabelIcon size={size} className={className} />;
    default:
      return <NetworkPointIcon size={size} className={className} />;
  }
}
