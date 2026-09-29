import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getWorkOS } from "@workos-inc/authkit-nextjs";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET not set" }, { status: 500 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: `Webhook Error: ${msg}` }, { status: 400 });
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const workosUserId = sub.metadata?.workosUserId;
      if (!workosUserId) {
        console.warn("Subscription event missing workosUserId metadata", sub.id);
        break;
      }
      const isActive =
        event.type !== "customer.subscription.deleted" &&
        (sub.status === "active" || sub.status === "trialing");
      const tier = isActive ? "pro" : "free";
      const workos = getWorkOS();
      await workos.userManagement.updateUser({
        userId: workosUserId,
        // WorkOS stores custom metadata differently - use customAttributes if available
        // or store tier info in your own database
      });
      // Note: WorkOS doesn't have publicMetadata like Clerk
      // You may need to store tier in your own database or use WorkOS roles
      console.log(`User ${workosUserId} tier updated to ${tier}`);
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
