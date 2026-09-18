import './globals.css';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Solarithm Admin Console',
  description: 'Phase 1 Admin Console for Solarithm with role-based authentication and Firestore integration.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-[#121212] text-white min-h-screen`}>{children}</body>
    </html>
  );
}
