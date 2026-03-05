import fs from 'fs';
import path from 'path';
import Jimp from 'jimp';

async function isDefaultAvatar(avatarUrl) {
    try {
        // Fetch the image
        const response = await fetch(avatarUrl);
        if (!response.ok) return false;
        
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Load image with jimp
        const image = await Jimp.read(buffer);
        
        // Count unique colors (sample every 4th pixel for performance)
        const colors = new Set();
        const width = image.bitmap.width;
        const height = image.bitmap.height;
        
        for (let y = 0; y < height; y += 2) {
            for (let x = 0; x < width; x += 2) {
                const idx = (width * y + x) << 2;
                const r = image.bitmap.data[idx];
                const g = image.bitmap.data[idx + 1];
                const b = image.bitmap.data[idx + 2];
                const a = image.bitmap.data[idx + 3];
                
                // Only count opaque pixels
                if (a > 200) {
                    colors.add(`${r},${g},${b}`);
                }
            }
        }
        
        // GitHub default avatars typically have very few colors (2-3)
        // Custom avatars usually have many more
        return colors.size <= 5;
    } catch (error) {
        console.warn(`Failed to analyze avatar ${avatarUrl}:`, error.message);
        return false; // If we can't analyze, assume it's fine
    }
}

function updateEnvFile(envValues) {
    const envPath = path.join(process.cwd(), '.env.production');
    let content = '';
    if (fs.existsSync(envPath)) {
        content = fs.readFileSync(envPath, 'utf8');
    }

    for (const [key, value] of Object.entries(envValues)) {
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`^${escapedKey}=.*$`, 'm');
        const newLine = `${key}=${value}`;
        
        if (regex.test(content)) {
            content = content.replace(regex, newLine);
        } else {
            content += (content.endsWith('\n') || content === '' ? '' : '\n') + newLine + '\n';
        }
    }
    
    fs.writeFileSync(envPath, content);
}

async function fetchGitHubStars() {
    console.log('Fetching GitHub star count and stargazers...');
    const [owner, name] = 'Hamza5/file-brain'.split('/');
    const url = 'https://api.github.com/graphql';
    const token = process.env.GITHUB_TOKEN;

    if (!token) {
        console.warn('GITHUB_TOKEN not found, skipping GraphQL fetch');
        updateEnvFile({
            'NEXT_PUBLIC_GITHUB_STARS': '"20+"',
            'NEXT_PUBLIC_GITHUB_STARGAZERS': '"[]"'
        });
        return;
    }

    const query = `
        query($owner: String!, $name: String!) {
          repository(owner: $owner, name: $name) {
            stargazerCount
            stargazers(last: 50) {
              edges {
                starredAt
                node {
                  login
                  name
                  avatarUrl
                  databaseId
                }
              }
            }
          }
        }
    `;


    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query,
                variables: { owner, name }
            })
        });

        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        if (result.errors) {
            console.error('GraphQL Errors:', JSON.stringify(result.errors, null, 2));
            throw new Error('GitHub GraphQL error');
        }

        if (!result.data || !result.data.repository) {
            console.error('Unexpected response structure:', JSON.stringify(result, null, 2));
            throw new Error('Unexpected GitHub API response structure');
        }

        const repo = result.data.repository;
        const stars = repo.stargazerCount;
        
        let approxStars = '';
        if (stars >= 1000) {
            approxStars = (stars / 1000).toFixed(1) + 'K+';
        } else {
            // Round down to the nearest 10 (e.g. 85 becomes 80+)
            const roundedStars = Math.floor(stars / 10) * 10;
            approxStars = `${roundedStars}+`;
        }

        // Filter stargazers: latest first, excluding GitHub default avatars
        // We analyze the actual image to detect simple 2-color default avatars
        const allStargazers = repo.stargazers.edges
            .map(edge => ({
                id: edge.node.databaseId,
                login: edge.node.login,
                name: edge.node.name,
                avatar_url: edge.node.avatarUrl,
                starred_at: edge.starredAt
            }))
            .sort((a, b) => new Date(b.starred_at).getTime() - new Date(a.starred_at).getTime());

        // Analyze avatars to filter out default ones
        const latestStargazers = [];
        for (const user of allStargazers) {
            if (latestStargazers.length >= 7) break;
            
            if (user.avatar_url) {
                const isDefault = await isDefaultAvatar(user.avatar_url);
                if (!isDefault) {
                    latestStargazers.push({
                        id: user.id,
                        login: user.login,
                        name: user.name,
                        avatar_url: user.avatar_url
                    });
                }
            }
        }

        console.log(`Found ${stars} stars and ${latestStargazers.length} valid stargazers.`);

        updateEnvFile({
            'NEXT_PUBLIC_GITHUB_STARS': `"${approxStars}"`,
            'NEXT_PUBLIC_GITHUB_STARGAZERS': `'${JSON.stringify(latestStargazers)}'`
        });
        console.log(`Successfully updated .env.production`);

    } catch (error) {
        console.error('Failed to fetch GitHub data:', error);
        updateEnvFile({
            'NEXT_PUBLIC_GITHUB_STARS': '"many"',
            'NEXT_PUBLIC_GITHUB_STARGAZERS': '"[]"'
        });
    }
}

fetchGitHubStars();
