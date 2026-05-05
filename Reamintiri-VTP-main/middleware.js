import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export function middleware(request) {
  const authCookie = cookies().get('auth')
  const isProtectedPath = !request.nextUrl.pathname.startsWith('/login') && !request.nextUrl.pathname.startsWith('/api')

  if (isProtectedPath && !authCookie) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|login).*)'],
}
