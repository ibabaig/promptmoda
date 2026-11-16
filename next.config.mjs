/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // The generate form uploads an image (capped at 4 MB in the action)
      // through a server action. The default limit is 1 MB; the extra
      // room covers multipart overhead.
      bodySizeLimit: "5mb",
    },
  },
};
export default nextConfig;
