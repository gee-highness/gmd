// src/app/layout.tsx
import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import { ColorModeScript } from '@chakra-ui/react';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';
import { Providers } from './providers';
import ClientLayout from '@/components/ClientLayout';
import { profile } from '@/data/profile';
import { projectsData } from '@/data/projectsData';

const footerProjects = projectsData.filter((p) => p.featured).slice(0, 5).map(({ id, name }) => ({ id, name }));

const body = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const display = Space_Grotesk({ subsets: ['latin'], variable: '--font-display', display: 'swap', weight: ['500', '700'] });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0A0A0A',
  colorScheme: 'dark',
};

export const metadata: Metadata = {
  metadataBase: new URL(profile.siteUrl),
  title: {
    default: `${profile.name} · ${profile.title}`,
    template: `%s · ${profile.name}`,
  },
  description: `${profile.name} is a health data and AI engineer and full-stack software developer. Explore projects, experience and get in touch.`,
  applicationName: profile.name,
  authors: [{ name: profile.name, url: profile.github.url }],
  manifest: '/manifest.json',
  icons: { icon: '/favicon.ico', apple: '/icons/icon-192x192.png' },
  openGraph: {
    type: 'website',
    siteName: profile.name,
    title: `${profile.name} · ${profile.title}`,
    description: profile.tagline,
    locale: 'en',
  },
  twitter: { card: 'summary_large_image', title: `${profile.name} · ${profile.title}`, description: profile.tagline },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`} suppressHydrationWarning>
      <body className={body.className} suppressHydrationWarning>
        <ColorModeScript initialColorMode="dark" />
        <Providers>
          <ClientLayout siteTitle={profile.name} footerProjects={footerProjects}>
            <Analytics />
            {children}
          </ClientLayout>
        </Providers>
      </body>
    </html>
  );
}
