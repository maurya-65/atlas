import { readStore } from "@/lib/store";
import { activePortfolio, portfolioReadError } from "@/lib/portfolio";
import { listAccounts, snaptradeConfigured, snaptradeErrorText } from "@/lib/snaptrade";
import { LIVE_LIMITS, liveSpentToday } from "@/lib/trading";
import { dailyState } from "@/lib/daily";
import { atlasPassword } from "@/lib/auth";
import { ruleStatus } from "@/lib/rules";
import { threadsOf } from "@/lib/threads";
import type { Portfolio } from "@/lib/types";

export async function GET() {
  let accounts: { id: string; name: string; institution: string; isPaper: boolean }[] = [];
  let portfolioError: string | null = null;
  try {
    accounts = (await listAccounts()).map((a) => ({
      id: a.id,
      name: a.name ?? a.number,
      institution: a.institution_name,
      isPaper: a.is_paper,
    }));
  } catch (e) {
    portfolioError = snaptradeErrorText(e);
  }
  let portfolio: Portfolio | null = null;
  try {
    portfolio = await activePortfolio();
  } catch (e) {
    portfolioError = snaptradeErrorText(e);
  }
  portfolioError = portfolioReadError() ?? portfolioError;
  const s = await readStore();
  return Response.json({
    mode: s.mode,
    interests: s.interests,
    rules: s.rules,
    ruleStatus: ruleStatus(portfolio, s.rules),
    threads: threadsOf(s.messages),
    messages: s.messages,
    portfolio,
    portfolioError,
    snaptradeConfigured,
    connected: accounts.length > 0,
    accounts,
    selectedAccountId: s.selectedAccountId,
    limits: { ...LIVE_LIMITS, usedToday: await liveSpentToday() },
    lastScanAt: s.lastScanAt,
    memory: s.memory,
    daily: await dailyState(),
    passwordProtected: Boolean(atlasPassword()),
  });
}
