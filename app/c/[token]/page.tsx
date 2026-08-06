"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * What a client sees when they scan the QR on their card.
 *
 * Same page, two answers. A client enters the 6-digit PIN printed on the card
 * and gets their own account: what they pay, what they last paid, when the
 * next debit goes off, and which equipment is theirs. A technician enters
 * their staff code and gets the site instead — credentials, every device, and
 * the job cards from previous visits.
 */

interface Device {
  id: string;
  label: string;
  serialNumber?: string;
  pppoe?: string;
  wifiName?: string;
  wifiPassword?: string;
}

interface Billing {
  accountName: string;
  balance: number;
  balanceMeaning: string;
  balanceAsAt: string | null;
  balanceCaveat: string;
  monthlyPrice: number | null;
  package: string;
  billingStatus: string;
  debitOrderDay: number | null;
  paymentMethod: string;
  lastInvoice: {
    invoiceNumber: string;
    invoiceDate: string | null;
    totalIncl: number;
    status: string;
  } | null;
  nextInvoiceOn: string | null;
}

interface JobCard {
  id: string;
  cardNumber: string | null;
  jobTitle: string;
  submittedAt: string | null;
  technicianName: string;
  workDone: string;
  hoursOnSite: string;
}

interface PortalState {
  authenticated: boolean;
  accountName?: string;
  role?: "client" | "technician";
  devices?: Device[];
  billing?: Billing | null;
  jobCards?: JobCard[];
  account?: { billingStatus: string; package: string } | null;
}

const money = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(n);

const day = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleDateString("en-ZA", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "—";

export default function ClientPortalPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;

  const [state, setState] = useState<PortalState | null>(null);
  const [error, setError] = useState("");
  const [role, setRole] = useState<"client" | "technician" | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/c/${encodeURIComponent(token)}/portal`, {
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Not found");
      setState(body as PortalState);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this page");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitCode() {
    if (!token || !role) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/c/${encodeURIComponent(token)}/portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "authenticate", role, code }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Sign-in failed");
      setCode("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (!token) return;
    await fetch(`/api/c/${encodeURIComponent(token)}/portal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    setRole(null);
    await load();
  }

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-[#0b1220] text-white">
      <div className="mx-auto max-w-md space-y-4 p-4 py-10">
        <div className="text-center">
          <Image
            src="/megs-logo.png"
            alt="MEGS"
            width={200}
            height={72}
            className="mx-auto h-16 w-auto object-contain"
            priority
          />
        </div>
        {children}
      </div>
    </div>
  );

  if (error && !state) {
    return shell(
      <div className="text-center">
        <p className="text-lg font-semibold">Not found</p>
        <p className="mt-2 text-sm text-white/60">{error}</p>
        <Link href="/" className="mt-4 inline-block text-[#e05752] underline">
          Home
        </Link>
      </div>
    );
  }

  if (!state) {
    return shell(<p className="text-center text-sm text-white/60">Loading…</p>);
  }

  /* ---------------------------------------------------------- signed out */
  if (!state.authenticated) {
    return shell(
      <>
        <h1 className="text-center text-xl font-bold">{state.accountName}</h1>
        {!role ? (
          <Card className="border-white/10 bg-white/5 text-white">
            <CardHeader>
              <CardTitle className="text-base">Who is scanning?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full" onClick={() => setRole("client")}>
                I am the client
              </Button>
              <Button
                variant="outline"
                className="w-full border-white/20 bg-transparent text-white hover:bg-white/10"
                onClick={() => setRole("technician")}
              >
                I am a MEGS technician
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-white/10 bg-white/5 text-white">
            <CardHeader>
              <CardTitle className="text-base">
                {role === "client" ? "Your 6-digit PIN" : "Your staff code"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                maxLength={role === "client" ? 6 : 4}
                placeholder={role === "client" ? "••••••" : "••••"}
                className="border-white/20 bg-white/10 text-center text-2xl tracking-[0.4em] text-white"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitCode();
                }}
              />
              {error ? <p className="text-sm text-[#ff9b96]">{error}</p> : null}
              <Button
                className="w-full"
                disabled={busy || !code}
                onClick={() => void submitCode()}
              >
                {busy ? "Checking…" : "Continue"}
              </Button>
              <button
                className="w-full text-xs text-white/50 underline"
                onClick={() => {
                  setRole(null);
                  setCode("");
                  setError("");
                }}
              >
                Back
              </button>
              {role === "client" ? (
                <p className="text-center text-xs text-white/40">
                  The PIN is printed on the card this code came from. Lost it? Call the
                  office and we will issue a new one.
                </p>
              ) : null}
            </CardContent>
          </Card>
        )}
      </>
    );
  }

  /* ------------------------------------------------------------- client */
  if (state.role === "client") {
    const b = state.billing;
    return shell(
      <>
        <h1 className="text-center text-xl font-bold">{state.accountName}</h1>

        {b ? (
          <Card className="border-white/10 bg-white/5 text-white">
            <CardHeader>
              <CardTitle className="text-base">Your account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-white/60">Balance</span>
                <span className="font-semibold">{money(b.balance)}</span>
              </div>
              <p className="text-xs text-white/50">{b.balanceMeaning}.</p>
              <div className="flex justify-between">
                <span className="text-white/60">Monthly</span>
                <span>
                  {b.monthlyPrice == null ? (
                    <span className="text-white/50">Ask the office</span>
                  ) : (
                    money(b.monthlyPrice)
                  )}
                </span>
              </div>
              {b.package ? (
                <div className="flex justify-between">
                  <span className="text-white/60">Package</span>
                  <span className="text-right">{b.package}</span>
                </div>
              ) : null}
              <p className="border-t border-white/10 pt-2 text-xs text-white/40">
                {b.balanceCaveat}
                {b.balanceAsAt ? ` Last updated ${day(b.balanceAsAt)}.` : ""}
              </p>
            </CardContent>
          </Card>
        ) : null}

        {b ? (
          <Card className="border-white/10 bg-white/5 text-white">
            <CardHeader>
              <CardTitle className="text-base">Invoices</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {b.lastInvoice ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-white/60">Last invoice</span>
                    <span className="font-medium">{b.lastInvoice.invoiceNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">{day(b.lastInvoice.invoiceDate)}</span>
                    <span>{money(b.lastInvoice.totalIncl)}</span>
                  </div>
                </>
              ) : (
                <p className="text-white/60">No invoices on your account yet.</p>
              )}
              <div className="flex justify-between border-t border-white/10 pt-2">
                <span className="text-white/60">Next invoice</span>
                <span>{b.nextInvoiceOn ? day(b.nextInvoiceOn) : "—"}</span>
              </div>
              {b.debitOrderDay ? (
                <p className="text-xs text-white/40">
                  Your debit order runs on day {b.debitOrderDay} of each month.
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-white/10 bg-white/5 text-white">
          <CardHeader>
            <CardTitle className="text-base">Your equipment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {(state.devices ?? []).length === 0 ? (
              <p className="text-white/60">No equipment recorded on your account.</p>
            ) : (
              (state.devices ?? []).map((d) => (
                <p key={d.id} className="text-white/80">
                  {d.label}
                </p>
              ))
            )}
          </CardContent>
        </Card>

        <button className="w-full text-xs text-white/50 underline" onClick={() => void signOut()}>
          Sign out
        </button>
      </>
    );
  }

  /* --------------------------------------------------------- technician */
  return shell(
    <>
      <h1 className="text-center text-xl font-bold">{state.accountName}</h1>
      {state.account ? (
        <p className="text-center text-sm text-white/60">
          {state.account.package || "No package recorded"} · {state.account.billingStatus}
        </p>
      ) : null}

      <Card className="border-white/10 bg-white/5 text-white">
        <CardHeader>
          <CardTitle className="text-base">Equipment on site</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {(state.devices ?? []).length === 0 ? (
            <p className="text-white/60">Nothing recorded against this client.</p>
          ) : (
            (state.devices ?? []).map((d) => (
              <div key={d.id} className="border-b border-white/10 pb-2 last:border-0 last:pb-0">
                <p className="font-medium">{d.label}</p>
                {d.serialNumber ? (
                  <p className="text-xs text-white/50">SN {d.serialNumber}</p>
                ) : null}
                {d.pppoe ? <p className="text-xs text-white/70">PPPoE {d.pppoe}</p> : null}
                {d.wifiName ? (
                  <p className="text-xs text-white/70">
                    WiFi {d.wifiName}
                    {d.wifiPassword ? ` · ${d.wifiPassword}` : ""}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 text-white">
        <CardHeader>
          <CardTitle className="text-base">Previous job cards</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {(state.jobCards ?? []).length === 0 ? (
            <p className="text-white/60">No job cards submitted for this client yet.</p>
          ) : (
            (state.jobCards ?? []).map((c) => (
              <div key={c.id} className="border-b border-white/10 pb-2 last:border-0 last:pb-0">
                <p className="font-medium">
                  {c.cardNumber ? `${c.cardNumber} · ` : ""}
                  {c.jobTitle}
                </p>
                <p className="text-xs text-white/50">
                  {c.technicianName} · {day(c.submittedAt)}
                  {c.hoursOnSite ? ` · ${c.hoursOnSite}h on site` : ""}
                </p>
                {c.workDone ? (
                  <p className="mt-1 whitespace-pre-wrap text-xs text-white/70">{c.workDone}</p>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <button className="w-full text-xs text-white/50 underline" onClick={() => void signOut()}>
        Sign out
      </button>
    </>
  );
}
