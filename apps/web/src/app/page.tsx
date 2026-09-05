import Link from "next/link";
import { NewCampaignForm } from "./new-campaign-form";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-2xl font-semibold">Social Media Agent</h1>
      <NewCampaignForm />
      <div className="flex gap-4 text-sm text-neutral-500">
        <Link href="/pipeline" className="underline hover:text-neutral-800 dark:hover:text-neutral-200">
          Pipeline-Uebersicht (live)
        </Link>
        <Link href="/review" className="underline hover:text-neutral-800 dark:hover:text-neutral-200">
          Review-Queue
        </Link>
      </div>
    </main>
  );
}
