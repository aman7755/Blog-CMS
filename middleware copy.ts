import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(req: NextRequest) {
	const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
	const { pathname } = req.nextUrl;

	// Public routes that don't require authentication
	const publicRoutes = ['/login', '/register'];

	// Handle public routes
	if (publicRoutes.includes(pathname)) {
		// Redirect authenticated users to their respective dashboards
		if (token) {
			return redirectToUserDashboard(token, req.url);
		}
		return NextResponse.next();
	}

	// Protect all other routes - redirect to login if no token
	if (!token) {
		return NextResponse.redirect(new URL('/login', req.url));
	}

	// Redirect authenticated users from root to dashboard
	if (pathname === '/') {
		return NextResponse.redirect(new URL('/dashboard', req.url));
	}

	// Handle admin routes
	// if (pathname.startsWith('/admin')) {
	//     return token.role === 'Admin' ? NextResponse.next() : NextResponse.redirect(new URL('/', req.url));
	// }

	return NextResponse.next();
}

// Helper function to redirect users based on their role
function redirectToUserDashboard(token: any, baseUrl: string) {
	const dashboardUrls = {
		Admin: '/admin',
		Applicant: '/dashboard',
	};

	const redirectUrl = dashboardUrls[token.role as keyof typeof dashboardUrls] || '/';
	return NextResponse.redirect(new URL(redirectUrl, baseUrl));
}

export const config = {
	matcher: ['/((?!api|_next/static|_next/image|favicon.ico|public/|images/).*)'],
};
