import nextra from 'nextra'
 
// Set up Nextra with its configuration
const withNextra = nextra({
})
 
// Export the final Next.js config with Nextra included
export default withNextra({
    turbopack: {
        resolveAlias: {
            'next-mdx-import-source-file': './src/mdx-components.js'
        }
    },
    images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'assets.cvcvcx9.org' } // R2 서브도메인
    ]
  }
})