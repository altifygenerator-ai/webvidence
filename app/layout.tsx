import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  title: { default: 'Webvidence | Find businesses that need better websites', template: '%s | Webvidence' },
  description: 'Evidence-backed local prospecting for freelance web designers.',
  openGraph: { title: 'Webvidence', description: 'Find the proof. Land the project.', type: 'website' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" data-scroll-behavior="smooth"><body>{children}</body></html>;
}
