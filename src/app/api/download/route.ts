import path from "node:path";
import { zipFolder } from "@/lib/zip";

// The Chrome extension and the Claude skill, zipped on request, for the Claude setup page.
const FILES = {
  // Unzipped, this is the folder Chrome's "Load unpacked" wants: manifest.json at the top.
  extension: { dir: "extension", prefix: "", name: "atlas-deep-research-extension.zip" },
  // Claude's skill upload wants the skill folder itself at the top of the zip.
  skill: { dir: path.join("claude-skill", "atlas-stock-research"), prefix: "atlas-stock-research/", name: "atlas-stock-research-skill.zip" },
} as const;

export async function GET(req: Request) {
  const which = new URL(req.url).searchParams.get("file") ?? "";
  if (!Object.hasOwn(FILES, which)) return Response.json({ error: "Unknown download." }, { status: 404 });
  const f = FILES[which as keyof typeof FILES];
  const zip = zipFolder(path.join(process.cwd(), f.dir), f.prefix);
  return new Response(new Uint8Array(zip), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${f.name}"`, "Cache-Control": "no-store" },
  });
}
