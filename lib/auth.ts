import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { compare } from 'bcrypt';
import { prisma } from '@/lib/prisma';

export const authOptions: NextAuthOptions = {
	secret: process.env.NEXTAUTH_SECRET,
	session: {
		strategy: 'jwt',
	},
	pages: {
		signIn: '/login',
	},
	providers: [
		CredentialsProvider({
			name: 'Credentials',
			credentials: {
				email: { label: 'Email', type: 'email' },
				password: { label: 'Password', type: 'password' },
			},
			async authorize(credentials) {
				if (!credentials?.email || !credentials?.password) {
					return null;
				}

				const user = await prisma.user.findUnique({
					where: {
						email: credentials.email,
					},
				});

				if (!user) {
					return null;
				}

				const isPasswordValid = await compare(credentials.password, user.password);

				if (!isPasswordValid) {
					return null;
				}

				return {
					id: user.id,
					email: user.email,
					name: user.name,
				};
			},
		}),
	],
	callbacks: {
		jwt: ({ token, user }) => {
			if (user) {
				// When user logs in, add isAdmin to token
				return {
					...token,
					id: user.id,
					isAdmin: true, // Add isAdmin to JWT token
				};
			}
			return token;
		},
		session: ({ session, token }) => {
			// Add isAdmin to session.user from token
			return {
				...session,
				user: {
					...session.user,
					id: token.id,
					isAdmin: token.isAdmin, // Include isAdmin in session.user
				},
			};
		},
	},
};
