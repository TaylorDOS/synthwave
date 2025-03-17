import Image from "next/image";
import Renderer from "@/components/Renderer";
export default function Delorean() {
  return (
    <div className="flex flex-col overflow-hidden items-center justify-items-center font-[family-name:var(--font-geist-sans)]">
      <main>
        <Renderer />
      </main>
    </div>
  );
}
