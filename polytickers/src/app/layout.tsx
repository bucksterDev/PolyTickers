import type { Metadata } from 'next'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'POLYTICKERS',
  description: 'Prediction markets. Solana or Base.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700;900&family=IBM+Plex+Mono:wght@400;500;600&family=Crimson+Pro:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet" />
        <style>{`
          :root {
            --paper: #faf8f3;
            --paper-dark: #f0ece3;
            --ink: #1a1a18;
            --ink-light: #4a4a45;
            --ink-faded: #8a8a82;
            --rust: #c45a3b;
            --forest: #2d5a4a;
            --gold: #c9a227;
            --navy: #1e3a5f;
            
            --font-display: 'Playfair Display', Georgia, serif;
            --font-body: 'Crimson Pro', Georgia, serif;
            --font-data: 'IBM Plex Mono', monospace;
          }
          
          * { box-sizing: border-box; }
          
          body {
            margin: 0;
            background: var(--paper);
            background-image: 
              repeating-linear-gradient(
                0deg,
                transparent,
                transparent 27px,
                rgba(0,0,0,0.02) 27px,
                rgba(0,0,0,0.02) 28px
              );
            color: var(--ink);
            font-family: var(--font-body);
            min-height: 100vh;
          }
          
          ::selection {
            background: var(--rust);
            color: var(--paper);
          }
          
          @keyframes fadeUp {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
          }
          
          @keyframes slideRight {
            from { opacity: 0; transform: translateX(-8px); }
            to { opacity: 1; transform: translateX(0); }
          }
          
          @keyframes tickerPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
          }
          
          .fade-up {
            animation: fadeUp 0.5s ease-out forwards;
          }
          
          .stagger-1 { animation-delay: 0.05s; opacity: 0; }
          .stagger-2 { animation-delay: 0.1s; opacity: 0; }
          .stagger-3 { animation-delay: 0.15s; opacity: 0; }
          .stagger-4 { animation-delay: 0.2s; opacity: 0; }
          .stagger-5 { animation-delay: 0.25s; opacity: 0; }
          .stagger-6 { animation-delay: 0.3s; opacity: 0; }
          
          input, select, button {
            font-family: var(--font-data);
          }
          
          /* Scrollbar */
          ::-webkit-scrollbar { width: 8px; }
          ::-webkit-scrollbar-track { background: var(--paper-dark); }
          ::-webkit-scrollbar-thumb { background: var(--ink-faded); }
        `}</style>
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
