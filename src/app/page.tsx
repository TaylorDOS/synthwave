import Image from "next/image";
import Visualizer from "@/components/Visualizer";
import CarVisualizer from "@/components/CarVisualizer";
export default function Home() {
  return (
    <div className="flex flex-col overflow-hidden items-center justify-items-center font-[family-name:var(--font-geist-sans)]">
      <main>
        <Visualizer />
      </main>
    </div>
  );
}
