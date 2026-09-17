import type { NextConfig } from "next";

// No outputFileTracingRoot here, unlike the consumer web app. The console is its own
// application and reaches for nothing above its own directory, which is the whole point
// of it being separate: Olien on Monad is not Recourse and must not ship Recourse.
const nextConfig: NextConfig = {
  webpack: (config, { webpack }) => {
    // wagmi's bundled connectors reference optional packages we neither install nor
    // use, since only the injected connector is wired: @x402/* through
    // @coinbase/cdp-sdk, React Native async storage through @metamask/sdk, and
    // pino-pretty through WalletConnect's logging.
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^(@x402\/|pino-pretty$|@react-native-async-storage\/async-storage$)/,
      }),
    );
    return config;
  },
};

export default nextConfig;
