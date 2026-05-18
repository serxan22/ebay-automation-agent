import type { SupplierProduct } from "@/lib/types";

export interface SupplierConnector {
  name: string;
  syncProducts(): Promise<SupplierProduct[]>;
  getProductBySku(sku: string): Promise<SupplierProduct | null>;
  checkStock(sku: string): Promise<number>;
  checkPrice(sku: string): Promise<number>;
}

export class SupplierConnectorNotConfiguredError extends Error {
  constructor(name: string) {
    super(`${name} connector is ready for configuration but no credentials are configured yet.`);
    this.name = "SupplierConnectorNotConfiguredError";
  }
}
