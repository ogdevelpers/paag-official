export type Promotion = {
  code: string;
  label: string;
  description: string;
  minimumSubtotal: number;
  percentOff?: number;
  flatOff?: number;
};

export const promotions: Promotion[] = [
  {
    code: "PAAG10",
    label: "10% off",
    description: "10% off on your PAAG order above ₹3,000.",
    minimumSubtotal: 3000,
    percentOff: 10,
  },
  {
    code: "FESTIVE500",
    label: "₹500 off",
    description: "₹500 off on festive orders above ₹5,000.",
    minimumSubtotal: 5000,
    flatOff: 500,
  },
];

export function findPromotion(code?: string) {
  if (!code) return null;
  return promotions.find((promotion) => promotion.code === code.trim().toUpperCase()) ?? null;
}

export function applyPromotion(subtotal: number, code?: string) {
  const promotion = findPromotion(code);
  if (!promotion) {
    return { couponCode: "", discount: 0, label: "", error: code ? "Coupon is invalid." : "" };
  }

  if (subtotal < promotion.minimumSubtotal) {
    return {
      couponCode: promotion.code,
      discount: 0,
      label: promotion.label,
      error: `Add ${new Intl.NumberFormat("en-IN", {
        currency: "INR",
        style: "currency",
      }).format(promotion.minimumSubtotal - subtotal)} more to use ${promotion.code}.`,
    };
  }

  const discount = promotion.percentOff
    ? Math.round((subtotal * promotion.percentOff) / 100)
    : promotion.flatOff || 0;

  return {
    couponCode: promotion.code,
    discount: Math.min(discount, subtotal),
    label: promotion.label,
    error: "",
  };
}
