import type { Metadata } from 'next';
import { privateMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = privateMetadata('Dashboard', 'Private Webvidence account dashboard.', '/dashboard');

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
