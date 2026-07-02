export type CategoryStyle = {
  label: string;
  filter: string;
};

export type StoreCategory = {
  slug: string;
  label: string;
  /** Set to true when the category is available on the storefront. */
  live: boolean;
  description?: string;
  styles?: CategoryStyle[];
};

/**
 * Keep in sync with backend/src/domain/store-config.ts
 */
export const STORE_CATEGORIES: StoreCategory[] = [
  {
    slug: "co-ords",
    label: "Co-ords",
    live: true,
    description:
      "Matching tops and bottoms with intricate embroidery and vibrant prints. Dress up for festive celebrations or keep it chic for casual outings.",
    styles: [
      { label: "Embroidered", filter: "Embroidered" },
      { label: "Printed", filter: "Printed" },
      { label: "Solid", filter: "Solid" },
      { label: "Festive", filter: "festive" },
    ],
  },
  {
    slug: "kurtas-kurtis",
    label: "Kurtas & Kurtis",
    live: false,
    description: "Designer kurtas and kurtis for everyday and occasion wear.",
    styles: [
      { label: "A-Line", filter: "A-Line" },
      { label: "Straight", filter: "Straight" },
      { label: "Embroidered", filter: "Embroidered" },
      { label: "Printed", filter: "Printed" },
    ],
  },
  {
    slug: "dresses",
    label: "Dresses",
    live: false,
    description: "Ethnic dresses and kurti dresses for day-outs and celebrations.",
    styles: [
      { label: "A-Line", filter: "A-Line" },
      { label: "Fit & Flared", filter: "Fit & Flared" },
    ],
  },
  {
    slug: "ethnic-sets-dupatta",
    label: "Ethnic Sets with Dupatta",
    live: false,
    description: "Kurta sets with dupatta for pooja, mehendi and family functions.",
  },
  {
    slug: "ethnic-sets",
    label: "Ethnic Sets",
    live: false,
    description: "Coordinated kurta and bottom sets without dupatta.",
  },
  {
    slug: "sarees",
    label: "Sarees",
    live: false,
    description: "Sarees for weddings, receptions and festive evenings.",
  },
  {
    slug: "lehengas",
    label: "Lehengas",
    live: false,
    description: "Lehenga sets for sangeet, wedding and reception.",
  },
  {
    slug: "bottom-wear",
    label: "Bottom Wear",
    live: false,
    description: "Palazzos, trousers and skirts to pair with kurtas.",
  },
];

export const DEFAULT_STORE_CATEGORY = "Co-ords";

export const VIRTUAL_CATEGORIES = ["New In"] as const;

export function getLiveCategories(): StoreCategory[] {
  return STORE_CATEGORIES.filter((category) => category.live);
}

export function getLiveCategoryLabels(): string[] {
  return getLiveCategories().map((category) => category.label);
}

export function getAllCategoryLabels(): string[] {
  return [...VIRTUAL_CATEGORIES, ...STORE_CATEGORIES.map((category) => category.label)];
}

export function getCategoryByLabel(label: string): StoreCategory | undefined {
  return STORE_CATEGORIES.find((category) => category.label === label);
}

export function isLiveCategory(category: string): boolean {
  return getLiveCategoryLabels().includes(category);
}

export function shopHref(category: string, style?: string): string {
  const params = new URLSearchParams({ category });
  if (style) {
    params.set("style", style);
  }
  return `/shop?${params.toString()}`;
}

export function filterLiveProducts<T extends { category: string; status?: string }>(
  products: T[],
): T[] {
  const live = new Set(getLiveCategoryLabels());
  return products.filter(
    (product) => live.has(product.category) && product.status !== "draft",
  );
}
