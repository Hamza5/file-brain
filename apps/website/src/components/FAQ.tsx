"use client";
import React from "react";
import { Accordion, AccordionTab } from "primereact/accordion";
import { useSectionTracking } from "@/hooks/useSectionTracking";
import { SectionAnchor } from "@/components/SectionAnchor";

export const FAQ = () => {
  const sectionRef = useSectionTracking("faq");

  const faqs = [
    {
      question: "Is File Brain a subscription? / Do I own the software?",
      answer: "No, File Brain Pro is not a subscription. It comes with a perpetual license. You make a single one-time payment and you own that major version forever. Your purchase includes one year of auto-updates and priority support.",
    },
    {
      question: "What happens after my one year of updates expires?",
      answer: "You can continue to use the version of File Brain you already have indefinitely. If you want to receive new feature updates and continue getting priority support after the first year, you can choose to renew your updates package at a discounted rate.",
    },
    {
      question: "Are my files uploaded to the cloud or used to train AI models?",
      answer: "Absolutely not. File Brain is designed with privacy-first principles. All indexing, semantic processing, and OCR happen 100% locally on your machine. Your private data never leaves your computer, and we never use your data to train our models. (Note: The Cloud Connect tier connects to your personal cloud drives, but processing remains local/private to your environment).",
    },
    {
      question: "Do I need an active internet connection to use File Brain?",
      answer: "You only need an internet connection during the initial setup to download the underlying open-source search engine and AI models. After the initial setup, the Free and Knowledge Engine tiers work entirely offline. (The Cloud Connect tier requires an internet connection to access your cloud-hosted files).",
    },
    {
      question: "Which operating systems are supported?",
      answer: "File Brain is cross-platform and works on Windows, macOS, and Linux. It requires Docker and Python 3.11+ to be installed on your system.",
    },
    {
      question: "Can File Brain search text inside images and scanned PDFs?",
      answer: "Yes! File Brain features built-in Optical Character Recognition (OCR). This means you can search for text contained within screenshots, scanned documents, whiteboard photos, and other images just as easily as regular text documents.",
    },
    {
      question: "How does Semantic Search differ from regular search?",
      answer: "Traditional search relies on finding exact keyword matches. If you search for \"automobile\", it won't find a document that only uses the word \"car\". Semantic search uses AI to understand the meaning and context of your query, allowing you to find relevant documents even if the exact words don't match or if there are typos.",
    },
    {
      question: "What is the difference between text-based semantic search and visual semantic search?",
      answer: "Text-based semantic search (available partially in the Free version, and fully in the Knowledge Engine tier) understands the meaning of text in your documents, allowing you to find a document mentioning \"employee\" by searching for \"worker\". Visual semantic search (available in the Media Suite and Cloud Connect tiers) goes a step further by understanding the content of images and videos without any text or tags. It allows you to search for \"a person riding a bicycle\" and find matching images or video scenes, even if that description was never written down.",
    },
  ];

  return (
    <section
      id="faq"
      ref={sectionRef}
      className="py-8"
      style={{ backgroundColor: "var(--surface-section)" }}
    >
      <div className="landing-container max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 text-center" style={{ color: "var(--text-color)" }}>
            Frequently Asked <span style={{ color: "var(--primary-color)" }} className='ml-2'>Questions</span>
            <SectionAnchor id="faq" className="ml-3 active:scale-95" />
          </h2>
          <p className="text-xl mb-8" style={{ color: "var(--text-color-secondary)" }}>
            Everything you need to know about File Brain and how it works.
          </p>
        </div>

        <div className="card">
          <Accordion multiple activeIndex={[0]} className="faq-accordion">
            {faqs.map((faq, index) => (
              <AccordionTab
                key={index}
                header={
                  <span className="text-lg font-semibold">{faq.question}</span>
                }
              >
                <p className="m-0 line-height-3 text-lg" style={{ color: "var(--text-color-secondary)" }}>
                  {faq.answer.split('**').map((part, i) => i % 2 === 1 ? <strong key={i} style={{ color: "var(--text-color)" }}>{part}</strong> : part)}
                </p>
              </AccordionTab>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
};
