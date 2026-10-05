"use client";

import { useRouter } from "next/navigation";
import LaunchModal from "@/components/LaunchModal";
import MarketCanvas from "@/components/market/MarketCanvas";
import Gate from "@/components/Gate";

export default function LaunchPage() {
  const router = useRouter();
  return (
    <Gate>
      <div className="pointer-events-none opacity-60 blur-[1px]">
        <MarketCanvas className="h-[70vh] border-[3px] border-black" />
      </div>
      <LaunchModal onClose={() => (window.history.length > 1 ? router.back() : router.push("/"))} />
    </Gate>
  );
}
