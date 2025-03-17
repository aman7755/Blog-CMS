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
        media: {
          select: {
            url: true,
            type: true
          }
        }
      },
    });
    // Map Prisma enum values to lowercase for UI compatibility
    const mappedPosts = posts.map((post) => ({
      ...post,
      status: post.status.toLowerCase(),
      // Use first media item's URL as the featured image, or null if no media
      featuredImage: post.media[0]?.url || null
    }));
    return corsHeaders(NextResponse.json(mappedPosts));
  } catch (error) {
    return corsHeaders(
      NextResponse.json({ error: (error as Error).message }, { status: 500 })
    );
  }
}

// POST handler to create a new post
export async function POST(request: NextRequest) {
  try {
    const { 
      title, 
      content, 
      slug, 
      excerpt, 
      authorId, 
      media, 
      cardBlocks,
      metaTitle,
      metaDescription,
      featureImage,
      featureImageAlt 
    } = await request.json();
    
    console.log("API - POST - Creating new post with media:", media);
    console.log("API - POST - SEO data:", { metaTitle, metaDescription });
    console.log("API - POST - Feature image:", featureImage);
    
    // Log each image and its alt text
    media.forEach((item: any, index: number) => {
      if (item.type === "image") {
        console.log(`API - Image ${index} - url: ${item.url.substring(0, 50)}...`);
        console.log(`API - Image ${index} - alt: "${item.alt}"`);
      }
    });
    
    const post = await prisma.post.create({
      data: {
        title,
        content,
        slug,
        excerpt,
        authorId,
        metaTitle: metaTitle || title, // Use title as fallback
        metaDescription: metaDescription || excerpt, // Use excerpt as fallback
        featureImage: featureImage || null,
        featureImageAlt: featureImageAlt || '',
        media: {
          create: media.map((item: any) => {
            const mediaItem = {
              url: item.url,
              type: item.type,
              alt: item.alt || '',
            };
            console.log("API - Creating media item:", mediaItem);
            return mediaItem;
          }),
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
    return corsHeaders(
      NextResponse.json({ error: (error as Error).message }, { status: 500 })
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
            alt: item.alt || '',
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
    return corsHeaders(
      NextResponse.json({ error: (error as Error).message }, { status: 500 })
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
    return corsHeaders(NextResponse.json(post));
  } catch (error) {
    return corsHeaders(
      NextResponse.json({ error: (error as Error).message }, { status: 500 })
    );
  }
}
