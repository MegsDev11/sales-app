"use client";

import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { ChatbotRequests } from "@/components/ai/chatbot-requests";

/**
 * Connectivity and general enquiries the website assistant handed over.
 *
 * Most arrive after hours, already troubleshooted: the summary says what the client
 * tried and what was ruled out, and the conversation is one click away. The point is
 * that nobody has to ask "have you rebooted it?" for the third time.
 */
export default function SupportChatbotPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Support"
        title="Chatbot requests"
        description="Connectivity and general enquiries the website assistant could not resolve on its own."
      />
      <ChatbotRequests scope="support" />
    </PageShell>
  );
}
