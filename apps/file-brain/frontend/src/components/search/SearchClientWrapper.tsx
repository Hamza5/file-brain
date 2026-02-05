import { useEffect, useState } from 'react';
import TypesenseInstantSearchAdapter from 'typesense-instantsearch-adapter';
import { InstantSearch, Configure } from 'react-instantsearch';
import { useSearch } from '../../context/SearchContext';
import { getAppConfig } from '../../api/client';

interface SearchClientWrapperProps {
    children: React.ReactNode;
}

export const SearchClientWrapper: React.FC<SearchClientWrapperProps> = ({ children }) => {
    const { searchMode, fuzzySearchEnabled } = useSearch();
    const [searchClient, setSearchClient] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const initClient = async () => {
            setError(null);
            try {
                const config = await getAppConfig();

                // Build query_by and exclude_fields based on search mode
                let queryBy: string;
                let excludeFields: string = 'embedding';
                
                switch (searchMode) {
                    case 'full-text':
                        queryBy = 'file_path,content,title,description,subject,keywords,author,comments,producer,application';
                        break;
                    case 'semantic':
                        queryBy = 'embedding';
                        break;
                    case 'hybrid':
                    default:
                        queryBy = 'file_path,content,title,description,subject,keywords,author,comments,producer,application,embedding';
                        break;
                }

                // Build additional search parameters
                const additionalSearchParameters: Record<string, any> = {
                    query_by: queryBy,
                    group_by: 'file_path',
                    group_limit: 1,
                    per_page: 24,
                };

                // Only add exclude_fields if it's not empty
                if (excludeFields) {
                    additionalSearchParameters.exclude_fields = excludeFields;
                }

                // Add fuzzy search parameters only for full-text and hybrid modes
                if (searchMode !== 'semantic' && !fuzzySearchEnabled) {
                    additionalSearchParameters.num_typos = 0;
                    additionalSearchParameters.typo_tokens_threshold = 0;
                }

                const typesenseInstantsearchAdapter = new TypesenseInstantSearchAdapter({
                    server: {
                        apiKey: config.typesense.api_key,
                        nodes: [
                            {
                                host: config.typesense.host,
                                port: config.typesense.port,
                                path: '',
                                protocol: config.typesense.protocol,
                            },
                        ],
                        cacheSearchResultsForSeconds: 0,
                        connectionTimeoutSeconds: 30,
                    },
                    additionalSearchParameters,
                });

                setSearchClient(typesenseInstantsearchAdapter.searchClient);
            } catch (err) {
                console.error('Failed to initialize search client:', err);
                setError(err instanceof Error ? err.message : String(err));
                // Retry after a delay
                setTimeout(initClient, 3000);
            }
        };

        initClient();
    }, [searchMode, fuzzySearchEnabled]);

    if (!searchClient) {
        return null; // Parent component handles loading state
    }

    if (error) {
        return null; // Parent component handles error state
    }

    return (
        <InstantSearch
            indexName="files"
            searchClient={searchClient}
            future={{ preserveSharedStateOnUnmount: true }}
        >
            <Configure hitsPerPage={24} />
            {children}
        </InstantSearch>
    );
};
