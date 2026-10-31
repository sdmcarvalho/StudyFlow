import { NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/auth-response";
import { listStudyTestSummaries } from "@/features/cards/queries";

export async function GET() {
  try {
    return NextResponse.json(await listStudyTestSummaries());
  } catch (error) {
    const response = authErrorResponse(error);
    if (response) return response;
    console.error("Failed to load studies for tests:", error);
    return NextResponse.json({ error: "Failed to load studies" }, { status: 500 });
  }
}