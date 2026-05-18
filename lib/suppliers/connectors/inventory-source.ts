import { SupplierConnectorNotConfiguredError, type SupplierConnector } from "@/lib/suppliers/connectors/types";

export function createInventorySourceConnector(): SupplierConnector {
  return {
    name: "Inventory Source",
    async syncProducts() {
      throw new SupplierConnectorNotConfiguredError("Inventory Source");
    },
    async getProductBySku() {
      throw new SupplierConnectorNotConfiguredError("Inventory Source");
    },
    async checkStock() {
      throw new SupplierConnectorNotConfiguredError("Inventory Source");
    },
    async checkPrice() {
      throw new SupplierConnectorNotConfiguredError("Inventory Source");
    }
  };
}
