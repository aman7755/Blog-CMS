// app/api/auth/[...nextauth]/route.ts
import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

// Initialize Prisma client
const prisma = new PrismaClient();

// Define PrismaUser interface matching your schema
interface PrismaUser {
    id: string;
    email: string;
    password: string;
    name: string | null;
    role: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

// Augment NextAuth types
declare module "next-auth" {
    interface User {
        id: string;
        email: string;
        name?: string | null;
        role: string;
        isActive: boolean;
    }

    interface Session {
        user: User;
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        id: string;
        email: string;
        name?: string | null;
        role: string;
        isActive: boolean;
    }
}

// Define auth options
export const authOptions: NextAuthOptions = {
    providers: [
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    return null;
                }

                const user = await prisma.user.findUnique({
                    where: { email: credentials.email },
                });

                if (!user || !user.password) {
                    return null;
                }

                const isValid = await bcrypt.compare(credentials.password, user.password);

                if (!isValid) {
                    return null;
                }

                const typedUser = user as unknown as PrismaUser;
                console.log("Auth - user found with role:", typedUser.role);

                // Return all required user properties
                return {
                    id: typedUser.id,
                    email: typedUser.email,
                    name: typedUser.name,
                    role: typedUser.role,
                    isActive: typedUser.isActive,
                };
            },
        }),
    ],
    pages: {
        signIn: "/login",
        signOut: "/login",
        error: "/login",
    },
    session: {
        strategy: "jwt",
        maxAge: 30 * 60, // 30 minutes
    },
    secret: process.env.NEXTAUTH_SECRET,
    callbacks: {
        async jwt({ token, user }) {
            // Initial sign-in: Populate token with user data
            if (user) {
                token.id = user.id;
                token.email = user.email;
                token.name = user.name ?? null; // Handle undefined name
                token.role = user.role;
                token.isActive = user.isActive;
                console.log("JWT - Initial token set from user:", token);
            } 
            // Token refresh: Ensure all properties persist
            else if (!token.role || typeof token.isActive === "undefined") {
                const dbUser = await prisma.user.findUnique({
                    where: { email: token.email },
                });
                if (dbUser) {
                    token.id = dbUser.id;
                    token.email = dbUser.email;
                    token.name = dbUser.name ?? null;
                    token.role = dbUser.role;
                    token.isActive = dbUser.isActive;
                    console.log("JWT - Refreshed token from DB:", token);
                }
            }
            return token;
        },
        async session({ session, token }) {
            // Populate session.user with all token properties
            if (token) {
                session.user = {
                    id: token.id,
                    email: token.email,
                    name: token.name ?? null,
                    role: token.role,
                    isActive: token.isActive,
                };
            }
            console.log("Session - Returning session:", session);
            return session;
        },
    },
};

// Export handlers
const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };