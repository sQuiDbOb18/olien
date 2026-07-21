import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { arcTestnet } from "@/lib/contracts";

// Testnet only, injected connector alone (MetaMask and similar), per the handoff
// tech stack. Reads the Arc chain and RPC from lib/contracts (deployments source).
export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http(),
  },
  ssr: true,
});
