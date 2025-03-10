import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(request) {
  try {
    const { title, content, slug, excerpt, authorId, media, cardBlocks } = await request.json();

    const post = await prisma.post.create({
      data: {
        title,
        content,
        slug,
        excerpt,
        authorId,
        media: {
          create: media.map((item) => ({
            url: item.url,
            type: item.type,
          })),
        },
        cardBlocks: {
          create: cardBlocks.map((item) => ({
            cardId: item.cardId,
            position: item.position,
          })),
        },
      },
    });

    return NextResponse.json(post);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}