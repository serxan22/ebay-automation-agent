import { SupplierConnectorNotConfiguredError, type SupplierConnector } from "@/lib/suppliers/connectors/types";

export function createCustomApiConnector(name = "Custom API"): SupplierConnector {
  return {
    name,
    async syncProducts() {
      throw new SupplierConnectorNotConfiguredError(name);
    },
    async getProductBySku() {
      throw new SupplierConnectorNotConfiguredError(name);
    },
    async checkStock() {
      throw new SupplierConnectorNotConfiguredError(name);
    },
    async checkPrice() {
      throw new SupplierConnectorNotConfiguredError(name);
    }
  };
}
