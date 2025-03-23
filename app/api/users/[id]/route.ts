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
    "GET, PATCH, OPTIONS"
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

// GET handler to fetch a specific user
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    // Check if user is authenticated and has admin role
    if (!session) {
      return corsHeaders(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      );
    }

    const user = await prisma.user.findUnique({
      where: {
        id: params.id,
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        role: true,
        isActive: true,
      },
    });

    if (!user) {
      return corsHeaders(
        NextResponse.json({ error: "User not found" }, { status: 404 })
      );
    }

    return corsHeaders(NextResponse.json(user));
  } catch (error) {
    console.error('Error fetching user:', error);
    return corsHeaders(
      NextResponse.json({ error: (error as Error).message }, { status: 500 })
    );
  }
}

// PATCH handler to update a specific user
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    // Check if user is authenticated
    if (!session || !session.user) {
      return corsHeaders(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      );
    }

    console.log("Update user - Session data:", JSON.stringify(session.user, null, 2));

    // Check if admin role is in session
    let isAdmin = session.user.role === "admin";
    
    // If no role in session, check database
    if (!isAdmin) {
      const currentUser = await prisma.user.findUnique({
        where: { email: session.user.email },
      });
      
      console.log("Database user for admin check:", JSON.stringify(currentUser, null, 2));
      isAdmin = currentUser?.role === "admin";
    }

    // Only admins can update users
    if (!isAdmin) {
      return corsHeaders(
        NextResponse.json({ error: "Forbidden: Requires admin role" }, { status: 403 })
      );
    }

    const body = await request.json();
    const { role, isActive } = body;

    // Validate input
    if (role && !["admin", "editor", "author"].includes(role)) {
      return corsHeaders(
        NextResponse.json({ error: "Invalid role specified" }, { status: 400 })
      );
    }

    if (isActive !== undefined && typeof isActive !== "boolean") {
      return corsHeaders(
        NextResponse.json({ error: "isActive must be a boolean" }, { status: 400 })
      );
    }

    // Get the user to update
    const userToUpdate = await prisma.user.findUnique({
      where: { id: params.id },
    });

    if (!userToUpdate) {
      return corsHeaders(
        NextResponse.json({ error: "User not found" }, { status: 404 })
      );
    }

    // Prevent self-demotion from admin role
    if (
      session.user.email === userToUpdate.email &&
      userToUpdate.role === "admin" && 
      role && 
      role !== "admin"
    ) {
      return corsHeaders(
        NextResponse.json({ 
          error: "Admins cannot demote themselves" 
        }, { status: 400 })
      );
    }

    // Update the user
    const updatedUser = await prisma.user.update({
      where: { id: params.id },
      data: {
        ...(role && { role }),
        ...(isActive !== undefined && { isActive }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return corsHeaders(NextResponse.json(updatedUser));
  } catch (error) {
    console.error('Error updating user:', error);
    return corsHeaders(
      NextResponse.json({ error: (error as Error).message }, { status: 500 })
    );
  }
} 