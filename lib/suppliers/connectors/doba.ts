import { SupplierConnectorNotConfiguredError, type SupplierConnector } from "@/lib/suppliers/connectors/types";

export function createDobaConnector(): SupplierConnector {
  return {
    name: "Doba",
    async syncProducts() {
      throw new SupplierConnectorNotConfiguredError("Doba");
    },
    async getProductBySku() {
      throw new SupplierConnectorNotConfiguredError("Doba");
    },
    async checkStock() {
      throw new SupplierConnectorNotConfiguredError("Doba");
    },
    async checkPrice() {
      throw new SupplierConnectorNotConfiguredError("Doba");
    }
  };
}
