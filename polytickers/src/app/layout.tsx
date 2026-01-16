import type { Metadata } from 'next'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'POLYTICKERS',
  description: 'Prediction markets. Solana or Base. No Polygon.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Mono:wght@300;400;500&family=Bebas+Neue&display=swap" rel="stylesheet" />
        <style>{`
          :root {
            --bg-primary: #0d0d0d;
            --bg-secondary: #161616;
            --bg-tertiary: #1f1f1f;
            --text-primary: #e8e6e3;
            --text-secondary: #8a8a8a;
            --text-muted: #5a5a5a;
            --accent-green: #00ff88;
            --accent-red: #ff3366;
            --accent-gold: #ffd700;
            --accent-blue: #00d4ff;
            --border: #2a2a2a;
            --font-display: 'Bebas Neue', sans-serif;
            --font-serif: 'Instrument Serif', Georgia, serif;
            --font-mono: 'DM Mono', monospace;
          }
          
          * {
            box-sizing: border-box;
          }
          
          ::selection {
            background: var(--accent-green);
            color: var(--bg-primary);
          }
          
          @keyframes fadeInUp {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
          
          @keyframes slideIn {
            from {
              opacity: 0;
              transform: translateX(-10px);
            }
            to {
              opacity: 1;
              transform: translateX(0);
            }
          }
          
          .animate-in {
            animation: fadeInUp 0.5s ease-out forwards;
          }
          
          .stagger-1 { animation-delay: 0.1s; opacity: 0; }
          .stagger-2 { animation-delay: 0.2s; opacity: 0; }
          .stagger-3 { animation-delay: 0.3s; opacity: 0; }
          .stagger-4 { animation-delay: 0.4s; opacity: 0; }
          
          body {
            background: var(--bg-primary);
            background-image: 
              radial-gradient(ellipse at 20% 0%, rgba(0, 255, 136, 0.03) 0%, transparent 50%),
              radial-gradient(ellipse at 80% 100%, rgba(255, 51, 102, 0.03) 0%, transparent 50%);
            min-height: 100vh;
          }
          
          input, select, button {
            font-family: var(--font-mono);
          }
          
          /* Custom scrollbar */
          ::-webkit-scrollbar {
            width: 6px;
          }
          ::-webkit-scrollbar-track {
            background: var(--bg-secondary);
          }
          ::-webkit-scrollbar-thumb {
            background: var(--border);
            border-radius: 3px;
          }
          ::-webkit-scrollbar-thumb:hover {
            background: var(--text-muted);
          }
        `}</style>
      </head>
      <body style={{ margin: 0, fontFamily: 'var(--font-serif)', color: 'var(--text-primary)' }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
