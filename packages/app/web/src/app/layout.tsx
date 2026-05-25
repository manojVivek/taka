import './globals.css';
import type { Metadata } from 'next';
import { JetBrains_Mono, Space_Grotesk, IBM_Plex_Sans } from 'next/font/google';

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-ibm-plex-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Taka — visual regression testing',
  description: 'Records user sessions, replays them in headless Chrome, pixel-diffs against a baseline.',
};

// Inline script that runs before paint to apply the persisted theme.
// Prevents a light-mode flash on dark-default and vice versa.
const themeBootstrap = `
(function(){
  try {
    var t = localStorage.getItem('taka-theme');
    if (t === 'light') document.documentElement.classList.add('theme-light');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const fontClasses = `${jetbrainsMono.variable} ${spaceGrotesk.variable} ${ibmPlexSans.variable}`;
  return (
    <html lang="en" className={fontClasses}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
