import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import logo from '@/app/icon.svg';

export const Footer: React.FC = () => {
    return (
        <footer className="footer-section py-8 border-top-1 border-100 surface-card">
            <div className="landing-container">
                <div className="flex flex-column md:flex-row justify-content-between align-items-start gap-6">
                    {/* Brand */}
                    <div className="flex align-items-center gap-3">
                        <Image src={logo} alt="Logo" width={32} height={32} />
                        <span className="font-bold text-xl text-900">File Brain</span>
                    </div>

                    {/* Guides links */}
                    <div>
                        <p className="font-semibold text-sm mb-3" style={{ color: 'var(--text-color)' }}>
                            Guides
                        </p>
                        <ul className="list-none p-0 m-0 flex flex-column gap-2">
                            <li>
                                <Link href="/guides/" className="text-500 hover:text-900 transition-colors text-sm">
                                    All Guides
                                </Link>
                            </li>
                            <li>
                                <Link href="/guides/local-semantic-search/" className="text-500 hover:text-900 transition-colors text-sm">
                                    Local Semantic Search Guide
                                </Link>
                            </li>
                        </ul>
                    </div>

                    {/* Right side: GitHub + copyright */}
                    <div className="flex flex-column align-items-start md:align-items-end gap-3">
                        <a
                            href="https://github.com/Hamza5/file-brain"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-500 hover:text-900 transition-colors"
                            aria-label="GitHub repository"
                        >
                            <i className="fa-brands fa-github text-xl"></i>
                        </a>
                        <div className="text-500 text-sm">
                            &copy; {new Date().getFullYear()} File Brain. Built for researchers, managers, and everyone handling complex data.
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
};
