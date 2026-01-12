import React from 'react';

const useCases = [
    {
        title: 'Recover Lost Work',
        description: 'Forgot where you saved that important report? Describe it in a few words, and File Brain will find it instantly.',
        icon: 'fa-solid fa-magnifying-glass-location'
    },
    {
        title: 'Deduplicate Your Drive',
        description: 'File Brain identifies duplicate files by content, even if they have different names, helping you reclaim storage space.',
        icon: 'fa-solid fa-clone'
    },
    {
        title: 'Digitize Your Life',
        description: 'Take a photo of a document or whiteboard. File Brain\'s OCR makes the text inside searchable immediately.',
        icon: 'fa-solid fa-camera'
    },
    {
        title: 'Connect Knowledge',
        description: 'Researching a topic? Find connections between scattered documents and notes to build a complete picture.',
        icon: 'fa-solid fa-diagram-project'
    }
];

export const UseCases: React.FC = () => {
    return (
        <section id="use-cases" className="use-cases-section py-8" style={{ backgroundColor: 'var(--surface-section)' }}>
            <div className="landing-container">
                <div className="text-center mb-8">
                    <span className="font-bold uppercase tracking-widest text-sm" style={{ color: 'var(--primary-color)' }}>Real World Scenarios</span>
                    <h2 className="text-4xl md:text-5xl font-bold mt-2" style={{ color: 'var(--text-color)' }}>
                        How can <span style={{ color: 'var(--primary-color)' }}>File Brain</span> help you?
                    </h2>
                </div>
                <div className="grid">
                    {useCases.map((useCase, index) => (
                        <div key={index} className="col-12 md:col-6 p-4">
                            <div className="flex flex-column h-full border-round-xl p-5 shadow-2 bg-white transition-all transition-duration-300 hover:shadow-4 border-left-3" style={{ borderColor: 'var(--primary-color)' }}>
                                <div className="flex align-items-center mb-4">
                                    <div className="w-3rem h-3rem border-circle flex align-items-center justify-content-center mr-3" style={{ backgroundColor: 'var(--primary-color)', color: 'white' }}>
                                        <i className={`${useCase.icon} text-xl`}></i>
                                    </div>
                                    <h3 className="text-2xl font-bold m-0" style={{ color: 'var(--text-color)' }}>{useCase.title}</h3>
                                </div>
                                <p className="text-lg line-height-3 m-0" style={{ color: 'var(--text-color-secondary)' }}>
                                    {useCase.description}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};
