import { useMemo } from "react";
import { Text, View } from "react-native";

export type LayoutCanvasNode = {
  id: string;
  kind: string;
  x: number;
  y: number;
  label: string;
};

export type LayoutCanvasEdge = {
  id: string;
  from: string;
  to: string;
};

export type LayoutCanvasDoc = {
  nodes?: LayoutCanvasNode[];
  edges?: LayoutCanvasEdge[];
};

export type LayoutDeviceRow = {
  id: string;
  nodeId: string;
  label: string;
  status: string;
};

export function NetworkLayoutDiagram({
  canvas,
  devices,
  width,
}: {
  canvas: LayoutCanvasDoc;
  devices: LayoutDeviceRow[];
  width: number;
}) {
  // `canvas.nodes ?? []` built a brand-new array on every render whenever the
  // layout had no nodes yet, so the bounds memo below re-ran every time — for a
  // list it had already measured. Pinning the fallback keeps the identity stable.
  const nodes = useMemo(() => canvas.nodes ?? [], [canvas.nodes]);
  const edges = useMemo(() => canvas.edges ?? [], [canvas.edges]);
  const statusByNode = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of devices) map.set(d.nodeId, d.status);
    return map;
  }, [devices]);

  const bounds = useMemo(() => {
    if (!nodes.length) return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x);
      maxY = Math.max(maxY, n.y);
    }
    if (minX === maxX) {
      minX -= 40;
      maxX += 40;
    }
    if (minY === maxY) {
      minY -= 40;
      maxY += 40;
    }
    const pad = 24;
    return {
      minX: minX - pad,
      minY: minY - pad,
      maxX: maxX + pad,
      maxY: maxY + pad,
    };
  }, [nodes]);

  const diagramWidth = Math.max(280, width - 48);
  const spanX = bounds.maxX - bounds.minX || 1;
  const spanY = bounds.maxY - bounds.minY || 1;
  const scale = Math.min(diagramWidth / spanX, 220 / spanY);
  const diagramHeight = Math.max(160, spanY * scale);

  function mapPoint(x: number, y: number) {
    return {
      left: (x - bounds.minX) * scale,
      top: (y - bounds.minY) * scale,
    };
  }

  return (
    <View
      style={{
        width: diagramWidth,
        height: diagramHeight,
        backgroundColor: "#F1F5F9",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      {edges.map((e) => {
        const from = nodes.find((n) => n.id === e.from);
        const to = nodes.find((n) => n.id === e.to);
        if (!from || !to) return null;
        const a = mapPoint(from.x, from.y);
        const b = mapPoint(to.x, to.y);
        const dx = b.left - a.left;
        const dy = b.top - a.top;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        return (
          <View
            key={e.id}
            style={{
              position: "absolute",
              left: a.left + 18,
              top: a.top + 18,
              width: length,
              height: 2,
              backgroundColor: "#94A3B8",
              transform: [{ rotate: `${angle}deg` }],
              transformOrigin: "left center",
            }}
          />
        );
      })}
      {nodes.map((n) => {
        const p = mapPoint(n.x, n.y);
        const status = statusByNode.get(n.id);
        const bg =
          status === "online"
            ? "#DCFCE7"
            : status === "offline"
              ? "#FEE2E2"
              : "#E2E8F0";
        return (
          <View
            key={n.id}
            style={{
              position: "absolute",
              left: p.left,
              top: p.top,
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: bg,
              borderWidth: 1,
              borderColor: "#CBD5E1",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              numberOfLines={1}
              style={{ fontSize: 8, fontWeight: "700", maxWidth: 32, textAlign: "center" }}
            >
              {(n.label || n.kind).slice(0, 6)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
