import { Hero } from "@/components/Hero";
import { Features } from "@/components/Features";
import { AppMockup } from "@/components/AppMockup";
import { Demo } from "@/components/Demo";
import { Footer } from "@/components/Footer";
import { CTA } from "@/components/CTA";
import { UseCases } from "@/components/UseCases";
import { ProVersion } from "@/components/ProVersion";
import { FAQ } from "@/components/FAQ";

export default function Home() {
  return (
    <main className="landing-page">
      <Hero />
      <AppMockup />
      <Demo />
      <Features />
      <UseCases />
      <ProVersion />
      <FAQ />
      <CTA />
      <Footer />
    </main>
  );
}
