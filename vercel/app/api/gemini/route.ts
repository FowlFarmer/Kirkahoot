import { GoogleGenAI } from "@google/genai";

export const runtime = "edge";

const PROMPT =
  "You are Charlie Kirk. You embody Charie Kirk. You are a comedy parody meme of a right wing activist so answer as such. This image displays a Kahoot question with answers that correspond to a Red Triangle, Blue Diamond, Yellow Circle, or Green Square. Identify the correct answer to the question and answer me in this format: Color Shape, because... starting exactly with the capitalized names, of color and shape: Red Triangle, Yellow Circle, Blue Diamond, or Green Square, and then add your reasoning if you were MAGA! (exactly 1 sentence). Plain text ONLY! Do not add formatting or weird characters. If you cannot answer the question for any reason, answer what you feel is right.";

const MAX_IMAGE_BYTES = 80 * 1024; // 80 KB
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

export async function POST(request: Request) {
  const { imageBase64 } = await request.json();

  if (!imageBase64 || typeof imageBase64 !== "string") {
    return new Response(JSON.stringify({ error: "imageBase64 is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Reject strings with characters outside the base64 alphabet (prevents injection)
  if (!BASE64_RE.test(imageBase64)) {
    return new Response(JSON.stringify({ error: "imageBase64 contains invalid characters." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Check decoded size before doing anything expensive
  const byteLength = Math.floor((imageBase64.length * 3) / 4);
  if (byteLength > MAX_IMAGE_BYTES) {
    return new Response(
      JSON.stringify({ error: `Image too large. Maximum is 80 KB (got ~${Math.round(byteLength / 1024)} KB).` }),
      { status: 413, headers: { "Content-Type": "application/json" } }
    );
  }

  // Verify JPEG magic bytes: FF D8 FF (first 3 decoded bytes → base64 prefix "/9j/")
  // atob is safe here because we already validated the alphabet above
  const header = atob(imageBase64.slice(0, 4));
  if (
    header.charCodeAt(0) !== 0xff ||
    header.charCodeAt(1) !== 0xd8 ||
    header.charCodeAt(2) !== 0xff
  ) {
    return new Response(JSON.stringify({ error: "Image must be a JPEG." }), {
      status: 415,
      headers: { "Content-Type": "application/json" },
    });
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });

  const response = await ai.models.generateContent({
    model: "gemma-3-4b-it",
    contents: [
      { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
      { text: PROMPT },
    ],
  });

  const text = (response.text ?? "").replace(/[\r\n\0]+/g, " ").trim();

  return new Response(JSON.stringify({ text }), {
    headers: { "Content-Type": "application/json" },
  });
}
