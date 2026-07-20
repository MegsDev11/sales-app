export function About() {
  const stats = [
    { value: "21+", label: "Years in Waterberg" },
    { value: "3600+", label: "Happy Clients" },
    { value: "5", label: "Service Areas" },
    { value: "24/7", label: "Support Available" },
  ];

  return (
    <section id="about" className="relative overflow-hidden bg-[#0b1220] py-20 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_10%_40%,rgba(59,130,246,0.1),transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_90%_80%,rgba(200,55,51,0.12),transparent)]" />
      <div className="absolute -right-24 top-10 h-64 w-64 rounded-full bg-[#C83733]/10 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-4 lg:px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-[#C83733] sm:text-4xl">
              Who we are
            </h2>
            <p className="mt-4 text-lg font-medium leading-snug text-white/90">
              One of the leading experts in internet connectivity and technological services in the Limpopo area
            </p>
            <p className="mt-5 text-base leading-relaxed text-slate-300">
              Megs Waterberg is a private company locally based in Modimolle, operating in the Waterberg area for
              the last 21 years. We provide our clients with cost-effective, practical business solutions and
              services.
            </p>
            <p className="mt-4 text-base leading-relaxed text-slate-300">
              Megs Waterberg is owned and managed by South Africans who all share a passion for technology and
              client service. We were formed to meet the needs of small, medium and large clients who have
              demanding Information and Communication technology requirements.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center backdrop-blur-sm transition-colors hover:border-white/20 hover:bg-white/[0.06]"
              >
                <p className="text-3xl font-bold tabular-nums text-[#C83733] sm:text-4xl">{stat.value}</p>
                <p className="mt-2 text-sm text-slate-400">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
