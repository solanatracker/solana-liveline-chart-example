'use client';

import { useState } from 'react';
import { LivelineChart } from './liveline-chart';
import { Moon, Sun, Github, BookOpen, Package } from 'lucide-react';

const ICON_SIZE = 15;

interface LinkItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const links: LinkItem[] = [
  { href: 'https://docs.solanatracker.io', label: 'Docs', icon: <BookOpen size={ICON_SIZE} /> },
  { href: 'https://github.com/solanatracker/data-api-sdk', label: 'GitHub', icon: <Github size={ICON_SIZE} /> },
  { href: 'https://www.npmjs.com/package/liveline', label: 'Liveline', icon: <Package size={ICON_SIZE} /> },
];

export default function ChartPage() {
  const [isDarkMode, setIsDarkMode] = useState(true);

  const linkClass = isDarkMode
    ? 'text-neutral-400 hover:text-white'
    : 'text-neutral-500 hover:text-black';

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors duration-300 ${
        isDarkMode ? 'bg-neutral-950 text-white' : 'bg-neutral-50 text-neutral-900'
      }`}
    >
      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-5xl h-[70vh] min-h-[500px] flex flex-col">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Solana (SOL)</h2>
              <p className={`text-sm mt-1 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>
                Real-time price chart powered by Solana Tracker Data API and Liveline
              </p>
            </div>
            <button
              onClick={() => setIsDarkMode((prev) => !prev)}
              className={`p-2 rounded-full transition-colors cursor-pointer shrink-0 ${
                isDarkMode
                  ? 'bg-white/10 hover:bg-white/20 text-white'
                  : 'bg-black/5 hover:bg-black/10 text-black'
              }`}
              aria-label="Toggle theme"
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>

          <div className="flex-1 w-full min-h-0 relative">
            <LivelineChart isDarkMode={isDarkMode} />
          </div>

          <div className="flex items-center justify-center gap-5 mt-4 text-sm font-medium">
            {links.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className={`flex items-center gap-1.5 transition-colors ${linkClass}`}
              >
                {link.icon}
                <span>{link.label}</span>
              </a>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
