import { NextResponse } from 'next/server';
export async function GET() {
  const style = await (
    await fetch(
      `https://tiles.stadiamaps.com/styles/osm_bright/rendered.json?api_key=${process.env.STADIA_API_KEY}`,
    )
  ).json();
  return NextResponse.json(style, { status: 200 });
}
