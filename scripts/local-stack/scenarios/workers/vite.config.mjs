// vite-node config for scenario workers that run app code outside Next.
import { fileURLToPath } from "node:url";
export default {
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./empty.mjs", import.meta.url)),
      "@": fileURLToPath(new URL("../../../../", import.meta.url)),
    },
  },
};
