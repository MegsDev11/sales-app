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
import { CheckCircle, Loader2, Mail, MapPin, Phone } from "lucide-react";

const fieldClass =
  "h-10 border-white/10 bg-white/5 text-white placeholder:text-slate-500 focus-visible:border-[#C83733]/50 focus-visible:ring-[#C83733]/25";

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
    <section id="contact" className="relative overflow-hidden bg-[#0b1220] py-20 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_70%_10%,rgba(200,55,51,0.18),transparent)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:3.5rem_3.5rem] [mask-image:radial-gradient(ellipse_at_center,black_25%,transparent_78%)]" />
      <div className="absolute -left-20 bottom-0 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-4 lg:px-6">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[#C83733] sm:text-4xl">
            Get connected
          </h2>
          <p className="mt-3 text-base leading-relaxed text-slate-300">
            Tell us what you need — fibre, wireless, VoIP, CCTV or networking — and our local team will follow up.
          </p>
        </div>

        <div className="grid items-stretch gap-6 lg:grid-cols-2 lg:gap-8">
          <div className="relative min-h-[280px] overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 shadow-2xl shadow-black/30 sm:min-h-[360px] lg:min-h-0">
            <Image
              src="/contact/megs-truck.jpg"
              alt="MEGS service vehicle in the field"
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0b1220] via-transparent to-transparent" />
            <div className="absolute inset-x-5 bottom-5 rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-md">
              <p className="text-sm font-semibold text-white">On the road across Waterberg</p>
              <p className="mt-1 text-xs text-slate-300">Local installs · Local support · Fast response</p>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm sm:p-8">
            {status === "success" ? (
              <div className="flex flex-col items-center py-10 text-center">
                <CheckCircle className="h-12 w-12 text-emerald-400" />
                <p className="mt-4 text-lg font-semibold text-white">Thanks for submitting!</p>
                <p className="mt-2 text-sm text-slate-400">Our sales team will contact you soon.</p>
                <Button
                  variant="outline"
                  className="mt-6 border-white/20 bg-white/5 text-white hover:bg-white hover:text-gray-900"
                  onClick={() => setStatus("idle")}
                >
                  Send another message
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="firstName" className="text-sm font-medium text-slate-200">
                      First Name *
                    </label>
                    <Input id="firstName" name="firstName" required className={fieldClass} />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="lastName" className="text-sm font-medium text-slate-200">
                      Last Name *
                    </label>
                    <Input id="lastName" name="lastName" required className={fieldClass} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="phone" className="text-sm font-medium text-slate-200">
                    Phone
                  </label>
                  <Input id="phone" name="phone" type="tel" className={fieldClass} />
                </div>
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-slate-200">
                    Email
                  </label>
                  <Input id="email" name="email" type="email" className={fieldClass} />
                </div>
                <div className="space-y-2">
                  <label htmlFor="address" className="text-sm font-medium text-slate-200">
                    Address
                  </label>
                  <Input id="address" name="address" className={fieldClass} />
                </div>
                <div className="space-y-2">
                  <span className="text-sm font-medium text-slate-200">How should we contact you?</span>
                  <Select
                    value={contactPref}
                    onValueChange={(v) => {
                      if (typeof v === "string") setContactPref(v);
                    }}
                  >
                    <SelectTrigger className={fieldClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="phone">Phone</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="message" className="text-sm font-medium text-slate-200">
                    Message *
                  </label>
                  <Textarea
                    id="message"
                    name="message"
                    rows={4}
                    required
                    placeholder="Tell us about your connectivity needs..."
                    className="border-white/10 bg-white/5 text-white placeholder:text-slate-500 focus-visible:border-[#C83733]/50 focus-visible:ring-[#C83733]/25"
                  />
                </div>
                {status === "error" && <p className="text-sm text-red-400">{errorMsg}</p>}
                <Button
                  type="submit"
                  className="w-full bg-[#C83733] hover:bg-[#a82f2b]"
                  disabled={status === "loading"}
                >
                  {status === "loading" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Send Message"
                  )}
                </Button>
              </form>
            )}
          </div>
        </div>

        <div className="mt-12 text-center lg:mt-16">
          <h3 className="text-3xl font-bold tracking-tight text-[#C83733] sm:text-4xl">
            Reach us directly
          </h3>
          <p className="mx-auto mt-3 max-w-2xl text-slate-300">
            Prefer a call or email? Our Modimolle team is ready to help.
          </p>
          <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm">
              <dt className="flex items-center gap-2 text-sm font-semibold text-white">
                <Phone className="h-4 w-4 text-[#C83733]" />
                Phone
              </dt>
              <dd className="mt-2">
                <a href="tel:0878205290" className="text-sm text-slate-300 transition-colors hover:text-[#C83733]">
                  087 820 5290
                </a>
              </dd>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm">
              <dt className="flex items-center gap-2 text-sm font-semibold text-white">
                <Mail className="h-4 w-4 text-[#C83733]" />
                Sales
              </dt>
              <dd className="mt-2">
                <a
                  href="mailto:sales@megswb.co.za"
                  className="text-sm text-slate-300 transition-colors hover:text-[#C83733]"
                >
                  sales@megswb.co.za
                </a>
              </dd>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm">
              <dt className="flex items-center gap-2 text-sm font-semibold text-white">
                <Mail className="h-4 w-4 text-[#C83733]" />
                Support
              </dt>
              <dd className="mt-2">
                <a
                  href="mailto:support@megswb.co.za"
                  className="text-sm text-slate-300 transition-colors hover:text-[#C83733]"
                >
                  support@megswb.co.za
                </a>
              </dd>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm">
              <dt className="flex items-center gap-2 text-sm font-semibold text-white">
                <MapPin className="h-4 w-4 text-[#C83733]" />
                Address
              </dt>
              <dd className="mt-2 text-sm leading-relaxed text-slate-300">
                20 Dirk van Den Berg Street, Modimolle/Nylstroom, Limpopo 0510
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
