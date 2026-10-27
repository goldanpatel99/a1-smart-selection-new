export interface ServerPackage {
  id: string;
  tier: 'standard' | 'premium';
  points: number;
  priceRupees: number;
  photosLimit: number;
  name: string;
}

export const SERVER_PRICING_PACKAGES: Record<string, ServerPackage> = {
  // Standard Points (2,500 photos upload access / point @ ₹149/point)
  'pkg-std-1': {
    id: 'pkg-std-1',
    tier: 'standard',
    points: 1,
    priceRupees: 149,
    photosLimit: 2500,
    name: '1 Standard Point',
  },
  'pkg-std-5': {
    id: 'pkg-std-5',
    tier: 'standard',
    points: 5,
    priceRupees: 699,
    photosLimit: 2500,
    name: '5 Standard Points',
  },
  'pkg-std-10': {
    id: 'pkg-std-10',
    tier: 'standard',
    points: 10,
    priceRupees: 1349,
    photosLimit: 2500,
    name: '10 Standard Points',
  },

  // Premium Points (5,000 photos upload access / point @ ₹249/point)
  'pkg-prm-1': {
    id: 'pkg-prm-1',
    tier: 'premium',
    points: 1,
    priceRupees: 249,
    photosLimit: 5000,
    name: '1 Premium Point',
  },
  'pkg-prm-5': {
    id: 'pkg-prm-5',
    tier: 'premium',
    points: 5,
    priceRupees: 1199,
    photosLimit: 5000,
    name: '5 Premium Points',
  },
  'pkg-prm-10': {
    id: 'pkg-prm-10',
    tier: 'premium',
    points: 10,
    priceRupees: 2369,
    photosLimit: 5000,
    name: '10 Premium Points',
  },
};
