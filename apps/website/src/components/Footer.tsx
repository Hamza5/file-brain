import React from 'react';
import Image from 'next/image';

export const Footer: React.FC = () => {
    return (
        <footer className="footer-section py-8 border-top-1 border-100 bg-white">
            <div className="landing-container">
                <div className="flex flex-column md:flex-row justify-content-between align-items-center gap-4">
                    <div className="flex align-items-center gap-3">
                        <Image src="/icon.svg" alt="Logo" width={32} height={32} />
                        <span className="font-bold text-xl text-900">File Brain</span>
                    </div>
                    
                    <div className="text-500 text-sm">
                        &copy; {new Date().getFullYear()} File Brain. Built for researchers, managers, and everyone handling complex data.
                    </div>
                </div>
            </div>
        </footer>
    );
};
