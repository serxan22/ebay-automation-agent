import { SupplierConnectorNotConfiguredError, type SupplierConnector } from "@/lib/suppliers/connectors/types";

export function createSynceeConnector(): SupplierConnector {
  return {
    name: "Syncee",
    async syncProducts() {
      throw new SupplierConnectorNotConfiguredError("Syncee");
    },
    async getProductBySku() {
      throw new SupplierConnectorNotConfiguredError("Syncee");
    },
    async checkStock() {
      throw new SupplierConnectorNotConfiguredError("Syncee");
    },
    async checkPrice() {
      throw new SupplierConnectorNotConfiguredError("Syncee");
    }
  };
}
