'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'Image Lab' },
  { href: '/chat', label: 'Chat Assistant' },
];

export function StudentNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-2 rounded-full bg-white shadow-sm border border-slate-200 p-1 w-fit">
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-4 py-2 text-sm font-medium rounded-full transition ${
              isActive
                ? 'bg-sky-600 text-white shadow'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
