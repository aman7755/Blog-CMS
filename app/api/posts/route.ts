import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getServerSession, getSession } from "@/lib/auth";
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
async function validateUserRole(allowedRoles: string[] = ["admin", "editor"]) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return {
      isAuthorized: false,
      error: "Unauthorized: You must be logged in",
      status: 401,
    };
  }

  if (!session.user.isActive) {
    return {
      isAuthorized: false,
      error: "Unauthorized: Your account is inactive",
      status: 403,
    };
  }

  if (!session.user.role || !allowedRoles.includes(session.user.role)) {
    return {
      isAuthorized: false,
      error: `Unauthorized: You need one of these roles: ${allowedRoles.join(
        ", "
      )}`,
      status: 403,
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
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        media: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return corsHeaders(NextResponse.json(posts));
  } catch (error) {
    console.error("Error fetching posts:", error);
    return corsHeaders(
      NextResponse.json(
        { error: "Internal Server Error", posts: [] },
        { status: 500 }
      )
    );
  }
}

// POST handler to create a new post
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session || !session.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
      });
    }

    // Check if user has appropriate role to create posts
    const allowedRoles = ["admin", "editor", "author"];
    if (!allowedRoles.includes(session.user.role)) {
      return new Response(
        JSON.stringify({
          error: "You don't have permission to create posts",
        }),
        { status: 403 }
      );
    }

    const data = await request.json();

    // Set initial status based on user role
    // Admins and editors can create posts with any status
    // Authors can only create drafts
    let status = data.status || "DRAFT";

    if (session.user.role === "author" && status !== "DRAFT") {
      // Force author-created posts to be drafts
      status = "DRAFT";
    }

    // Generate a slug from the title if not provided
    const slug =
      data.slug ||
      data.title
        .toLowerCase()
        .replace(/[^\w\s]/gi, "")
        .replace(/\s+/g, "-");

    // Create the post
    const post = await prisma.post.create({
      data: {
        title: data.title,
        content: data.content,
        slug: slug,
        status: status,
        excerpt: data.excerpt || data.content.substring(0, 157) + "...",
        authorId: session.user.id, // Always use the current user's ID
        metaTitle: data.metaTitle || data.title,
        metaDescription: data.metaDescription || data.excerpt,
        featureImage: data.featureImage || null,
        featureImageAlt: data.featureImageAlt || "",
      },
    });

    // Handle media associations if provided
    if (data.media && Array.isArray(data.media)) {
      for (const item of data.media) {
        await prisma.postMedia.create({
          data: {
            postId: post.id,
            url: item.url,
            type: item.type,
            alt: item.alt || "",
          },
        });
      }
    }

    // Handle card blocks if provided
    if (data.cardBlocks && Array.isArray(data.cardBlocks)) {
      for (const block of data.cardBlocks) {
        await prisma.postCardBlock.create({
          data: {
            postId: post.id,
            cardId: block.cardId,
            position: block.position,
          },
        });
      }
    }

    return new Response(JSON.stringify(post), {
      status: 201,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error creating post:", error);
    return new Response(
      JSON.stringify({
        error: (error as Error).message || "Internal Server Error",
      }),
      { status: 500 }
    );
  }
}

// PUT handler to update an existing post
export async function PUT(request: NextRequest) {
  try {
    // Validate user role
    const validation = await validateUserRole(["admin", "editor"]);
    if (!validation.isAuthorized) {
      return corsHeaders(
        NextResponse.json(
          { error: validation.error },
          { status: validation.status }
        )
      );
    }

    const {
      id,
      title,
      content,
      slug,
      excerpt,
      authorId,
      media,
      cardBlocks,
      packageIds,
    } = await request.json();
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
    const validation = await validateUserRole(["admin"]);
    if (!validation.isAuthorized) {
      return corsHeaders(
        NextResponse.json(
          { error: validation.error },
          { status: validation.status }
        )
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
