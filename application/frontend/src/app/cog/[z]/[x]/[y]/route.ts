import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  // Create an AbortController
  const controller = new AbortController();
  const signal = controller.signal;

  try {
    const { nextUrl } = req;
    const { pathname, search } = nextUrl;

    // Listen for request cancellation
    req.signal.addEventListener(
      'abort',
      () => {
        controller.abort();
      },
      { once: true },
    );

    const res = await fetch(`${process.env.COG_SERVER}${pathname}${search}`, { signal });

    if (res.ok) {
      const image = await res.arrayBuffer();

      // Return the image
      return new NextResponse(image, {
        status: 200,
        headers: { 'Content-Type': 'image/webp' },
      });
    } else {
      throw new Error((await res.json()).message);
    }
  } catch ({ name, message }) {
    // Handle abort specifically
    if (name === 'AbortError') {
      console.log('Request aborted by client');
      // Return 499 (Client Closed Request) - though Next.js might not send it
      return new NextResponse(null, { status: 499 });
    } else {
      console.error(message);
      return new NextResponse(message, { status: 404 });
    }
  }
}
