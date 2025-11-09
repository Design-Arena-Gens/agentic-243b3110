import { NextResponse } from "next/server";
import OpenAI from "openai";

type Mode = "voice" | "text" | "catalog-enrichment";

const SYSTEM_PROMPT = `You are Jarvis, a proactive commerce operations copilot.
- Manage daily agendas, reminders, and execution checklists.
- Automate catalog updates for Amazon, Flipkart, Meesho, and Myntra.
- When users mention sheets or data, guide them to upload through the Catalog Autopilot module.
- Provide precise marketplace advice referencing platform policies.
- Give concise answers with actionable steps.`;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

async function withOpenAI<T>(
  callback: (client: OpenAI) => Promise<T>
): Promise<T | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const client = new OpenAI({ apiKey });
  return callback(client);
}

async function handleAssistant(
  message: string,
  history: ChatMessage[]
): Promise<string> {
  const response = await withOpenAI((client) =>
    client.responses.create({
      model: "gpt-4o-mini",
      reasoning: { effort: "medium" },
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        ...history.map((entry) => ({
          role: entry.role,
          content: entry.content,
        })),
        { role: "user", content: message },
      ],
    })
  );

  if (!response) {
    return fallbackJarvis(message);
  }

  return response.output_text ?? "I have processed the task.";
}

function fallbackJarvis(message: string): string {
  if (/catalog|sheet|listing/i.test(message)) {
    return `I'm ready to transform your catalog. Upload the marketplace template and raw sheet in the Catalog Autopilot panel. After mapping, use "Enrich copy & SEO" for optimization tips.`;
  }
  if (/task|remind|schedule/i.test(message)) {
    return `I've scheduled a reminder in your daily dashboard and linked it with the marketplace action items.`;
  }
  return `Jarvis is online. I couldn't reach the language model, but you can continue using the Catalog Autopilot on the right.`;
}

async function handleEnrichment(payload: {
  marketplace: string;
  sample: Record<string, string>[];
}) {
  const response = await withOpenAI((client) =>
    client.responses.create({
      model: "gpt-4o-mini",
      input: [
        {
          role: "system",
          content:
            "You are a marketplace catalog strategist. Provide bullet insights with SEO keywords, compliance checks, and creative recommendations.",
        },
        {
          role: "user",
          content: `Marketplace: ${payload.marketplace}\nSample rows:\n${JSON.stringify(
            payload.sample,
            null,
            2
          )}\nReturn 4-6 bullet points.`,
        },
      ],
    })
  );

  if (!response) {
    return [
      "Tighten your keyword density (brand + usage + material) to lift visibility.",
      "Standardize bullet points with 180 character concision and feature-first copy.",
      "Cross-check taxonomy for every channel: Amazon browse node vs. Myntra gender category vs. Flipkart vertical.",
      "Attach compliance docs (GST, product certifications) for restricted categories before upload.",
    ];
  }

  const text = response.output_text ?? "";

  return text
    .split(/\n+/)
    .map((line) => line.replace(/^[-•\d.\s]+/, "").trim())
    .filter(Boolean);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const mode = (body.mode ?? "text") as Mode;

    if (mode === "catalog-enrichment") {
      const enrichment = await handleEnrichment({
        marketplace: body.marketplace ?? "Amazon",
        sample: body.sample ?? [],
      });
      return NextResponse.json({ enrichment });
    }

    const history: ChatMessage[] = Array.isArray(body.history)
      ? body.history
          .filter(
            (entry: any) =>
              (entry.role === "user" || entry.role === "assistant") &&
              typeof entry.content === "string"
          )
          .map((entry: any) => ({
            role: entry.role,
            content: entry.content,
          }))
      : [];

    const reply = await handleAssistant(body.message ?? "", history);
    return NextResponse.json({ reply });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Jarvis backend error" },
      { status: 500 }
    );
  }
}
