"use client";

import VoiceAgent from "@/components/VoiceAgent";
import CatalogAssistant from "@/components/CatalogAssistant";

export default function Home() {
  return (
    <main>
      <section className="panel">
        <div className="panel-title">
          <div className="pill">Jarvis Mode</div>
          <h1>Personal Commerce Command Center</h1>
        </div>
        <p style={{ color: "rgba(188, 215, 255, 0.75)", maxWidth: 820 }}>
          Speak naturally to orchestrate your daily agenda, delegate catalog
          updates for Amazon, Flipkart, Meesho, and Myntra, and keep a bird&apos;s
          eye view on marketplace performance. Upload your raw sheets and Jarvis
          will structure them into marketplace-ready catalogs.
        </p>
      </section>

      <section className="grid grid-2">
        <VoiceAgent />
        <CatalogAssistant />
      </section>
    </main>
  );
}
