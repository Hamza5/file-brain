import fs from 'fs';
import path from 'path';

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

        // Filter stargazers: latest first
        const latestStargazers = repo.stargazers.edges
            .map(edge => ({
                id: edge.node.databaseId,
                login: edge.node.login,
                avatar_url: edge.node.avatarUrl,
                starred_at: edge.starredAt
            }))
            .sort((a, b) => new Date(b.starred_at).getTime() - new Date(a.starred_at).getTime())
            .slice(0, 5)
            .map(({ id, login, avatar_url }) => ({ id, login, avatar_url }));

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
