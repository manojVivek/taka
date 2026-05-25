import Link from 'next/link';

export default function ProjectNotFound() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="tk-panel max-w-[480px] p-10 text-center">
        <div className="text-dim mb-3 text-[10.5px] uppercase tracking-[0.18em]">// 404</div>
        <div className="sans mb-2.5 text-[28px] font-medium tracking-tight">project not found.</div>
        <div className="prose text-mid mb-6 text-[13px] leading-relaxed">
          The project id in the URL doesn&apos;t exist on the API. It may have been deleted, or the link is wrong.
        </div>
        <Link href="/" className="tk-btn primary no-underline">
          ← all projects
        </Link>
      </div>
    </div>
  );
}
