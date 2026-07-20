"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle, Radio } from "lucide-react";
import type { PublicNetworkOutage } from "@/lib/types";

function formatStartedAt(iso: string) {
  return new Date(iso).toLocaleString("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function NetworkStatus() {
  const [outages, setOutages] = useState<PublicNetworkOutage[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/network-status")
      .then((res) => res.json())
      .then((data: { outages?: PublicNetworkOutage[] }) => {
        setOutages(data.outages ?? []);
      })
      .catch(() => setOutages([]))
      .finally(() => setLoaded(true));
  }, []);

  const hasOutages = outages.length > 0;

  return (
    <section
      id="network-status"
      className={hasOutages ? "bg-red-50 py-16" : "bg-emerald-50/60 py-16"}
    >
      <div className="mx-auto max-w-6xl px-4 lg:px-6">
        <div className="text-center">
          {hasOutages ? (
            <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full bg-red-100 px-4 py-1.5 text-sm font-semibold text-red-800">
              <AlertTriangle className="h-4 w-4" />
              Service disruption in progress
            </div>
          ) : (
            <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-1.5 text-sm font-semibold text-emerald-800">
              <CheckCircle className="h-4 w-4" />
              All systems operational
            </div>
          )}
          <h2 className="text-3xl font-bold text-gray-900">Network Status</h2>
          <p className="mx-auto mt-2 max-w-2xl text-muted-foreground">
            {hasOutages
              ? "The following towers are currently offline. Affected areas are listed below."
              : "All Megs Waterberg towers are online. We'll post updates here if anything changes."}
          </p>
        </div>

        {loaded && hasOutages && (
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {outages.map((outage) => (
              <article
                key={outage.id}
                className="rounded-2xl border-2 border-red-200 bg-white p-6 shadow-md"
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-red-100 p-2">
                    <Radio className="h-5 w-5 text-red-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-red-900">{outage.title}</h3>
                    <p className="mt-1 font-medium text-red-800">{outage.towerName}</p>
                    <p className="mt-3 text-sm leading-relaxed text-gray-700">{outage.message}</p>
                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                        Affected areas
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {outage.affectedAreas.map((area) => (
                          <span
                            key={area}
                            className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800"
                          >
                            {area}
                          </span>
                        ))}
                      </div>
                    </div>
                    <p className="mt-4 text-xs text-muted-foreground">
                      Reported: {formatStartedAt(outage.startedAt)}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {loaded && !hasOutages && (
          <div className="mx-auto mt-10 max-w-xl rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
            <CheckCircle className="mx-auto h-12 w-12 text-emerald-500" />
            <p className="mt-4 text-lg font-semibold text-gray-900">
              No outages reported
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Our network across the Waterberg is running normally. Need help? Call{" "}
              <a href="tel:0878205290" className="font-medium text-[#C83733] hover:underline">
                087 820 5290
              </a>
              .
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
