import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getServerSession } from "@/lib/auth";

const prisma = new PrismaClient();

// GET /api/posts/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Add CORS headers
    const headers = {
      'Access-Control-Allow-Origin': '*', // Be more restrictive in production
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': 'application/json',
    };

    // Handle OPTIONS request for CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers, status: 200 });
    }

    const post = await prisma.post.findUnique({
      where: { id: params.id },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        media: true,
        cardBlocks: true,
      },
    });

    if (!post) {
      return new Response(JSON.stringify({ error: "Post not found" }), {
        status: 404,
        headers,
      });
    }

    return new Response(JSON.stringify(post), {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("Error fetching post:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
    });
  }
}

// PUT /api/posts/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get user from session
    const session = await getServerSession();
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const {
      title,
      content,
      slug,
      status,
      excerpt,
      authorId,
      metaTitle,
      metaDescription,
      featureImage,
      featureImageAlt,
      media,
      cardBlocks,
      packageIds,
    } = body;

    // Log the media items received for debugging
    console.log(
      `API: Received ${media?.length ?? 0} media items with alt text`
    );
    if (media && media.length > 0) {
      media.forEach((item: any, index: number) => {
        console.log(
          `API: Media item #${index}: url=${item.url}, alt="${item.alt}"`
        );
      });
    }

    // Get post to verify ownership
    const post = await prisma.post.findUnique({
      where: { id: params.id },
      include: {
        author: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
        media: true, // Include current media items to compare
      },
    });

    if (!post) {
      return Response.json({ error: "Post not found" }, { status: 404 });
    }

    // Check if user is author of the post, an admin, or an editor
    const isAuthor = post.authorId === session.user.id;
    const isAdminOrEditor =
      session.user.role === "admin" || session.user.role === "editor";
    if (!isAuthor && !isAdminOrEditor) {
      return Response.json(
        { error: "You can only edit your own posts" },
        { status: 403 }
      );
    }

    // Only editors and admins can publish or archive posts
    if (
      !isAdminOrEditor &&
      status &&
      (status === "PUBLISHED" || status === "ARCHIVED")
    ) {
      return Response.json(
        { error: "Only editors and admins can publish or archive posts" },
        { status: 403 }
      );
    }

    // Prepare updated media items with proper validation
    let mediaToUpdate: { url: string; type: string; alt: string; }[] = [];
    if (media && Array.isArray(media)) {
      // Filter out any items with empty URLs
      mediaToUpdate = media
        .filter((item: { url?: string }) => item.url && item.url.trim() !== "")
        .map((item: { url: string; type?: string; alt?: string }) => ({
          url: item.url,
          type: item.type || "image",
          alt: item.alt || "", // Ensure alt text is saved
        }));
    }

    // Check if media has actually changed to avoid unnecessary DB operations
    let mediaChanged = true;

    if (post.media.length === mediaToUpdate.length) {
      // Simple check - if count is the same, do deeper comparison
      const existingUrls = new Set(post.media.map((m) => m.url));
      const newUrls = new Set(mediaToUpdate.map((m) => m.url));

      // If all URLs are the same, check if alt texts are different
      if (
        existingUrls.size === newUrls.size &&
        Array.from(existingUrls).every((url) => newUrls.has(url))
      ) {
        // Check if any alt texts have changed
        const altChanged = post.media.some((existing) => {
          const matchingNew = mediaToUpdate.find((m) => m.url === existing.url);
          return matchingNew && matchingNew.alt !== existing.alt;
        });

        if (!altChanged) {
          mediaChanged = false;
          console.log("API: Media unchanged, skipping media update");
        }
      }
    }

    // Prepare card blocks for Prisma
    let cardBlocksToCreate: { cardId: string; position: number; }[] = [];
    if (cardBlocks && Array.isArray(cardBlocks)) {
      cardBlocksToCreate = cardBlocks.map((block: { cardId: string; position?: number }) => ({
        cardId: block.cardId,
        position: block.position || 0,
      }));
    }

    // Then update the post
    const updatedPost = await prisma.post.update({
      where: { id: params.id },
      data: {
        title,
        content,
        slug,
        status: status || post.status,
        excerpt,
        authorId,
        metaTitle,
        metaDescription,
        featureImage,
        featureImageAlt,
        updatedAt: new Date(),
        packageIds: packageIds || [],
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Only update media if it has changed
    if (mediaChanged) {
      // Delete existing media relationships
      await prisma.postMedia.deleteMany({
        where: { postId: params.id },
      });

      // Create new media items
      if (mediaToUpdate.length > 0) {
        await prisma.postMedia.createMany({
          data: mediaToUpdate.map((item) => ({
            ...item,
            postId: params.id,
          })),
        });
      }
    }

    // Handle card blocks
    await prisma.postCardBlock.deleteMany({
      where: { postId: params.id },
    });

    if (cardBlocksToCreate.length > 0) {
      await prisma.postCardBlock.createMany({
        data: cardBlocksToCreate.map((block) => ({
          ...block,
          postId: params.id,
        })),
      });
    }

    // Fetch the complete updated post with all relationships
    const completePost = await prisma.post.findUnique({
      where: { id: params.id },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        media: true,
        cardBlocks: true,
      },
    });

    // Log the saved media items for debugging
    console.log(
      `API: Saved ${completePost?.media.length || 0} media items to database`
    );
    if (completePost?.media) {
      completePost.media.forEach((item: any, index: number) => {
        console.log(
          `API: Saved media #${index}: url=${item.url}, alt="${item.alt}"`
        );
      });
    }

    return Response.json(completePost);
  } catch (error) {
    console.error("Error updating post:", error);
    return Response.json({ error: "Failed to update post" }, { status: 500 });
  }
}

// DELETE /api/posts/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession();

    if (!session || !session.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
      });
    }

    // Get the post to check ownership
    const existingPost = await prisma.post.findUnique({
      where: { id: params.id },
      select: { authorId: true },
    });

    if (!existingPost) {
      return new Response(JSON.stringify({ error: "Post not found" }), {
        status: 404,
      });
    }

    // Check if user has permission to delete this post
    const isAdmin = session.user.role === "admin";
    const isEditor = session.user.role === "editor";
    const isAuthor = existingPost.authorId === session.user.id;

    if (!isAdmin && !isEditor && !isAuthor) {
      return new Response(
        JSON.stringify({
          error: "You don't have permission to delete this post",
        }),
        { status: 403 }
      );
    }

    // First, delete all related records
    await prisma.postMedia.deleteMany({
      where: { postId: params.id },
    });

    await prisma.postCardBlock.deleteMany({
      where: { postId: params.id },
    });

    // Then delete the post
    await prisma.post.delete({
      where: { id: params.id },
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting post:", error);
    return new Response(
      JSON.stringify({
        error: (error as Error).message || "Internal Server Error",
      }),
      { status: 500 }
    );
  }
}
