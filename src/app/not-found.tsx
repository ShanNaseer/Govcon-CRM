import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="text-xs font-semibold tracking-widest text-ink-subtle uppercase">404</p>
      <h1 className="mt-2 text-lg font-semibold text-ink">Page not found</h1>
      <p className="mt-1 text-sm text-ink-muted">
        The record or page you requested does not exist.
      </p>
      <Link href="/" className="mt-4 text-sm font-medium text-brand hover:underline">
        Back to dashboard
      </Link>
    </div>
  );
}
