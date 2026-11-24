/** Shape of a product in the Elasticsearch index. */
export interface ProductDocument {
  id: string;
  sku: string;
  name: string;
  slug: string;
  description: string | null;
  price: number | null;
  compareAtPrice: number | null;
  currency: string;
  status: string;
  images: string[];
  attributes: Record<string, string | number | boolean>;
  tags: string[];
  sizes: string[];
  colors: { color: string; image: string }[];
  layoutImages: { position: string; image: string }[];
  diamondType: string | null;
  isNewArrival: boolean;
  isNewCollection: boolean;
  isRecommended: boolean;
  sortOrder: number;
  categoryId: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  available: number;
  inStock: boolean;
  createdAt: string;
  updatedAt: string;
}

export const PRODUCT_UPSERTED = 'product.upserted';
export const PRODUCT_DELETED = 'product.deleted';
export const STOCK_CHANGED = 'stock.changed';

export interface StockChangedEvent {
  productId: string;
  available: number;
}
