"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, Send, ShieldCheck, X } from "lucide-react";

/**
 * The support assistant, as a launcher and panel on the marketing pages.
 *
 * It renders nothing at all when the server reports the assistant is unconfigured, so
 * a missing ANTHROPIC_API_KEY shows visitors a normal site rather than a button that
 * apologises when pressed.
 */

interface ChatMessage {
  role: "user" | "assistant";
  body: string;
}

interface ChatReply {
  sessionId?: string;
  reply?: string;
  verified?: boolean;
  escalated?: boolean;
  error?: string;
}

const GREETING =
  "Hi — I'm the MEGS assistant. I can check whether there's an outage in your area, " +
  "walk through a connection problem with you, or give you our banking details. " +
  "For anything on your own account I'll need to confirm it's yours first.\n\n" +
  "What's going on?";

const SUGGESTIONS = [
  "Is there an outage in my area?",
  "My internet is down",
  "What are your banking details?",
];

export function SupportChat() {
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", body: GREETING },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [verified, setVerified] = useState(false);

  const sessionId = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/chat", { cache: "no-store" })
      .then((res) => res.json())
      .then((body: { available?: boolean; greeting?: string | null }) => {
        if (cancelled) return;
        setAvailable(Boolean(body.available));
        // Owner-editable in AI Agents; blank keeps the built-in opening line.
        if (body.greeting) {
          setMessages([{ role: "assistant", body: body.greeting }]);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Pin to the newest message as the conversation grows.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Escape closes the panel, as it does for every other dialog on the site.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setMessages((prev) => [...prev, { role: "user", body: trimmed }]);
    setInput("");
    setSending(true);
    setError("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, sessionId: sessionId.current }),
      });
      const body = (await res.json()) as ChatReply;
      if (!res.ok) throw new Error(body.error ?? "Something went wrong");

      if (body.sessionId) sessionId.current = body.sessionId;
      if (body.verified) setVerified(true);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", body: body.reply ?? "Sorry — I didn't catch that." },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter breaks the line — what people expect from a chat box.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(input);
    }
  }

  if (!available) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open support chat"
          className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#C83733] text-white shadow-lg shadow-black/30 transition hover:bg-[#b02f2b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C83733]/50 focus-visible:ring-offset-2 sm:h-auto sm:w-auto sm:gap-2 sm:px-5 sm:py-3"
        >
          <MessageCircle className="h-6 w-6 sm:h-5 sm:w-5" aria-hidden />
          <span className="hidden text-sm font-semibold sm:inline">Need help?</span>
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="MEGS support assistant"
          className="fixed inset-0 z-50 flex flex-col bg-[#0b1220] text-white sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[min(38rem,calc(100vh-3rem))] sm:w-[26rem] sm:rounded-2xl sm:border sm:border-white/10 sm:shadow-2xl sm:shadow-black/50"
        >
          <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">MEGS assistant</p>
              <p className="truncate text-xs text-slate-400">
                Outages, connection problems and accounts
              </p>
            </div>
            <div className="flex items-center gap-2">
              {verified && (
                <span
                  className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-300"
                  title="Your identity has been confirmed for this conversation"
                >
                  <ShieldCheck className="h-3 w-3" aria-hidden />
                  Verified
                </span>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close support chat"
                className="rounded-md p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </header>

          <div
            ref={scrollRef}
            role="log"
            aria-live="polite"
            aria-atomic="false"
            className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
          >
            {messages.map((m, i) => (
              <div
                key={i}
                className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-[#C83733] px-3.5 py-2.5 text-sm leading-relaxed"
                      : "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-white/[0.07] px-3.5 py-2.5 text-sm leading-relaxed text-slate-100"
                  }
                >
                  {m.body}
                </div>
              </div>
            ))}

            {messages.length === 1 && !sending && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-slate-300 transition hover:border-[#C83733]/60 hover:text-white"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {sending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-white/[0.07] px-3.5 py-2.5 text-sm text-slate-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Checking…
                </div>
              </div>
            )}

            {error && (
              <p role="alert" className="text-xs text-red-400">
                {error}
              </p>
            )}
          </div>

          <div className="border-t border-white/10 p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                maxLength={2000}
                placeholder="Type your message…"
                aria-label="Message"
                className="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus-visible:border-[#C83733]/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C83733]/25"
              />
              <button
                type="button"
                onClick={() => void send(input)}
                disabled={sending || !input.trim()}
                aria-label="Send message"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#C83733] text-white transition hover:bg-[#b02f2b] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-slate-500">
              An AI assistant. It will never ask for your password or card details.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
