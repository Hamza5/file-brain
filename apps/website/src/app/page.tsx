import { Hero } from "@/components/Hero";
import { Features } from "@/components/Features";
import { AppMockup } from "@/components/AppMockup";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <main className="landing-page">
      <Hero />
      <AppMockup />
      <Features />
      <Footer />
    </main>
  );
}
