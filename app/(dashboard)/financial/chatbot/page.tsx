"use client";

import { useAuth } from "@/lib/auth-context";
import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { ChatbotRequests } from "@/components/ai/chatbot-requests";

/**
 * Billing enquiries the website assistant escalated.
 *
 * The assistant answers balances, banking details and statements by itself. What lands
 * here is what it is explicitly forbidden to decide: payment arrangements, disputed
 * charges, credits and cancellations. A "Verified" badge means the client passed the
 * one-time-code check, so the account attached to the request really is theirs.
 *
 * RouteGuard already gates /financial by module; the check below only decides whether
 * to paint anything while auth resolves.
 */
export default function FinancialChatbotPage() {
  const { can, isLoading } = useAuth();
  if (isLoading || !can("financial")) return null;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Financial"
        title="Chatbot requests"
        description="Billing questions the assistant is not allowed to decide — arrangements, disputes and credits."
      />
      <ChatbotRequests scope="financial" />
    </PageShell>
  );
}
