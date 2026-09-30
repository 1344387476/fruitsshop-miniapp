export type ImageRef = number | { kind: "upload"; id: string };
export interface Category {
  id: string;
  name: string;
  sort: number;
  enabled: boolean;
}
export interface SKU {
  id: string;
  label: string;
  price: number;
  stock: number;
  enabled: boolean;
}
export interface Product {
  id: string;
  name: string;
  subtitle: string;
  categoryId: string;
  category: string;
  origin: string;
  image: ImageRef;
  description: string;
  storage: string;
  enabled: boolean;
  skus: SKU[];
}
export interface Store {
  name: string;
  tagline: string;
  description: string;
  phone: string;
  address: string;
  hours: string;
  deliveryFee: number;
  deliveryNote: string;
}
export type OrderStatus = "pending" | "paid" | "completed" | "cancelled";
export type Fulfillment = "delivery" | "pickup";
export interface OrderLine {
  productId: string;
  skuId: string;
  name: string;
  spec: string;
  image: ImageRef;
  price: number;
  quantity: number;
}
export interface Order {
  id: string;
  status: OrderStatus;
  fulfillment: Fulfillment;
  createdAt: number;
  paidAt?: number;
  completedAt?: number;
  cancelledAt?: number;
  contact: { name: string; phone: string; detail: string };
  lines: OrderLine[];
  note: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
}
export interface State {
  version: 1;
  categories: Category[];
  products: Product[];
  orders: Order[];
  store: Store;
}
export interface RawSeed {
  categories: (Omit<Category, "id"> & { _id: string })[];
  products: (Omit<Product, "id" | "skus"> & { _id: string })[];
  skus: (Omit<SKU, "id"> & { _id: string; productId: string })[];
  settings: (Store & { _id: string })[];
}
export interface ProductFilter {
  keyword?: string;
  categoryId?: string;
  enabled?: string;
  page?: number;
}
export interface OrderFilter {
  keyword?: string;
  status?: OrderStatus | "";
  fulfillment?: Fulfillment | "";
  page?: number;
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
}
