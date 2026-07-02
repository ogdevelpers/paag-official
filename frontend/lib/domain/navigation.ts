import type { NavChild, NavItem } from "./navigation.types";
import {
  DEFAULT_STORE_CATEGORY,
  getLiveCategories,
  shopHref,
  type StoreCategory,
} from "./store-config";

export type { NavChild, NavItem };

function buildNavItem(category: StoreCategory): NavItem {
  const href = shopHref(category.label);

  if (category.styles?.length) {
    return {
      label: category.label,
      href,
      children: [
        ...category.styles.map((style) => ({
          label: style.label,
          href: shopHref(category.label, style.filter),
        })),
        { label: "View All", href },
      ],
    };
  }

  return { label: category.label, href };
}

export const mainNav: NavItem[] = [
  ...getLiveCategories().map(buildNavItem),
  { label: "New In", href: "/shop?category=New+In&sort=new" },
  { label: "Sale", href: `/shop?category=${encodeURIComponent(DEFAULT_STORE_CATEGORY)}&discount=15&sort=discount`, highlight: true },
];

export function getCollectionSpotlights() {
  return getLiveCategories()
    .filter((category) => category.description)
    .map((category) => ({
      title: category.label,
      description: category.description!,
      href: shopHref(category.label),
      category: category.label,
    }));
}

export function getFooterCollections() {
  return [
    ...getLiveCategories().map((category) => ({
      label: category.label,
      href: shopHref(category.label),
    })),
    { label: "New Arrivals", href: "/shop?category=New+In&sort=new" },
    { label: "Sale", href: `/shop?category=${encodeURIComponent(DEFAULT_STORE_CATEGORY)}&discount=15&sort=discount` },
  ];
}

export function getShopQuickFilters() {
  const primary = getLiveCategories()[0];
  const chips: { label: string; href: string }[] = [
    { label: "All sets", href: shopHref(primary?.label || DEFAULT_STORE_CATEGORY) },
    { label: "New In", href: "/shop?category=New+In&sort=new" },
  ];

  for (const style of primary?.styles || []) {
    chips.push({
      label: style.label,
      href: shopHref(primary!.label, style.filter),
    });
  }

  return chips;
}
