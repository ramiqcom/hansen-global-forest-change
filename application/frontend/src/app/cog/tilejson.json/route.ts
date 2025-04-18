import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const { nextUrl } = req;
    const { search, searchParams } = nextUrl;

    const tilejson = {
      tilejson: '3.0.0',
      tiles: [`/cog/{z}/{x}/{y}${search}`],
      bounds: [-180.0, -85.05112877980659, 180.0, 85.0511287798066],
      center: [0.0, 0.0, 0],
      minzoom: 0,
      maxzoom: 20,
      scheme: 'xyz',
      name: searchParams.get('layer'),
      attribution: '',
    };

    // Return the image
    return NextResponse.json(tilejson, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch ({ message }) {
    console.error(message);
    return new NextResponse(message, { status: 404 });
  }
}
