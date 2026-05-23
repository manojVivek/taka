import type { Metadata } from 'next';
import { RecorderProvider } from '@/components/RecorderProvider';

export const metadata: Metadata = {
  title: 'Notes App - Taka Test',
  description: 'A simple notes app for testing the Taka recorder SDK',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif', background: '#f5f5f5' }}>
        <RecorderProvider />
        <nav style={{
          background: '#1a1a2e',
          color: 'white',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <a href="/" style={{ color: 'white', textDecoration: 'none', fontSize: '18px', fontWeight: 'bold' }}>
            Notes App
          </a>
          <span style={{ fontSize: '12px', opacity: 0.7 }}>Taka Recorder Active</span>
        </nav>
        <main style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
