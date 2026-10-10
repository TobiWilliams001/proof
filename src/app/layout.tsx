import { Analytics } from '@vercel/analytics/next';
import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import { ServiceWorker } from '@/components/ServiceWorker';
import './globals.css';

const sans = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Proof — the trading journal you’ll actually keep', template: '%s · Proof' },
  description:
    'Your trades sync on their own. You say what happened, in your own words. Then ask your journal anything.',
  applicationName: 'Proof',
  appleWebApp: { capable: true, title: 'Proof', statusBarStyle: 'default' },
  icons: { apple: '/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0c0d0f',
};

// Runs before first paint so the theme never flashes. Dark is the default
// (traders live on dark charts); "system" follows the device.
const themeScript = `try{var t=localStorage.getItem('proof.theme');if(t!=='system')document.documentElement.dataset.theme=t==='light'?'light':'dark'}catch(e){document.documentElement.dataset.theme='dark'}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <ServiceWorker />
        {/* Cookieless page-view counts on Vercel; no personal data or journal content. */}
        <Analytics />
      </body>
    </html>
  );
}
