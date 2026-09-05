import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Social Media Agent</h1>
      <Link
        href="/review"
        className="rounded-md bg-black px-5 py-2.5 text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
      >
        Zur Review-Queue
      </Link>
    </main>
  );
}
