import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { olienChain } from "@/lib/chain";
import { SOURCE_CHAINS } from "@/lib/cctp";

// Injected connector alone (MetaMask and similar), per the handoff tech stack. The
// console's own chain comes from lib/chain. The source chains are here for the
// deposit page, which signs a burn on one of them; the console never leaves its chain.
const sourceChains = SOURCE_CHAINS.map((source) => source.chain);

export const wagmiConfig = createConfig({
  chains: [olienChain, sourceChains[0], ...sourceChains.slice(1)],
  connectors: [injected()],
  transports: Object.fromEntries([
    [olienChain.id, http()],
    ...sourceChains.map((chain) => [chain.id, http()] as const),
  ]),
  ssr: true,
});
