import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { teamProfiles } from "@/lib/marketing/team-content";

export function SalesTeam() {
  return (
    <section id="team" className="relative overflow-hidden bg-[#0b1220] py-20 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_65%_50%_at_50%_0%,rgba(200,55,51,0.16),transparent)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:3.5rem_3.5rem] [mask-image:radial-gradient(ellipse_at_center,black_25%,transparent_78%)]" />
      <div className="absolute -left-16 bottom-10 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-4 lg:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[#C83733] sm:text-4xl">
            Meet the team
          </h2>
          <p className="mt-3 text-base leading-relaxed text-slate-300">
            Knowledgeable, local specialists ready to help you choose the right connectivity for your home or
            business.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {teamProfiles.map((member) => (
            <Link
              key={member.slug}
              href={`/team/${member.slug}`}
              className="group block overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] text-center backdrop-blur-sm transition-colors hover:border-[#C83733]/40 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C83733] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1220]"
            >
              <div className="relative mx-auto mt-7 h-32 w-32 overflow-hidden rounded-full border-2 border-white/10 shadow-lg shadow-black/30 transition-colors group-hover:border-[#C83733]/50">
                <Image
                  src={member.photo}
                  alt={member.name}
                  fill
                  className="object-cover object-top transition-transform duration-500 group-hover:scale-105"
                  sizes="128px"
                />
              </div>
              <div className="p-6 pt-4">
                <h3 className="font-semibold text-white transition-colors group-hover:text-[#C83733]">
                  {member.name}
                </h3>
                <p className="mt-1 text-sm text-slate-400">{member.role}</p>
                <p className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-slate-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-hover:text-slate-300">
                  View profile
                  <ArrowRight className="h-3.5 w-3.5" />
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
