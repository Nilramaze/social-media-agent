import { campaigns, db } from "@sma/db";
import { desc } from "drizzle-orm";
import Link from "next/link";
import { NewCampaignForm } from "./new-campaign-form";

export const dynamic = "force-dynamic";

const PIPELINE_STAGES = [
  { n: 1, name: "Strategist", desc: "Analysiert das Ziel und plant 3-6 thematische Content-Pillars." },
  { n: 2, name: "Research-Agent", desc: "Recherchiert jedes Thema eigenstaendig mit Web-Suche und Quellenbelegen." },
  { n: 3, name: "Content-Agent", desc: "Schreibt Hook, Skript, Caption, CTA und Hashtags." },
  { n: 4, name: "Voice-Agent", desc: "Vertont das Skript, erzeugt wortgenaue Untertitel-Timings." },
  { n: 5, name: "Creative-Agent", desc: "Rendert das fertige Reel-Video inkl. Untertitel und Audiospur." },
  { n: 6, name: "QA-Agent", desc: "Prueft Text und Video gegen Brand Guidelines, retried bei Bedarf." },
  { n: 7, name: "Human Approval", desc: "Wartet auf deine Freigabe, Aenderung oder Ablehnung im Review." },
  { n: 8, name: "Publish & Analytics", desc: "Veroeffentlicht auf Instagram und sammelt Performance-Daten." },
];

export default async function Home() {
  const recentCampaigns = await db.select().from(campaigns).orderBy(desc(campaigns.createdAt)).limit(3);

  return (
    <div className="w-full max-w-7xl mx-auto px-8 py-10 space-y-10">
      <section className="max-w-2xl space-y-3">
        <div className="flex items-center gap-3">
          <span className="px-2 py-0.5 rounded-full bg-surface-card text-ink-muted text-mono-data uppercase tracking-widest border border-border-subtle">
            Neue Kampagne
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-agent-active" />
          <span className="text-mono-data text-agent-active">Pipeline bereit</span>
        </div>
        <h1 className="font-serif italic text-headline-lg text-primary tracking-tight">
          Neue Content-Kampagne starten
        </h1>
        <p className="text-body-lg text-secondary leading-relaxed font-light">
          Definiere das Kampagnenziel. Die Agenten-Pipeline plant Content-Pillars, recherchiert, schreibt,
          vertont und rendert Reels vollstaendig autonom — bis zu deiner Freigabe.
        </p>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-surface-card rounded-xl p-8 border border-border-subtle">
            <NewCampaignForm />
          </div>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <div className="bg-surface-card rounded-xl p-8 border border-border-subtle space-y-6">
            <div className="flex items-baseline justify-between border-b border-border-subtle pb-4">
              <div>
                <span className="text-mono-data text-ink-muted block">AUTONOME PIPELINE</span>
                <h3 className="font-serif italic text-title-md text-primary">Agenten-Ablauf</h3>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-bone text-mono-data text-ink-muted border border-border-subtle">
                <span className="w-1.5 h-1.5 rounded-full bg-agent-active" /> {PIPELINE_STAGES.length} Schritte
              </span>
            </div>
            <div className="relative space-y-2 pl-2">
              <div className="absolute left-[1.15rem] top-3 bottom-3 w-px bg-border-subtle -z-0" />
              {PIPELINE_STAGES.map((stage) => (
                <div key={stage.n} className="relative z-10 flex items-start gap-4 p-3 rounded-lg bg-surface-bone">
                  <div className="w-7 h-7 shrink-0 rounded-full bg-surface text-ink-muted border border-border-subtle flex items-center justify-center text-mono-data">
                    {stage.n}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-body-lg text-primary font-medium">{stage.name}</h4>
                    <p className="text-mono-data text-secondary mt-0.5">{stage.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {recentCampaigns.length > 0 ? (
            <div className="bg-surface-card rounded-xl p-6 border border-border-subtle space-y-4">
              <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                <span className="text-label-sm uppercase text-ink-muted tracking-wider">Kuerzliche Kampagnen</span>
                <Link href="/campaigns" className="text-mono-data text-ink-muted hover:text-primary underline">
                  Alle ansehen
                </Link>
              </div>
              <div className="space-y-2">
                {recentCampaigns.map((c) => (
                  <Link
                    key={c.id}
                    href={`/campaigns/${c.id}`}
                    className="group flex items-center justify-between p-2.5 rounded-lg bg-surface-bone hover:bg-surface-subtle transition-colors"
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="text-body-md text-primary font-medium truncate">{c.goalText}</span>
                      <span className="text-mono-data text-ink-muted">{c.status}</span>
                    </div>
                    <span className="text-ink-muted group-hover:text-primary">→</span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
