export interface ItemPricing {
  name: string;
  prices: Record<string, number>;
}

export const PRICE_MATRIX: ItemPricing[] = [
  {
    name: "Thobe",
    prices: {
      "Normal Iron": 4,
      "Normal Wash": 5,
      "Normal Wash & Iron": 7,
      "Urgent Iron": 6,
      "Urgent Wash": 7,
      "Urgent Wash & Iron": 9,
    },
  },
  {
    name: "Shirt",
    prices: {
      "Normal Iron": 2,
      "Normal Wash": 3,
      "Normal Wash & Iron": 4,
      "Urgent Iron": 3.5,
      "Urgent Wash": 4.5,
      "Urgent Wash & Iron": 5.5,
    },
  },
  {
    name: "T-Shirt",
    prices: {
      "Normal Iron": 1.5,
      "Normal Wash": 2.5,
      "Normal Wash & Iron": 3.5,
      "Urgent Iron": 3,
      "Urgent Wash": 4,
      "Urgent Wash & Iron": 5,
    },
  },
  {
    name: "Trouser",
    prices: {
      "Normal Iron": 2.5,
      "Normal Wash": 3.5,
      "Normal Wash & Iron": 4.5,
      "Urgent Iron": 4,
      "Urgent Wash": 5,
      "Urgent Wash & Iron": 6,
    },
  },
];
