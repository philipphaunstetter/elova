import type { Metadata } from "next";
import localFont from "next/font/local";
import { AuthProvider } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { ToastContainer } from '@/components/toast'
import { ThemeToggle } from '@/components/theme-toggle'
import "./globals.css";

const matchVariable = localFont({
  src: [
    {
      path: '../../public/fonts/MatchVariableWEB-Upright.woff2',
      weight: '100 900',
      style: 'normal',
    },
    {
      path: '../../public/fonts/MatchVariableWEB-Italic.woff2',
      weight: '100 900',
      style: 'italic',
    },
  ],
  variable: '--font-match-variable',
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Elova",
  description: "Unified workflow observability platform - Monitor n8n, Zapier, Make.com and more",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const theme = localStorage.getItem('theme') || 
                  (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
                if (theme === 'dark') {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${matchVariable.variable} antialiased`}
      >
        <AuthProvider>
          <ThemeProvider>
            {children}
            <ToastContainer />
            <ThemeToggle />
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
