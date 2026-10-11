import { Analytics } from '@vercel/analytics/next';
import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import { ServiceWorker } from '@/components/ServiceWorker';
import { SplashGate } from '@/components/SplashGate';
import splashImages from './splash-images.json';
import './globals.css';

const sans = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Proof · the trading journal you’ll keep', template: '%s · Proof' },
  description:
    'Your trades sync on their own. You say what happened, in your own words. Then ask your journal anything.',
  applicationName: 'Proof',
  // Startup images make the first frame on iPhone the dark Proof screen, not white.
  appleWebApp: { capable: true, title: 'Proof', statusBarStyle: 'black', startupImage: splashImages },
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

// The installed app opens on the Proof splash once per launch. Decided before
// paint so it never flickers; normal browser tabs never see it.
const splashScript = `try{var s=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;if(s&&!sessionStorage.getItem('proof.splash')){sessionStorage.setItem('proof.splash','1');document.documentElement.classList.add('splash')}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: splashScript }} />
      </head>
      <body>
        <div id="splash" aria-hidden="true">
          <span>Proof</span>
        </div>
        <SplashGate />
        {children}
        <ServiceWorker />
        {/* Cookieless page-view counts on Vercel; no personal data or journal content. */}
        <Analytics />
      </body>
    </html>
  );
}
