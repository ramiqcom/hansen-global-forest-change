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

    // Request image from COG server
    const res = await fetch(`${process.env.COG_SERVER}${pathname}${search}`, { signal });

    // Check response
    if (res.ok) {
      const image = await res.arrayBuffer();

      // Return the image
      return new NextResponse(image, {
        status: 200,
        headers: { 'Content-Type': 'image/webp' },
      });
    } else {
      throw new Error(await res.text());
    }
  } catch ({ message }) {
    console.error(message);
    return new NextResponse(message, {
      status: 404,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
