import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// GET handler to fetch all posts
export async function GET(request: NextRequest) {
  try {
    const posts = await prisma.post.findMany({
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Map Prisma enum values to lowercase for UI compatibility
    const mappedPosts = posts.map((post) => ({
      ...post,
      status: post.status.toLowerCase(),
    }));

    return NextResponse.json(mappedPosts);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

// POST handler to create a new post
export async function POST(request: NextRequest) {
  try {
    const { title, content, slug, excerpt, authorId, media, cardBlocks } =
      await request.json();

    const post = await prisma.post.create({
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
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

// PUT handler to update an existing post
export async function PUT(request: NextRequest) {
  try {
    const { id, title, content, slug, excerpt, authorId, media, cardBlocks } =
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
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

// DELETE handler to remove a post
export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    const post = await prisma.post.delete({
      where: { id },
    });
    return NextResponse.json(post);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
