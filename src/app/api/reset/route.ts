import { readStore, resetStore, updateStore } from "@/lib/store";
import { activePortfolio } from "@/lib/portfolio";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** Clears the conversation, rules and paper book but keeps the brokerage connection and the chosen account. */
export async function POST() {
  await resetStore((before, s) => {
    s.snaptradeUser = before.snaptradeUser;
    s.selectedAccountId = before.selectedAccountId;
  });

  // With a brokerage linked, open on what Atlas can see instead of asking the user to connect one.
  try {
    const p = await activePortfolio();
    const seededFromReal = (await readStore()).paper?.seededFrom === "snaptrade";
    if (seededFromReal) {
      const account = p.accountName ? `your **${p.accountName}** account` : "your account";
      const count = `${p.holdings.length} holding${p.holdings.length === 1 ? "" : "s"}`;
      await updateStore((s) => {
        s.messages[0].title = "Your brokerage is connected";
        s.messages[0].text =
          `Hi, I'm Atlas. Through SnapTrade I can see ${account}: ${count} and ${usd(p.cash)} in cash, ${usd(p.total)} in total.\n\n` +
          "I watch that account, read public news, SEC filings and government notices about the companies you own, and tell you when something matters. " +
          "I never trade on my own. Anything that needs a decision shows up as a card with my recommendation, and you choose. You're in **paper mode**: every trade is simulated and no real money moves.\n\n" +
          'Try a **what-if** ("What if Tesla cuts prices again?") or **research** one of your stocks below.';
      });
    }
  } catch {
    // The default welcome message stays if the brokerage can't be read right now.
  }
  return Response.json({ ok: true });
}
