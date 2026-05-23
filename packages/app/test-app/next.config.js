/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@taka/recorder', '@taka/types', '@taka/utils', '@taka/constants'],
};

module.exports = nextConfig;
