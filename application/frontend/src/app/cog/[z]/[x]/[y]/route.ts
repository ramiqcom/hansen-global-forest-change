import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const { nextUrl } = req;
    const { pathname, search } = nextUrl;
    const res = await fetch(`${process.env.COG_SERVER}${pathname}${search}`);
    const image = await res.arrayBuffer();

    // Return the image
    return new NextResponse(image, {
      status: 200,
      headers: { 'Content-Type': 'image/webp' },
    });
  } catch ({ message }) {
    console.error(message);
    return new NextResponse(message, { status: 404 });
  }
}
