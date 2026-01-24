'use client';
import { useEffect, useRef } from 'react';
import posthog from 'posthog-js';

export const useSectionTracking = (sectionName: string) => {
    const sectionRef = useRef<HTMLElement>(null);
    const trackedRef = useRef(false);

    useEffect(() => {
        const currentRef = sectionRef.current;
        if (!currentRef || trackedRef.current) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting && !trackedRef.current) {
                        posthog.capture('section_viewed', {
                            section_name: sectionName
                        });
                        trackedRef.current = true;
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.2 } // 20% of the section must be visible to count
        );

        observer.observe(currentRef);

        return () => {
            if (currentRef) {
                observer.unobserve(currentRef);
            }
        };
    }, [sectionName]);

    return sectionRef;
};
