import { Hero } from "@/components/Hero";
import { Features } from "@/components/Features";
import { AppMockup } from "@/components/AppMockup";
import { Footer } from "@/components/Footer";
import { CTA } from "@/components/CTA";
import { UseCases } from "@/components/UseCases";
import { ProVersion } from "@/components/ProVersion";

export default function Home() {
  return (
    <main className="landing-page">
      <Hero />
      <AppMockup />
      <Features />
      <UseCases />
      <ProVersion />
      <CTA />
      <Footer />
    </main>
  );
}
