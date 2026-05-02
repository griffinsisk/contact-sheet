import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import sharp from "sharp";
import { callProvider } from "@/lib/providers";

export const runtime = "nodejs";
export const maxDuration = 30;

const DESCRIBE_PROMPT = `You're labeling a photo for a future-cull memory of one photographer's overrides. Describe the frame in 12–20 words: what's in it, the light, the composition. Concrete, no editorializing, no marketing language. One sentence, no period at the end.

Examples:
- Indoor bedroom scene, warm window light, unmade bed, no human subject, tight crop
- Adult lion portrait, golden hour, heavy foreground vegetation partially obscuring face
- Two people seated at cafe table, backlit, candid mid-conversation, shallow depth

Respond with ONLY the description. No preamble, no quotes, no markdown.`;

function decodeBase64Image(image: string): { buffer: Buffer; mediaType: string } | null {
  const dataUrlMatch = image.match(/^data:(image\/[a-zA-Z+]+);base64,(.*)$/);
  const b64 = dataUrlMatch ? dataUrlMatch[2] : image;
  const mediaType = dataUrlMatch ? dataUrlMatch[1].replace("image/jpg", "image/jpeg") : "image/jpeg";
  try {
    const buffer = Buffer.from(b64, "base64");
    if (buffer.length === 0) return null;
    return { buffer, mediaType };
  } catch {
    return null;
  }
}

async function resizeTo512(image: string): Promise<{ base64: string; mediaType: string } | null> {
  const decoded = decodeBase64Image(image);
  if (!decoded) return null;
  const buf = await sharp(decoded.buffer)
    .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return { base64: buf.toString("base64"), mediaType: "image/jpeg" };
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const user = await currentUser();
  const isPro = user?.publicMetadata?.tier === "pro";
  if (!isPro) {
    return NextResponse.json({ error: "Pro tier required" }, { status: 403 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server misconfigured: ANTHROPIC_API_KEY not set" },
      { status: 500 },
    );
  }
  const model = process.env.ANTHROPIC_DESCRIBE_MODEL || "claude-haiku-4-5-20251001";

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body?.image !== "string" || body.image.length === 0) {
    return NextResponse.json({ error: "Body must include image (base64)" }, { status: 400 });
  }

  const resized = await resizeTo512(body.image);
  if (!resized) {
    return NextResponse.json({ error: "Image failed to decode" }, { status: 400 });
  }

  try {
    const res = await callProvider("anthropic", apiKey, model, {
      system: DESCRIBE_PROMPT,
      images: [resized],
      textParts: ["[Photo]"],
      maxTokens: 80,
      cacheSystem: false,
    });
    const description = res.text.trim().replace(/^["'`]+|["'`]+$/g, "");
    if (!description) {
      return NextResponse.json({ error: "Empty description" }, { status: 502 });
    }
    return NextResponse.json({ description });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Upstream error" },
      { status: 502 },
    );
  }
}
