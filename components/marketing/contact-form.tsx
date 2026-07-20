"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Loader2 } from "lucide-react";

export function ContactForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [contactPref, setContactPref] = useState("phone");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");

    const form = e.currentTarget;
    const data = new FormData(form);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: data.get("firstName"),
          lastName: data.get("lastName"),
          phone: data.get("phone"),
          email: data.get("email"),
          address: data.get("address"),
          contactPreference: contactPref,
          message: data.get("message"),
        }),
      });

      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Something went wrong");

      setStatus("success");
      form.reset();
      setContactPref("phone");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Failed to submit");
    }
  }

  return (
    <section id="contact" className="py-20">
      <div className="mx-auto max-w-6xl px-4 lg:px-6">
        <div className="grid items-stretch gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="relative min-h-[280px] overflow-hidden rounded-2xl shadow-lg sm:min-h-[360px] lg:min-h-0">
            <Image
              src="/contact/megs-truck.jpg"
              alt="MEGS service vehicle in the field"
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>

          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Request a Quote</CardTitle>
            </CardHeader>
            <CardContent>
              {status === "success" ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <CheckCircle className="h-12 w-12 text-green-600" />
                  <p className="mt-4 font-semibold">Thanks for submitting!</p>
                  <p className="mt-2 text-sm text-muted-foreground">Our sales team will contact you soon.</p>
                  <Button variant="outline" className="mt-4" onClick={() => setStatus("idle")}>
                    Send another message
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label htmlFor="firstName" className="text-sm font-medium">First Name *</label>
                      <Input id="firstName" name="firstName" required />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="lastName" className="text-sm font-medium">Last Name *</label>
                      <Input id="lastName" name="lastName" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="phone" className="text-sm font-medium">Phone</label>
                    <Input id="phone" name="phone" type="tel" />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-medium">Email</label>
                    <Input id="email" name="email" type="email" />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="address" className="text-sm font-medium">Address</label>
                    <Input id="address" name="address" />
                  </div>
                  <div className="space-y-2">
                    <span className="text-sm font-medium">How should we contact you?</span>
                    <Select value={contactPref} onValueChange={(v) => { if (typeof v === "string") setContactPref(v); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="phone">Phone</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="message" className="text-sm font-medium">Message *</label>
                    <Textarea id="message" name="message" rows={4} required placeholder="Tell us about your connectivity needs..." />
                  </div>
                  {status === "error" && (
                    <p className="text-sm text-red-600">{errorMsg}</p>
                  )}
                  <Button type="submit" className="w-full bg-[#C83733] hover:bg-[#a82f2b]" disabled={status === "loading"}>
                    {status === "loading" ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</>
                    ) : (
                      "Send Message"
                    )}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mt-12 lg:mt-16">
          <h2 className="text-3xl font-bold text-gray-900">Contact us for more information</h2>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Fill in the form and our team will get back to you. You can also reach us directly:
          </p>
          <dl className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="font-semibold text-gray-900">Phone</dt>
              <dd><a href="tel:0878205290" className="text-[#C83733] hover:underline">087 820 5290</a></dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-900">Sales</dt>
              <dd><a href="mailto:sales@megswb.co.za" className="text-[#C83733] hover:underline">sales@megswb.co.za</a></dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-900">Support</dt>
              <dd><a href="mailto:support@megswb.co.za" className="text-[#C83733] hover:underline">support@megswb.co.za</a></dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-900">Address</dt>
              <dd className="text-muted-foreground">20 Dirk van Den Berg Street, Modimolle/Nylstroom, Limpopo 0510</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
