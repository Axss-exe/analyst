/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-select",
      "@radix-ui/react-tabs",
      "@radix-ui/react-toast",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-avatar",
      "@radix-ui/react-label",
      "@radix-ui/react-checkbox",
      "date-fns",
    ],
  },
  // NOTE: No webpack() config — it conflicts with Turbopack.
}
module.exports = nextConfig
