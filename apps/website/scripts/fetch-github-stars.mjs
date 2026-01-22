import fs from 'fs';
import path from 'path';

async function fetchGitHubStars() {
    console.log('Fetching GitHub star count and stargazers...');
    const [owner, name] = 'Hamza5/file-brain'.split('/');
    const url = 'https://api.github.com/graphql';
    const token = process.env.GITHUB_TOKEN;

    if (!token) {
        console.warn('GITHUB_TOKEN not found, skipping GraphQL fetch');
        // Minimal fallback for local dev without token
        const envPath = path.join(process.cwd(), '.env.production');
        fs.appendFileSync(envPath, 'NEXT_PUBLIC_GITHUB_STARS="20+"\n');
        fs.appendFileSync(envPath, 'NEXT_PUBLIC_GITHUB_STARGAZERS="[]"\n');
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
                  isDefaultAvatar
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
        const repo = result.data.repository;
        const stars = repo.stargazerCount;
        
        let formattedStars = stars.toString();
        if (stars >= 1000) {
            formattedStars = (stars / 1000).toFixed(1) + 'K';
        }
        const approxStars = `${formattedStars}+`;

        // Filter stargazers: latest first, and skip default avatars
        const latestStargazers = repo.stargazers.edges
            .map(edge => ({
                login: edge.node.login,
                avatar_url: edge.node.avatarUrl,
                starred_at: edge.starredAt,
                is_default: edge.node.isDefaultAvatar
            }))
            .filter(user => !user.is_default)
            .sort((a, b) => new Date(b.starred_at).getTime() - new Date(a.starred_at).getTime())
            .slice(0, 5)
            .map(({ login, avatar_url }) => ({ login, avatar_url }));

        console.log(`Found ${stars} stars and ${latestStargazers.length} valid stargazers.`);

        const envPath = path.join(process.cwd(), '.env.production');
        const envContent = [
            `NEXT_PUBLIC_GITHUB_STARS="${approxStars}"`,
            `NEXT_PUBLIC_GITHUB_STARGAZERS='${JSON.stringify(latestStargazers)}'`
        ].join('\n') + '\n';
        
        fs.appendFileSync(envPath, envContent);
        console.log(`Successfully wrote to ${envPath}`);

    } catch (error) {
        console.error('Failed to fetch GitHub data:', error);
        const envPath = path.join(process.cwd(), '.env.production');
        fs.appendFileSync(envPath, 'NEXT_PUBLIC_GITHUB_STARS="10+"\nNEXT_PUBLIC_GITHUB_STARGAZERS="[]"\n');
    }
}

fetchGitHubStars();
