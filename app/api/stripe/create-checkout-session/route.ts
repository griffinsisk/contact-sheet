import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function POST(req: Request) {
  const { user } = await withAuth();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    return NextResponse.json({ error: "STRIPE_PRICE_ID not configured" }, { status: 500 });
  }

  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const email = user.email;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/?upgraded=1`,
    cancel_url: `${origin}/`,
    client_reference_id: user.id,
    customer_email: email ?? undefined,
    metadata: { workosUserId: user.id },
    subscription_data: { metadata: { workosUserId: user.id } },
  });

  if (!session.url) {
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
  return NextResponse.json({ url: session.url });
}
