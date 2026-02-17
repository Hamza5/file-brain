'use client';
import React, { useEffect, useState } from 'react';
import { Avatar } from 'primereact/avatar';
import { AvatarGroup } from 'primereact/avatargroup';
import posthog from 'posthog-js';

interface Stargazer {
    id: number;
    login: string;
    avatar_url: string;
}

interface StarredItem {
    starred_at: string;
    user: Stargazer;
}

async function isDefaultAvatar(avatarUrl: string): Promise<boolean> {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                
                if (!ctx) {
                    resolve(false);
                    return;
                }
                
                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, img.width, img.height);
                const pixels = imageData.data;
                
                // Count unique colors (sample every 4th pixel for performance)
                const colors = new Set<string>();
                for (let i = 0; i < pixels.length; i += 16) { // RGBA, sample every 4th pixel
                    const r = pixels[i];
                    const g = pixels[i + 1];
                    const b = pixels[i + 2];
                    const a = pixels[i + 3];
                    // Only count opaque pixels
                    if (a > 200) {
                        colors.add(`${r},${g},${b}`);
                    }
                }
                
                // GitHub default avatars typically have very few colors (2-3)
                // Custom avatars usually have many more
                resolve(colors.size <= 5);
            } catch (error) {
                console.warn('Failed to analyze avatar:', error);
                resolve(false); // If we can't analyze, assume it's fine
            }
        };
        
        img.onerror = () => {
            resolve(false); // If image fails to load, assume it's fine
        };
        
        img.src = avatarUrl;
    });
}

export const GithubStars: React.FC = () => {
    const [stars, setStars] = useState<string>(process.env.NEXT_PUBLIC_GITHUB_STARS || '10+');
    const [stargazers, setStargazers] = useState<Stargazer[]>(() => {
        try {
            return JSON.parse(process.env.NEXT_PUBLIC_GITHUB_STARGAZERS || '[]');
        } catch {
            return [];
        }
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch repo data for real star count
                const repoRes = await fetch('https://api.github.com/repos/Hamza5/file-brain');
                let totalStars = 0;
                if (repoRes.ok) {
                    const repoData = await repoRes.json();
                    totalStars = repoData.stargazers_count;
                    setStars(totalStars.toLocaleString());
                }

                // Fetch latest stargazers with star date
                // The REST API returns stargazers in chronological order (oldest first)
                // To get the latest, we need to fetch from the last page
                const perPage = 30;
                const lastPage = Math.max(1, Math.ceil(totalStars / perPage));
                
                const stargazersRes = await fetch(`https://api.github.com/repos/Hamza5/file-brain/stargazers?per_page=${perPage}&page=${lastPage}`, {
                    headers: {
                        'Accept': 'application/vnd.github.v3.star+json'
                    }
                });

                if (stargazersRes.ok) {
                    const stargazersData: StarredItem[] = await stargazersRes.json();
                    
                    // Sort by starred_at descending to get the most recent first
                    const allStargazers = stargazersData
                        .sort((a, b) => new Date(b.starred_at).getTime() - new Date(a.starred_at).getTime())
                        .map(item => item.user)
                        .filter(user => user && user.avatar_url);

                    // Analyze avatars to filter out default ones
                    const customAvatars: Stargazer[] = [];
                    for (const user of allStargazers) {
                        if (customAvatars.length >= 5) break;
                        
                        const isDefault = await isDefaultAvatar(user.avatar_url);
                        if (!isDefault) {
                            customAvatars.push(user);
                        }
                    }

                    setStargazers(customAvatars);
                }
            } catch (error) {
                console.error('Failed to fetch GitHub data:', error);
            }
        };

        fetchData();
    }, []);

    const handleClick = () => {
        posthog.capture('cta_github_stars_clicked', {
            location: 'hero',
            star_count: stars
        });
    };

    return (
        <a 
            href="https://github.com/Hamza5/file-brain" 
            target="_blank" 
            rel="noopener noreferrer"
            onClick={handleClick}
            className="no-underline"
            style={{ display: 'block', maxWidth: 'fit-content' }}
        >
            <div className="flex align-items-center justify-content-center gap-3 py-2 px-3 rounded-pill transition-all transition-duration-300 hover:surface-100 cursor-pointer" 
                 style={{ 
                     backgroundColor: 'rgba(var(--primary-color-rgb), 0.05)', 
                     borderRadius: '2000px',
                     border: '1px solid var(--surface-border)',
                     maxWidth: 'fit-content'
                 }}>
                <AvatarGroup className="mr-1">
                    {stargazers.map((user, index) => (
                        <Avatar 
                            key={user.id} 
                            image={user.avatar_url} 
                            shape="circle" 
                            size="normal"
                            className="border-2 border-primary transition-all transition-duration-300 hover:z-5"
                            style={{ 
                                border: '2px solid var(--surface-card)', 
                                width: '36px', 
                                height: '36px',
                                marginLeft: index === 0 ? '0' : '-12px' // Controlled overlap
                            }}
                            onImageError={() => {
                                setStargazers(prev => prev.filter(u => u.id !== user.id));
                            }}
                        />
                    ))}
                    {stargazers.length === 0 && (
                         <Avatar icon="fa-solid fa-star" shape="circle" size="normal" style={{ backgroundColor: 'var(--primary-color)', color: 'white', width: '36px', height: '36px' }} />
                    )}
                </AvatarGroup>
                <div className="text-sm font-semibold flex align-items-center gap-2" style={{ color: 'var(--text-color-secondary)' }}>
                    <span className="flex align-items-center justify-content-center" style={{ color: 'var(--primary-color)' }}>
                        <i className="fa-solid fa-star text-xs"></i>
                    </span>
                    <span>Liked by <span style={{ color: 'var(--text-color)' }}>{stars}</span> users</span>
                </div>
            </div>
        </a>
    );
};
