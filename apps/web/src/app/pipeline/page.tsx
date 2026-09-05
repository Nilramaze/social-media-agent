import Link from "next/link";
import { PipelineView } from "./pipeline-view";

export default function PipelinePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">Pipeline-Uebersicht</h1>
        <p className="text-sm text-neutral-500">
          Aktualisiert sich automatisch alle 2 Sekunden.
        </p>
        <Link href="/" className="text-sm underline text-neutral-500">
          Zur Startseite
        </Link>
      </div>
      <PipelineView />
    </main>
  );
}
