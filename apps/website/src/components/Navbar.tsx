'use client';
import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import logo from '@/app/icon.svg';

interface NavLink {
    href: string;
    label: string;
    icon: string;
    exact?: boolean;
}

const NAV_LINKS: NavLink[] = [
    { href: '/', label: 'Home', icon: 'fa-solid fa-house', exact: true },
    { href: '/guides/', label: 'Guides', icon: 'fa-solid fa-book-open' },
];

/**
 * Sticky top navigation bar shown on all pages.
 * Highlights the active route using Next.js usePathname.
 */
export const Navbar: React.FC = () => {
    const pathname = usePathname();

    const isActive = (link: NavLink): boolean => {
        if (link.exact) return pathname === link.href || pathname === '/';
        return pathname.startsWith(link.href);
    };

    return (
        <header className="navbar-section">
            <nav className="navbar-inner landing-container" aria-label="Main navigation">
                {/* Brand */}
                <Link href="/" className="navbar-brand">
                    <Image src={logo} alt="File Brain logo" width={28} height={28} />
                    <span>File Brain</span>
                </Link>

                {/* Links */}
                <ul className="navbar-links">
                    {NAV_LINKS.map((link) => (
                        <li key={link.href}>
                            <Link
                                href={link.href}
                                className={`navbar-link${isActive(link) ? ' active' : ''}`}
                                aria-current={isActive(link) ? 'page' : undefined}
                            >
                                <i className={link.icon} aria-hidden="true" />
                                {link.label}
                            </Link>
                        </li>
                    ))}
                    <li>
                        <a
                            href="https://github.com/Hamza5/file-brain"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="navbar-link"
                            aria-label="GitHub repository"
                        >
                            <i className="fa-brands fa-github" aria-hidden="true" />
                            GitHub
                        </a>
                    </li>
                </ul>
            </nav>
        </header>
    );
};
