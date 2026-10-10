import { z } from "zod";
import { randomUUID } from "crypto";
import { updateStore } from "@/lib/store";
import { ruleText } from "@/lib/types";

const MAX_RULES = 20;

const NewRule = z.union([
  z.object({ kind: z.enum(["concentration", "drawdown", "idle_cash"]), threshold: z.number().gt(0).lte(100) }),
  z.object({
    kind: z.enum(["price_below", "price_above"]),
    threshold: z.number().gt(0).lte(1_000_000),
    ticker: z.string().trim().toUpperCase().regex(/^[A-Z.\-]{1,10}$/, "That doesn't look like a ticker symbol."),
  }),
]);

export async function POST(req: Request) {
  const body = await req.json();

  if (body.action === "add") {
    const parsed = NewRule.safeParse(body);
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "That rule isn't valid." }, { status: 400 });
    const rule = parsed.data;
    const ticker = "ticker" in rule ? rule.ticker : undefined;
    const full = await updateStore((s) => {
      if (s.rules.length >= MAX_RULES) return true;
      s.rules.push({
        id: randomUUID(),
        kind: rule.kind,
        text: ruleText(rule.kind, rule.threshold, ticker),
        threshold: rule.threshold,
        ticker,
        action: "flag",
        createdAt: new Date().toISOString(),
      });
      return false;
    });
    if (full) return Response.json({ error: `You can have up to ${MAX_RULES} rules. Remove one first.` }, { status: 400 });
    return Response.json({ ok: true });
  }

  if (body.action === "delete" && typeof body.id === "string") {
    await updateStore((s) => {
      s.rules = s.rules.filter((r) => r.id !== body.id);
    });
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Unsupported rule action." }, { status: 400 });
}
