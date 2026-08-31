import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ghost Content Studio',
  description: 'Estúdio faceless para criação e publicação de conteúdo vertical.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
