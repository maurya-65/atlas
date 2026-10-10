"use client";

import { useMemo } from "react";
import type { GraphEdge, GraphNode } from "@/lib/types";

export const NODE_TYPES: Record<GraphNode["type"], { label: string; color: string }> = {
  company: { label: "Company", color: "#f5f5f5" },
  financials: { label: "Financials", color: "#d4d4d4" },
  event: { label: "News event", color: "#a3a3a3" },
  regulation: { label: "Regulation / government", color: "#bdbdbd" },
  labor: { label: "Labor / strikes", color: "#8a8a8a" },
  sector: { label: "Sector", color: "#c7c7c7" },
  person: { label: "Person", color: "#9a9a9a" },
  source: { label: "Source", color: "#737373" },
  scenario: { label: "Scenario", color: "#f5f5f5" },
  channel: { label: "Way it spreads", color: "#b0b0b0" },
  holding: { label: "Your stock", color: "#e5e5e5" },
};

// A pinboard, not a floating web: every item is a card in a column, and columns read left to right from
// the company (or the what-if scenario) outwards. Lines are drawn behind the cards and only run through
// the gaps between columns, so nothing ever crosses a name. How two items are linked is written on the
// card itself instead of on the line.

const CARD_W = 176;
const CARD_H = 46;
const GAP_X = 84;
const GAP_Y = 10;
const PAD = 12;
const MAX_COLS = 5;
/** Room on the right of a column for lines between two cards of that same column */
const LOOP = 30;

interface Placed extends GraphNode {
  col: number;
  x: number;
  y: number;
  /** How this card is linked to the column before it, in the model's words */
  relation: string;
}

function shorten(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

function layoutBoard(nodes: GraphNode[], edges: GraphEdge[]) {
  const ids = new Set(nodes.map((n) => n.id));
  const links = edges.filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target);
  const near = new Map<string, { id: string; label: string }[]>(nodes.map((n) => [n.id, []]));
  for (const e of links) {
    near.get(e.source)!.push({ id: e.target, label: e.label });
    near.get(e.target)!.push({ id: e.source, label: e.label });
  }

  // The board starts from the scenario or the company; everything else is placed by how many steps away it is.
  const root =
    nodes.find((n) => n.type === "scenario") ??
    nodes.find((n) => n.type === "company") ??
    [...nodes].sort((a, b) => near.get(b.id)!.length - near.get(a.id)!.length)[0];
  const colOf = new Map<string, number>([[root.id, 0]]);
  let frontier = [root.id];
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const nb of near.get(id)!) {
        if (colOf.has(nb.id)) continue;
        colOf.set(nb.id, Math.min(colOf.get(id)! + 1, MAX_COLS - 1));
        next.push(nb.id);
      }
    }
    frontier = next;
  }
  // Items not linked to anything on the board go in a last column of their own.
  const lastLinked = Math.max(...colOf.values());
  for (const n of nodes) if (!colOf.has(n.id)) colOf.set(n.id, Math.min(lastLinked + 1, MAX_COLS - 1));

  const colCount = Math.max(...colOf.values()) + 1;
  const columns: GraphNode[][] = Array.from({ length: colCount }, () => []);
  for (const n of nodes) columns[colOf.get(n.id)!].push(n);

  // Order each column by where its neighbours sit in the column before, so lines cross as little as possible.
  const row = new Map<string, number>();
  columns[0].forEach((n, i) => row.set(n.id, i));
  for (let c = 1; c < colCount; c++) {
    const weight = (n: GraphNode) => {
      const rows = near
        .get(n.id)!
        .filter((nb) => colOf.get(nb.id) === c - 1)
        .map((nb) => row.get(nb.id) ?? 0);
      return rows.length ? rows.reduce((a, b) => a + b, 0) / rows.length : Number.MAX_SAFE_INTEGER;
    };
    const weights = new Map(columns[c].map((n) => [n.id, weight(n)]));
    columns[c].sort((a, b) => weights.get(a.id)! - weights.get(b.id)! || a.type.localeCompare(b.type));
    columns[c].forEach((n, i) => row.set(n.id, i));
  }

  const sameColumnLinks = links.some((e) => colOf.get(e.source) === colOf.get(e.target));
  const tallest = Math.max(...columns.map((c) => c.length));
  const width = PAD * 2 + colCount * CARD_W + (colCount - 1) * GAP_X + (sameColumnLinks ? LOOP : 0);
  const height = PAD * 2 + tallest * CARD_H + (tallest - 1) * GAP_Y;

  const placed = new Map<string, Placed>();
  columns.forEach((column, c) => {
    const top = (height - (column.length * CARD_H + (column.length - 1) * GAP_Y)) / 2;
    column.forEach((n, i) => {
      const before = near.get(n.id)!.filter((nb) => colOf.get(nb.id) === c - 1 && nb.label);
      const relation = before.length ? before[0].label + (before.length > 1 ? ` +${before.length - 1} more` : "") : (NODE_TYPES[n.type] ?? NODE_TYPES.source).label;
      placed.set(n.id, { ...n, col: c, x: PAD + c * (CARD_W + GAP_X), y: top + i * (CARD_H + GAP_Y), relation });
    });
  });
  return { placed, links, width, height, rootId: root.id };
}

/** A line between two cards: an S-curve across the gap, or a loop on the right for two cards in one column. */
function linePath(a: Placed, b: Placed) {
  const [left, right] = a.col <= b.col ? [a, b] : [b, a];
  const y1 = left.y + CARD_H / 2;
  const y2 = right.y + CARD_H / 2;
  if (left.col === right.col) {
    const x = left.x + CARD_W;
    return `M ${x} ${y1} C ${x + LOOP} ${y1}, ${x + LOOP} ${y2}, ${x} ${y2}`;
  }
  const x1 = left.x + CARD_W;
  const x2 = right.x;
  const mid = (x2 - x1) / 2;
  return `M ${x1} ${y1} C ${x1 + mid} ${y1}, ${x2 - mid} ${y2}, ${x2} ${y2}`;
}

export default function Graph({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const board = useMemo(() => (nodes.length ? layoutBoard(nodes, edges) : null), [nodes, edges]);
  if (!board) return null;

  const usedTypes = Array.from(new Set(nodes.map((n) => n.type)));
  const cards = [...board.placed.values()];

  return (
    <figure className="rounded-xl border border-white/[0.08] bg-black/30 p-2">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${board.width} ${board.height}`}
          className="mx-auto block h-auto w-full"
          style={{ minWidth: Math.min(board.width, 560), maxWidth: board.width }}
          role="img"
          aria-label={`Connection board with ${nodes.length} items: ${nodes.map((n) => n.label).join(", ")}`}
        >
          {board.links.map((l, i) => {
            const a = board.placed.get(l.source)!;
            const b = board.placed.get(l.target)!;
            const outer = a.col >= b.col ? a : b;
            return (
              <path
                key={i}
                d={linePath(a, b)}
                fill="none"
                stroke={(NODE_TYPES[outer.type] ?? NODE_TYPES.source).color}
                strokeOpacity={0.45}
                strokeWidth={1.5}
              >
                <title>{`${a.label} → ${b.label}${l.label ? `: ${l.label}` : ""}`}</title>
              </path>
            );
          })}
          {cards.map((n) => {
            const meta = NODE_TYPES[n.type] ?? NODE_TYPES.source;
            const isRoot = n.id === board.rootId;
            return (
              <g key={n.id}>
                <title>{`${n.label} (${meta.label})${n.relation !== meta.label ? `: ${n.relation}` : ""}`}</title>
                <rect
                  x={n.x}
                  y={n.y}
                  width={CARD_W}
                  height={CARD_H}
                  rx={10}
                  fill="var(--card)"
                  stroke={isRoot || n.type === "holding" ? meta.color : "var(--border)"}
                  strokeWidth={isRoot ? 1.75 : 1}
                  strokeDasharray={n.type === "holding" && !isRoot ? "4 3" : undefined}
                />
                <rect x={n.x + 8} y={n.y + 10} width={3} height={CARD_H - 20} rx={1.5} fill={meta.color} />
                <text x={n.x + 20} y={n.y + 19} fontSize={11.5} fontWeight={600} fill="var(--foreground)">
                  {shorten(n.label, 24)}
                </text>
                <text x={n.x + 20} y={n.y + 34} fontSize={9.5} fill="var(--muted-foreground)">
                  {shorten(n.relation, 30)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="px-2 pb-1 pt-2 text-xs text-muted-foreground">
        <p>Read left to right. The small line under each name says how it is linked to the column before it.</p>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
          {usedTypes.map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: (NODE_TYPES[t] ?? NODE_TYPES.source).color }}
              />
              {(NODE_TYPES[t] ?? NODE_TYPES.source).label}
            </span>
          ))}
        </div>
      </figcaption>
    </figure>
  );
}
