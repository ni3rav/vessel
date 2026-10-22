import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@vessel/r2"],
  // rhea does `module.exports = new Container()`. Bundling that export drops
  // Container#get_option, and Service Bus publish throws before it connects.
  serverExternalPackages: ["@azure/service-bus", "@azure/core-amqp", "rhea", "rhea-promise"],
};

export default nextConfig;
