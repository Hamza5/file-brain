import React from 'react';

const features = [
    {
        icon: 'fa-solid fa-bolt',
        title: 'Instant Search',
        description: 'Blazing fast search across all your local files. Find what you need in milliseconds.'
    },
    {
        icon: 'fa-solid fa-brain',
        title: 'Semantic Intelligence',
        description: 'Search by concepts, meanings, and context—not just matching exact keywords.'
    },
    {
        icon: 'fa-solid fa-file-export',
        title: 'Smart Previews & Highlights',
        description: 'See search matches highlighted inside your files. View properties and metadata instantly.'
    },
    {
        icon: 'fa-solid fa-folder-open',
        title: 'Full Control',
        description: 'Open files and folders in your system explorer or delete them directly from the app.'
    },
    {
        icon: 'fa-solid fa-shield-halved',
        title: 'Privacy First',
        description: 'Your data never leaves your machine. All indexing and processing stays local and secure.'
    },
    {
        icon: 'fa-solid fa-folder-tree',
        title: 'Automatic Management',
        description: 'Watch multiple directories at once. Automatically detects changes and keeps your index fresh.'
    }
];

export const Features: React.FC = () => {
    return (
        <section className="features-section bg-gray-50 py-8">
            <div className="landing-container">
                <div className="text-center mb-8">
                    <span className="text-cyan-600 font-bold uppercase tracking-widest text-sm">Powerful Capabilities</span>
                    <h2 className="text-4xl md:text-5xl font-bold mt-2" style={{ color: 'var(--text-color)' }}>
                        Everything you need to <span className="text-cyan-500">master your data</span>
                    </h2>
                </div>
                <div className="grid">
                    {features.map((feature, index) => (
                        <div key={index} className="col-12 md:col-6 lg:col-4 p-3">
                            <div className="p-4 bg-white border-round-xl shadow-1 hover:shadow-3 transition-all transition-duration-300 h-full border-1 border-transparent hover:border-cyan-100 flex flex-column align-items-center text-center">
                                <div className="w-4rem h-4rem bg-cyan-100 border-round-2xl flex align-items-center justify-content-center mb-4">
                                    <i className={`${feature.icon} text-cyan-600 text-2xl`}></i>
                                </div>
                                <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                                <p className="text-600 mb-0">{feature.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};
