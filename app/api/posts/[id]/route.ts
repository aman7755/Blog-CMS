import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    return NextResponse.json(post);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
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

    return NextResponse.json(post);
  } catch (error) {
    console.error("Error updating post:", error); // Debug log
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
