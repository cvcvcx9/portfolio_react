import { useMDXComponents as getThemeComponents } from 'nextra-theme-docs' // nextra-theme-blog or your custom theme
 
// Get the default MDX components
const themeComponents = getThemeComponents()

function PortfolioStandaloneWrapper({ children, metadata, ...props }) {
  const standalonePages = new Set([
    'src/content/index.mdx',
    'src/content/keyProjects/malang.mdx',
    'src/content/keyProjects/erpApartmentAutomation.mdx'
  ])

  if (standalonePages.has(metadata?.filePath)) {
    const shellClassName = metadata.filePath.startsWith('src/content/keyProjects/')
      ? 'agent-project-shell'
      : 'portfolio-home-shell'

    return (
      <div className={shellClassName}>
        <main data-pagefind-body={metadata.searchable !== false || undefined}>{children}</main>
      </div>
    )
  }

  const ThemeWrapper = themeComponents.wrapper
  return <ThemeWrapper metadata={metadata} {...props}>{children}</ThemeWrapper>
}
 
// Merge components
export function useMDXComponents(components) {
  return {
    ...themeComponents,
    wrapper: PortfolioStandaloneWrapper,
    ...components
  }
}
