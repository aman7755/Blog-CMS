import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// Helper function to add CORS headers to responses
function corsHeaders(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", "*"); // Or specific origin like 'http://localhost:4200'
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  return response;
}

// Handle OPTIONS requests for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return corsHeaders(new NextResponse(null, { status: 200 }));
}

// GET handler to fetch a post by ID
export async function GET(request: NextRequest, { params }: any) {
  try {
    const { id } = params;
    console.log("API fetching post with id:", id); // Debug log
    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        media: true,
        cardBlocks: {
          orderBy: { position: "asc" },
        },
      },
    });
    if (!post)
      return corsHeaders(
        NextResponse.json({ error: "Post not found" }, { status: 404 })
      );
    return corsHeaders(NextResponse.json(post));
  } catch (error) {
    return corsHeaders(
      NextResponse.json({ error: (error as Error).message }, { status: 500 })
    );
  }
}

// PUT handler to update a post by ID
export async function PUT(request: NextRequest, { params }: any) {
  try {
    const { id } = params;
    const { title, content, slug, excerpt, authorId, media, cardBlocks } =
      await request.json();
    // Delete existing media and card blocks
    await prisma.postMedia.deleteMany({ where: { postId: id } });
    await prisma.postCardBlock.deleteMany({ where: { postId: id } });
    const post = await prisma.post.update({
      where: { id },
      data: {
        title,
        content,
        slug,
        excerpt,
        authorId,
        media: {
          create: media.map((item: any) => ({
            url: item.url,
            type: item.type,
          })),
        },
        cardBlocks: {
          create: cardBlocks.map((item: any) => ({
            cardId: item.cardId,
            position: item.position,
          })),
        },
      },
    });
    return corsHeaders(NextResponse.json(post));
  } catch (error) {
    console.error("Error updating post:", error); // Debug log
    return corsHeaders(
      NextResponse.json({ error: (error as Error).message }, { status: 500 })
    );
  }
}
