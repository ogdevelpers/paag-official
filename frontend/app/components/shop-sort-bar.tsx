import Link from "next/link";

const SORT_OPTIONS = [
  { label: "Featured", value: "featured" },
  { label: "Newest", value: "new" },
  { label: "Price ↑", value: "price-low" },
  { label: "Price ↓", value: "price-high" },
  { label: "Best deals", value: "discount" },
] as const;

type ShopSortBarProps = {
  params: Record<string, string | string[] | undefined>;
  sort: string;
};

function buildSortHref(
  params: Record<string, string | string[] | undefined>,
  sort: string,
) {
  const next = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (key === "sort" || value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach((entry) => next.append(key, entry));
    } else {
      next.set(key, value);
    }
  }

  next.set("sort", sort);
  const query = next.toString();
  return query ? `/shop?${query}` : "/shop";
}

export function ShopSortBar({ params, sort }: ShopSortBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted-dim)]">
        Sort
      </span>
      {SORT_OPTIONS.map((option) => (
        <Link
          className={`chip shrink-0 ${sort === option.value ? "chip-active" : ""}`}
          href={buildSortHref(params, option.value)}
          key={option.value}
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}
