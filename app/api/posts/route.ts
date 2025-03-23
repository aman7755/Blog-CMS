import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const prisma = new PrismaClient();

// Helper function to add CORS headers to responses
function corsHeaders(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", "*");
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

// Helper function to validate user session and role
async function validateUserRole(allowedRoles: string[] = ['admin', 'editor']) {
  const session = await getServerSession(authOptions);
  
  if (!session || !session.user) {
    return { 
      isAuthorized: false, 
      error: "Unauthorized: You must be logged in", 
      status: 401 
    };
  }
  
  if (!session.user.isActive) {
    return { 
      isAuthorized: false, 
      error: "Unauthorized: Your account is inactive", 
      status: 403 
    };
  }
  
  if (!session.user.role || !allowedRoles.includes(session.user.role)) {
    return { 
      isAuthorized: false, 
      error: `Unauthorized: You need one of these roles: ${allowedRoles.join(', ')}`, 
      status: 403 
    };
  }
  
  return { isAuthorized: true, userId: session.user.id };
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
        featureImageAlt: true,
        featureImage: true,
        media: {
          select: {
            url: true,
            type: true,
          },
        },
      },
    });
    // Map Prisma enum values to lowercase for UI compatibility
    const mappedPosts = posts.map((post) => ({
      ...post,
      status: post.status.toLowerCase(),
      featuredImage: post.featureImage || "",
      featureImageAlt: post.featureImageAlt || "",
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
    // Validate user role
    const validation = await validateUserRole(['admin', 'editor']);
    if (!validation.isAuthorized) {
      return corsHeaders(
        NextResponse.json({ error: validation.error }, { status: validation.status })
      );
    }

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
      featureImageAlt,
      packageIds,
    } = await request.json();

    console.log("API - POST - Creating new post with media:", media);
    console.log("API - POST - SEO data:", { metaTitle, metaDescription });
    console.log("API - POST - Feature image:", featureImage);
    console.log("API - POST - Package IDs:", packageIds);

    // Log each image and its alt text
    media.forEach((item: any, index: number) => {
      if (item.type === "image") {
        console.log(
          `API - Image ${index} - url: ${item.url.substring(0, 50)}...`
        );
        console.log(`API - Image ${index} - alt: "${item.alt}"`);
      }
    });

    const post = await prisma.post.create({
      data: {
        title,
        content,
        slug,
        excerpt,
        authorId: authorId || validation.userId, // Use validated user ID if not provided
        metaTitle: metaTitle || title, // Use title as fallback
        metaDescription: metaDescription || excerpt, // Use excerpt as fallback
        featureImage: featureImage || null,
        featureImageAlt: featureImageAlt || "",
        packageIds: packageIds || [],
        media: {
          create: media.map((item: any) => {
            const mediaItem = {
              url: item.url,
              type: item.type,
              alt: item.alt || "",
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
    // Validate user role
    const validation = await validateUserRole(['admin', 'editor']);
    if (!validation.isAuthorized) {
      return corsHeaders(
        NextResponse.json({ error: validation.error }, { status: validation.status })
      );
    }

    const { id, title, content, slug, excerpt, authorId, media, cardBlocks, packageIds } =
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
        authorId: authorId || validation.userId, // Use validated user ID if not provided
        packageIds: packageIds || [],
        media: {
          create: media.map((item: any) => ({
            url: item.url,
            type: item.type,
            alt: item.alt || "",
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
    // Validate user role
    const validation = await validateUserRole(['admin']);
    if (!validation.isAuthorized) {
      return corsHeaders(
        NextResponse.json({ error: validation.error }, { status: validation.status })
      );
    }

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
