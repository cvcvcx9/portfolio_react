import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-docs/style.css'
import './globals.css'
import ScrollToTop from './components/ScrollToTop'

export const metadata = {
  metadataBase: new URL('https://cvcvcx9.com'),
  title: '조창훈 포트폴리오',
  description: 'Java/Spring Boot 백엔드 포트폴리오 — 데이터 무결성, 트랜잭션 안정성 중심',
  alternates: { canonical: '/' },
  openGraph: {
    title: '조창훈 포트폴리오',
    description: 'Java/Spring Boot 백엔드 포트폴리오',
    url: 'https://cvcvcx9.com',
    siteName: '조창훈 포트폴리오',
    locale: 'ko_KR',
    type: 'website'
  },
  twitter: {
    card: '/images/조창훈_증명사진.jpg',
    title: '조창훈 포트폴리오',
    description: 'Java/Spring Boot 백엔드 포트폴리오'
  },
   icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png'
  }
}


const navbar = (
  <Navbar
    logo={<b>💼 조창훈 포트폴리오 페이지</b>}
    // ... Your additional navbar options
  />
)
const footer = <Footer> {new Date().getFullYear()} © Portfolio.</Footer>
 
export default async function RootLayout({ children }) {
  return (
    <html
      // Not required, but good for SEO
      lang="en"
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
          navbar={navbar}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/cvcvcx9/portfolio_react/tree/master"
          footer={footer}
          // ... Your additional layout options
        >
          {children}
          <ScrollToTop />
        </Layout>
      </body>
    </html>
  )
}