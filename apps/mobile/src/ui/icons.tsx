import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import { colors } from "../theme";

/**
 * Shared stroke-icon set for the client portal (and reusable elsewhere).
 * 24x24 viewBox, rounded caps, single accent colour — kept deliberately simple
 * so it renders cleanly at tab-bar and inline sizes.
 */
export type IconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

function Base({
  size = 24,
  children,
}: {
  size?: number;
  children: React.ReactNode;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {children}
    </Svg>
  );
}

export function HomeIcon({ size, color = colors.text, strokeWidth = 1.8 }: IconProps) {
  return (
    <Base size={size}>
      <Path d="M4 11 12 4l8 7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M6 10v9h12v-9" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M10 19v-5h4v5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Base>
  );
}

export function WifiIcon({ size, color = colors.text, strokeWidth = 1.8 }: IconProps) {
  return (
    <Base size={size}>
      <Path d="M4 11a12 12 0 0 1 16 0" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M7.5 14.5a7 7 0 0 1 9 0" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Circle cx={12} cy={18} r={1.3} fill={color} />
    </Base>
  );
}

export function LifeBuoyIcon({ size, color = colors.text, strokeWidth = 1.8 }: IconProps) {
  return (
    <Base size={size}>
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={strokeWidth} />
      <Circle cx={12} cy={12} r={3.4} stroke={color} strokeWidth={strokeWidth} />
      <Line x1={12} y1={3} x2={12} y2={8.6} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1={12} y1={15.4} x2={12} y2={21} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1={3} y1={12} x2={8.6} y2={12} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1={15.4} y1={12} x2={21} y2={12} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Base>
  );
}

export function BoostIcon({ size, color = colors.text, strokeWidth = 1.8 }: IconProps) {
  return (
    <Base size={size}>
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M12 16.5V8" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M8.5 11.5 12 8l3.5 3.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Base>
  );
}

export function SignalIcon({ size, color = colors.text }: IconProps) {
  return (
    <Base size={size}>
      <Rect x={3} y={15} width={3} height={5} rx={1} fill={color} />
      <Rect x={8.5} y={11} width={3} height={9} rx={1} fill={color} />
      <Rect x={14} y={7} width={3} height={13} rx={1} fill={color} />
    </Base>
  );
}

export function RouterIcon({ size, color = colors.text, strokeWidth = 1.8 }: IconProps) {
  return (
    <Base size={size}>
      <Rect x={3} y={13} width={18} height={7} rx={2} stroke={color} strokeWidth={strokeWidth} />
      <Circle cx={7} cy={16.5} r={1.1} fill={color} />
      <Path d="M8 13V8M16 13V8" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M6.5 8a3 3 0 0 1 11 0" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" opacity={0.5} />
    </Base>
  );
}

export function ChevronRightIcon({ size, color = colors.mutedDark, strokeWidth = 1.8 }: IconProps) {
  return (
    <Base size={size}>
      <Path d="M9 6l6 6-6 6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Base>
  );
}

export function LogOutIcon({ size, color = colors.mutedDark, strokeWidth = 1.8 }: IconProps) {
  return (
    <Base size={size}>
      <Path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M16 8l4 4-4 4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M20 12H9" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Base>
  );
}

export function MessageIcon({ size, color = colors.text, strokeWidth = 1.8 }: IconProps) {
  return (
    <Base size={size}>
      <Path
        d="M5 5h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H10l-4 4v-4H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </Base>
  );
}

export function ShieldCheckIcon({ size = 14, color = colors.muted, strokeWidth = 1.6 }: IconProps) {
  return (
    <Base size={size}>
      <Path
        d="M12 2.5l7 2.5v5.5c0 4.6-3.1 7.4-7 9-3.9-1.6-7-4.4-7-9V5z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path d="M9 12l2 2 4-4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Base>
  );
}
