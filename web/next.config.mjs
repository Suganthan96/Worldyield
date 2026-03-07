/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  webpack: (config, { isServer }) => {
    // Ignore optional dependencies that are not needed for web builds
    config.ignoreWarnings = [
      { module: /node_modules\/@metamask\/sdk/ },
      { module: /node_modules\/@wagmi\/connectors/ },
    ];
    
    // Fallback for node modules that are not available in browser
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        'porto/internal': false,
        'porto': false,
        '@react-native-async-storage/async-storage': false,
        '@base-org/account': false,
      };
    }
    
    return config;
  },
}

export default nextConfig
