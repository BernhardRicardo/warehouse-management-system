import { Product } from './Product';

export interface StockHistory {
  id?: string;
  count: string;
  old_count: string;
  difference: string;
  created_at?: string;
  product: Product;
  type: string;
}
