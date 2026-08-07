"use client";

import { useAuth } from "@/lib/auth-context";
import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { ChatbotRequests } from "@/components/ai/chatbot-requests";

/**
 * New-business enquiries the website assistant took.
 *
 * Distinct from the contact form, which creates a lead directly: these are people who
 * asked the assistant something it could not answer — coverage at an address it has no
 * data for, pricing, a package comparison — and left a number. The conversation is
 * attached, so the call back starts from what they actually asked.
 */
export default function SalesChatbotPage() {
  const { can, isLoading } = useAuth();
  if (isLoading || !can("crm")) return null;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Sales"
        title="Chatbot requests"
        description="Enquiries the website assistant took but could not close, with the conversation attached."
      />
      <ChatbotRequests scope="sales" />
    </PageShell>
  );
}
