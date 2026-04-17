"use client";

import dynamic from "next/dynamic";

const ContactSheet = dynamic(() => import("@/components/ContactSheet"), { ssr: false });

export default function Page() {
  return <ContactSheet />;
}
