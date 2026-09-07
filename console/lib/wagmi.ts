import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { arcTestnet } from "@/lib/contracts";
import { SOURCE_CHAINS } from "@/lib/cctp";

// Testnet only, injected connector alone (MetaMask and similar), per the handoff
// tech stack. Reads the Arc chain and RPC from lib/contracts (deployments source).
// The source chains are here for the deposit page, which signs a burn on one of
// them; the console never leaves Arc.
const sourceChains = SOURCE_CHAINS.map((source) => source.chain);

export const wagmiConfig = createConfig({
  chains: [arcTestnet, sourceChains[0], ...sourceChains.slice(1)],
  connectors: [injected()],
  transports: Object.fromEntries([
    [arcTestnet.id, http()],
    ...sourceChains.map((chain) => [chain.id, http()] as const),
  ]),
  ssr: true,
});
