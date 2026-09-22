export type ShopColour = {
  slug: string;
  name: string;
};

export type ShopProduct = {
  slug: string;
  name: string;
  description: string;
  priceNaira: number;
  sizes: string[];
  colours: ShopColour[];
};

export const shopProducts: ShopProduct[] = [
  {
    slug: "official-tshirt",
    name: "Kairos Summit Official T-Shirt",
    description: "Equipping, imparting, activating and connecting kingdom creatives",
    priceNaira: 8000,
    sizes: ["M", "L", "XL", "XXL", "XXXL"],
    colours: [
      { slug: "black", name: "Black" },
      { slug: "white", name: "White" },
      { slug: "navy", name: "Navy" },
      { slug: "olive", name: "Olive" },
      { slug: "brown", name: "Brown" }
    ]
  },
  {
    slug: "face-cap",
    name: "Kairos Summit Face Cap",
    description: "Official Kairos Summit face cap",
    priceNaira: 4000,
    sizes: [],
    colours: [
      { slug: "black", name: "Black" },
      { slug: "white", name: "White" }
    ]
  }
];

export const nairaToKobo = (naira: number): number => Math.round(naira * 100);

export const findShopProduct = (slug: string): ShopProduct | undefined =>
  shopProducts.find((product) => product.slug === slug);
