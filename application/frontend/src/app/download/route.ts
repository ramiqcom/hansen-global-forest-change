import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const { nextUrl } = req;
    const { pathname, search } = nextUrl;

    const res = await fetch(`${process.env.COG_SERVER}${pathname}${search}`);

    if (res.ok) {
      const image = await res.arrayBuffer();

      // Return the image
      return new NextResponse(image, {
        status: 200,
        headers: { 'Content-Type': 'image/tiff' },
      });
    } else {
      throw new Error((await res.json()).message);
    }
  } catch ({ message }) {
    console.error(message);
    return new NextResponse(message, { status: 404 });
  }
}
