import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-docs/style.css'
import './globals.css'
import ScrollToTop from './components/ScrollToTop'

export const metadata = {
  metadataBase: new URL('https://cvcvcx9.com'),
  title: '조창훈 포트폴리오',
  description: 'AI 서비스 백엔드와 Java/Spring 신뢰성 경험을 정리한 조창훈 포트폴리오',
  alternates: { canonical: '/' },
  openGraph: {
    title: '조창훈 포트폴리오',
    description: 'AI 서비스 백엔드와 Java/Spring 신뢰성 경험을 정리한 포트폴리오',
    url: 'https://cvcvcx9.com',
    siteName: '조창훈 포트폴리오',
    locale: 'ko_KR',
    type: 'website'
  },
  twitter: {
    card: '/images/조창훈_증명사진.jpg',
    title: '조창훈 포트폴리오',
    description: 'AI 서비스 백엔드와 Java/Spring 신뢰성 경험을 정리한 포트폴리오'
  },
   icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png'
  }
}


const navbar = (
  <Navbar
    logo={<b>조창훈 포트폴리오</b>}
    // ... Your additional navbar options
  />
)
const footer = <Footer> {new Date().getFullYear()} © Portfolio.</Footer>
 
export default async function RootLayout({ children }) {
  return (
    <html
      // Not required, but good for SEO
      lang="ko"
      // Required to be set
      dir="ltr"
      // Suggested by `next-themes` package https://github.com/pacocoursey/next-themes#with-app
      suppressHydrationWarning
    >
      <Head
      // ... Your additional head options
      >
        {/* Your additional tags should be passed as `children` of `<Head>` element */}
      </Head>
      <body>
        <Layout
          darkMode={false}
          navbar={navbar}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/cvcvcx9/portfolio_react/tree/master"
          editLink={null}
          feedback={{ content: null }}
          footer={footer}
          search={null}
          sidebar={{ toggleButton: false }}
          toc={{ title: '목차', backToTop: '맨 위로' }}
          // ... Your additional layout options
        >
          {children}
          <ScrollToTop />
        </Layout>
      </body>
    </html>
  )
}
