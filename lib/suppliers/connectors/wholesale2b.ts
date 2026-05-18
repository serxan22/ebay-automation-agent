import { SupplierConnectorNotConfiguredError, type SupplierConnector } from "@/lib/suppliers/connectors/types";

export function createWholesale2BConnector(): SupplierConnector {
  return {
    name: "Wholesale2B",
    async syncProducts() {
      throw new SupplierConnectorNotConfiguredError("Wholesale2B");
    },
    async getProductBySku() {
      throw new SupplierConnectorNotConfiguredError("Wholesale2B");
    },
    async checkStock() {
      throw new SupplierConnectorNotConfiguredError("Wholesale2B");
    },
    async checkPrice() {
      throw new SupplierConnectorNotConfiguredError("Wholesale2B");
    }
  };
}
