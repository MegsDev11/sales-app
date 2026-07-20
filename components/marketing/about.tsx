export function About() {
  return (
    <section id="about" className="py-20">
      <div className="mx-auto max-w-6xl px-4 lg:px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">About Megs Waterberg</h2>
            <p className="mt-4 text-lg font-medium text-[#C83733]">
              One of the leading experts in internet connectivity and technological services in the Limpopo area
            </p>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              Megs Waterberg is a private company locally based in Modimolle, operating in the Waterberg area for
              the last 21 years. We provide our clients with cost-effective, practical business solutions and
              services.
            </p>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              Megs Waterberg is owned and managed by South Africans who all share a passion for technology and
              client service. We were formed to meet the needs of small, medium and large clients who have
              demanding Information and Communication technology requirements.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {["21+", "1000+", "5", "24/7"].map((stat, i) => (
              <div key={stat} className="rounded-xl bg-gray-50 p-6 text-center">
                <p className="text-3xl font-bold text-[#C83733]">{stat}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {["Years in Waterberg", "Happy Clients", "Service Areas", "Support Available"][i]}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
