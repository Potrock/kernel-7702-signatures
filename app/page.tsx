"use client";

import { ZeroXSwap } from "@/components/ZeroXSwap";
import { Zerodev } from "@/components/ZeroDev";
import { usePrivy } from "@privy-io/react-auth";

export default function Home() {
  const { ready, authenticated, user, login } = usePrivy();

  if (!ready) {
    return <div>Loading...</div>;
  }

  if (!authenticated) {
    return <div>
      <button onClick={() => login()}>Login</button>
    </div>;
  }
  return (
    <div>
      Address: {user?.wallet?.address}
      <Zerodev />
      <ZeroXSwap />
    </div>
  );
}
