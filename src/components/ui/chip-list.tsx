import { Badge, type BadgeTone } from "@/components/ui/badge";

/**
 * Renders a normalized collection (NAICS, PSC, certifications, …) as chips, with
 * an explicit empty message so a blank profile section is never ambiguous.
 */
export function ChipList({
  items,
  tone = "neutral",
  emptyMessage = "None recorded",
  numeric = false,
}: {
  items: Array<{ id: string; label: string; hint?: string | null }>;
  tone?: BadgeTone;
  emptyMessage?: string;
  numeric?: boolean;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-ink-subtle">{emptyMessage}</p>;
  }

  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li key={item.id}>
          <Badge tone={tone} className={numeric ? "numeric" : undefined}>
            {item.label}
            {item.hint ? <span className="ml-1 font-normal opacity-70">{item.hint}</span> : null}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
