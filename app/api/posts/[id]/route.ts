import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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
    // Validate user role
    const validation = await validateUserRole(['admin', 'editor']);
    if (!validation.isAuthorized) {
      return corsHeaders(
        NextResponse.json({ error: validation.error }, { status: validation.status })
      );
    }
    
    const { id } = params;
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
      packageIds
    } = await request.json();
    
    console.log("API - PUT - Updating post with SEO data:", { metaTitle, metaDescription });
    console.log("API - PUT - Feature image:", featureImage);
    console.log("API - PUT - Package IDs:", packageIds);
    
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
        metaTitle: metaTitle || title, // Use title as fallback
        metaDescription: metaDescription || excerpt, // Use excerpt as fallback
        featureImage: featureImage || null,
        featureImageAlt: featureImageAlt || '',
        packageIds: packageIds || [],
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
    console.error("Error updating post:", error); // Debug log
    return corsHeaders(
      NextResponse.json({ error: (error as Error).message }, { status: 500 })
    );
  }
}

// DELETE handler to delete a post by ID
export async function DELETE(request: NextRequest, { params }: any) {
  try {
    // Validate user role - only admin can delete
    const validation = await validateUserRole(['admin']);
    if (!validation.isAuthorized) {
      return corsHeaders(
        NextResponse.json({ error: validation.error }, { status: validation.status })
      );
    }
    
    const { id } = params;
    
    // First delete related media and card blocks (should happen automatically with cascade)
    await prisma.postMedia.deleteMany({ where: { postId: id } });
    await prisma.postCardBlock.deleteMany({ where: { postId: id } });
    
    // Then delete the post
    const post = await prisma.post.delete({
      where: { id },
    });
    
    return corsHeaders(NextResponse.json({ message: "Post deleted successfully" }));
  } catch (error) {
    console.error("Error deleting post:", error); // Debug log
    return corsHeaders(
      NextResponse.json({ error: (error as Error).message }, { status: 500 })
    );
  }
}
